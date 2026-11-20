import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chess, type Color, type PieceSymbol, type Square } from "chess.js";
import { Board } from "./Board";
import { PromotionDialog } from "./PromotionDialog";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Flag, FlipHorizontal2, Hand, Timer, User } from "lucide-react";
import { TitleBadge } from "./ChessApp";
import { cn } from "@/lib/utils";
import { chooseBotMove, pickThinkingDelayMs, type BotConfig } from "@/lib/botStore";
import { playClockClickSound, playMoveResultSound } from "@/lib/sounds";
import type { MatchResult } from "./BotVsBotMode";
import { SimulatorLegend } from "./SimulatorLegend";
import { evaluatePerspective, type MoveVerdict } from "@/lib/perspectiveEval";
import { botDisplayIdentity, useImmersive } from "@/lib/immersive";
import { EvaluationBar } from "./EvaluationBar";
import { evaluatePosition, type PositionEval } from "@/lib/stockfishEval";
import { BoardScaleControl, BoardViewToggle, TheaterToggleButton } from "./BoardScaleControl";
import { getTimeControlFromSettings, useSettings } from "@/lib/settings";
import { useChessClock } from "@/lib/useChessClock";
import { MatchClockBadge } from "./MatchClockBadge";
import { useAuth } from "@/lib/useAuth";
import { recordFinishedGame } from "@/lib/gameHistory";

export type PlayerProfileLite = {
  name: string;
  avatar: string | null;
  elo: number;
  title?: string | null;
  titleColor?: string | null;
};

/**
 * Compact Human vs Bot match used inside tournaments.
 * Reuses the same engine pipeline (chooseBotMove, openings, thinking time).
 */
export function HumanVsBotMatch({
  bot,
  player,
  playerColor,
  headerExtra,
  onFinished,
  perspectiveRating,
  showEval,
}: {
  bot: BotConfig;
  player: PlayerProfileLite;
  playerColor: Color;
  headerExtra?: React.ReactNode;
  onFinished: (r: MatchResult) => void;
  /** When set, shows "Play Through Their Eyes" move indicators for this rating. */
  perspectiveRating?: number;
  showEval?: boolean;
}) {
  const { profile } = useAuth();
  const gameRef = useRef(new Chess());
  const game = gameRef.current;

  const [immersive] = useImmersive();
  const [settings, updateSetting] = useSettings();
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const botId = botDisplayIdentity(bot, immersive);

  const [flipped, setFlipped] = useState(playerColor === "b");
  const [history, setHistory] = useState<string[]>([]);
  const [lastMove, setLastMove] = useState<{ from: Square; to: Square } | null>(null);
  const [pending, setPending] = useState(false);
  const [promotion, setPromotion] = useState<{ from: Square; to: Square } | null>(null);
  const [resigned, setResigned] = useState(false);
  const [awaitingClockPunch, setAwaitingClockPunch] = useState(false);
  const botPunchTimerRef = useRef<number | null>(null);
  const [indicators, setIndicators] = useState<Record<string, MoveVerdict> | null>(null);
  const [bestFrom, setBestFrom] = useState<string | null>(null);
  const [, setTick] = useState(0);
  const force = useCallback(() => setTick((t) => t + 1), []);
  const finishedRef = useRef(false);

  const timeControl = useMemo(
    () => getTimeControlFromSettings(settings),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [settings.timeControlBaseMinutes, settings.timeControlIncrementSeconds],
  );
  const clock = useChessClock(timeControl, {
    enabled: !game.isGameOver() && !resigned && !finishedRef.current,
    running: history.length > 0,
  });

  useEffect(() => {
    return () => {
      if (botPunchTimerRef.current !== null) {
        window.clearTimeout(botPunchTimerRef.current);
      }
    };
  }, []);

  // Live evaluation (Stockfish).
  const [evalData, setEvalData] = useState<PositionEval | null>(null);
  const [evalLoading, setEvalLoading] = useState(false);
  const [isTheater, setIsTheater] = useState(false);

  const isPlayerTurn = game.turn() === playerColor;
  // If player joins, when it's player's turn the bar turns off automatically;
  // when it's the bot's turn (or bot vs bot), it turns back on.
  const showEvalVisible = Boolean(showEval && !isPlayerTurn && !game.isGameOver());

  useEffect(() => {
    if (!showEval) return;
    if (game.isGameOver()) return;
    setEvalLoading(true);
    let stale = false;
    evaluatePosition(game.fen()).then((res) => {
      if (stale) return;
      if (res) setEvalData(res);
      setEvalLoading(false);
    });
    return () => {
      stale = true;
    };
  }, [showEval, history.length, game]);

  const movesContainerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (movesContainerRef.current) {
      movesContainerRef.current.scrollTop = movesContainerRef.current.scrollHeight;
    }
  }, [history.length]);

  const requestBotMove = useCallback(async () => {
    if (game.isGameOver()) {
      setPending(false);
      return;
    }
    const startedAt = Date.now();
    try {
      const result = await chooseBotMove(game, bot);
      if (!result) {
        setPending(false);
        return;
      }
      const targetMs = pickThinkingDelayMs(bot);
      const elapsed = Date.now() - startedAt;
      if (elapsed < targetMs) await new Promise((r) => setTimeout(r, targetMs - elapsed));
      const pick = result.move;
      const m = game.move({
        from: pick.from as Square,
        to: pick.to as Square,
        promotion: pick.promotion as "q" | "r" | "b" | "n" | undefined,
      });
      if (!m) return;
      playMoveResultSound(m);
      setHistory((h) => [...h, m.san]);
      setLastMove({ from: pick.from as Square, to: pick.to as Square });
      force();

      if (!game.isGameOver()) {
        if (botPunchTimerRef.current !== null) {
          window.clearTimeout(botPunchTimerRef.current);
          botPunchTimerRef.current = null;
        }
        if (settingsRef.current.manualClockPunch) {
          botPunchTimerRef.current = window.setTimeout(() => {
            botPunchTimerRef.current = null;
            playClockClickSound();
            clock.commitMoveOnClock(m.color);
          }, 200);
        } else {
          clock.commitMoveOnClock(m.color);
          if (settingsRef.current.immersive3D) playClockClickSound();
        }
      }
    } finally {
      setPending(false);
    }
  }, [game, bot, force, clock]);

  // If the bot moves first.
  useEffect(() => {
    if (playerColor === "b") {
      setPending(true);
      const t = setTimeout(() => requestBotMove(), 250);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePunchClock = useCallback(() => {
    if (!awaitingClockPunch || game.isGameOver() || resigned || clock.timedOutSide) return;
    playClockClickSound();
    setAwaitingClockPunch(false);
    clock.commitMoveOnClock(playerColor);
    setPending(true);
    setTimeout(() => requestBotMove(), 180);
  }, [awaitingClockPunch, game, resigned, clock, playerColor, requestBotMove]);

  useEffect(() => {
    if (!settings.manualClockPunch && awaitingClockPunch) {
      handlePunchClock();
    }
  }, [settings.manualClockPunch, awaitingClockPunch, handlePunchClock]);

  useEffect(() => {
    if (!awaitingClockPunch || promotion || resigned || clock.timedOutSide || game.isGameOver()) {
      return;
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable) {
        return;
      }
      e.preventDefault();
      handlePunchClock();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [awaitingClockPunch, promotion, resigned, clock.timedOutSide, game, handlePunchClock]);

  const finishMove = useCallback(
    (from: Square, to: Square, promo?: PieceSymbol) => {
      const m = game.move({ from, to, promotion: promo as "q" | "r" | "b" | "n" | undefined });
      if (!m) return false;
      playMoveResultSound(m);
      setHistory((h) => [...h, m.san]);
      setLastMove({ from, to });
      setIndicators(null);
      force();
      if (!game.isGameOver()) {
        if (settingsRef.current.manualClockPunch) {
          setAwaitingClockPunch(true);
        } else {
          clock.commitMoveOnClock(m.color);
          if (settingsRef.current.immersive3D) playClockClickSound();
          setPending(true);
          setTimeout(() => requestBotMove(), 250);
        }
      }
      return true;
    },
    [game, force, requestBotMove, clock],
  );

  const handleAttemptMove = useCallback(
    (from: Square, to: Square) => {
      if (pending || resigned || awaitingClockPunch || clock.timedOutSide || game.isGameOver()) {
        return false;
      }
      if (game.turn() !== playerColor) return false;
      const piece = game.get(from);
      if (!piece || piece.color !== playerColor) return false;
      const isPromotion =
        piece.type === "p" &&
        ((piece.color === "w" && to[1] === "8") || (piece.color === "b" && to[1] === "1"));
      const legal = (game.moves({ square: from, verbose: true }) as Array<{ to: string }>).some(
        (m) => m.to === to,
      );
      if (!legal) return false;
      if (isPromotion) {
        setPromotion({ from, to });
        return true;
      }
      return finishMove(from, to);
    },
    [game, pending, resigned, awaitingClockPunch, clock.timedOutSide, playerColor, finishMove],
  );

  // Report outcome exactly once.
  useEffect(() => {
    if (finishedRef.current) return;
    const timedOut = clock.timedOutSide;
    if (!game.isGameOver() && !resigned && !timedOut) return;
    finishedRef.current = true;
    setPending(false);
    setAwaitingClockPunch(false);
    setPromotion(null);
    if (botPunchTimerRef.current !== null) {
      window.clearTimeout(botPunchTimerRef.current);
      botPunchTimerRef.current = null;
    }

    let winner: MatchResult["winner"] = "draw";
    let reason = "Draw";
    if (timedOut) {
      winner = timedOut === "w" ? "black" : "white";
      reason = "Time Out";
    } else if (resigned) {
      winner = playerColor === "w" ? "black" : "white";
      reason = "Player resigned";
    } else if (game.isCheckmate()) {
      winner = game.turn() === "w" ? "black" : "white";
      reason = "Checkmate";
    } else if (game.isStalemate()) reason = "Stalemate";
    else if (game.isThreefoldRepetition()) reason = "Threefold repetition";
    else if (game.isInsufficientMaterial()) reason = "Insufficient material";
    else if (game.isDrawByFiftyMoves?.()) reason = "Fifty-move rule";
    else if (game.isDraw()) reason = "Draw";
    const pgnText = game.pgn();
    const fenText = game.fen();
    if (profile) {
      const userOutcome: "win" | "loss" | "draw" =
        winner === "draw"
          ? "draw"
          : (winner === "white" && playerColor === "w") ||
              (winner === "black" && playerColor === "b")
            ? "win"
            : "loss";
      recordFinishedGame({
        profile,
        bot,
        playerColor,
        userOutcome,
        moves: Math.max(1, Math.ceil(history.length / 2)),
        pgn: pgnText,
        finalFen: fenText,
        terminationReason: reason,
      });
    }
    onFinished({ winner, reason, history: [...history], pgn: pgnText, finalFen: fenText });
  }, [
    history.length,
    resigned,
    clock.timedOutSide,
    game,
    playerColor,
    onFinished,
    history,
    bot,
    profile,
  ]);

  // Perspective indicators: recompute whenever it becomes the player's turn.
  useEffect(() => {
    if (!perspectiveRating) return;
    if (pending || resigned || game.isGameOver() || game.turn() !== playerColor) {
      setIndicators(null);
      setBestFrom(null);
      return;
    }
    let cancelled = false;
    const fen = game.fen();
    void evaluatePerspective(fen, perspectiveRating).then((res) => {
      if (cancelled) return;
      setIndicators(res.bySquare as Record<string, MoveVerdict>);
      const bestKey = Object.entries(res.byMove).find(([, v]) => v === "purple")?.[0] ?? null;
      setBestFrom(bestKey ? bestKey.slice(0, 2) : null);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perspectiveRating, pending, resigned, history.length, playerColor]);

  const moveRows = useMemo(() => {
    const rows: Array<{ n: number; w: string; b?: string }> = [];
    for (let i = 0; i < history.length; i += 2)
      rows.push({ n: i / 2 + 1, w: history[i], b: history[i + 1] });
    return rows;
  }, [history]);

  const statusText = useMemo(() => {
    if (clock.timedOutSide) {
      return `Time Out — ${clock.timedOutSide === "w" ? "Black" : "White"} wins`;
    }
    if (awaitingClockPunch) return "Move played — hit the clock to end your turn";
    if (game.isCheckmate()) return `Checkmate — ${game.turn() === "w" ? botId.name : "You"} loses`;
    if (game.isDraw()) return "Draw";
    if (resigned) return "You resigned";
    if (game.inCheck())
      return `${game.turn() === playerColor ? "You are" : botId.name + " is"} in check`;
    return `${game.turn() === playerColor ? "Your" : botId.name + "'s"} move`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    history.length,
    game,
    botId.name,
    playerColor,
    resigned,
    awaitingClockPunch,
    clock.timedOutSide,
  ]);

  const botColor: Color = playerColor === "w" ? "b" : "w";
  const playerMs = playerColor === "w" ? clock.whiteMs : clock.blackMs;
  const botMs = botColor === "w" ? clock.whiteMs : clock.blackMs;
  const isOver = game.isGameOver() || resigned || !!clock.timedOutSide;

  return (
    <div
      className={cn(
        "grid gap-4 lg:gap-6 items-start",
        isTheater ? "grid-cols-1" : "grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px]",
      )}
    >
      <section className="space-y-2 min-w-0">
        {headerExtra}
        <ParticipantHeader
          name={botId.name}
          avatar={bot.avatar ?? null}
          elo={bot.elo}
          title={botId.title}
          titleColor={botId.titleColor}
          side={playerColor === "w" ? "Black" : "White"}
          clockSlot={
            <MatchClockBadge ms={botMs} active={!isOver && clock.activeSide === botColor} />
          }
        />

        <Card className="p-3 md:p-4 bg-card min-w-0">
          <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
            <div className="text-xs md:text-sm font-medium truncate">{statusText}</div>
            <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
              {pending && (
                <div className="text-xs text-muted-foreground animate-pulse">Bot thinking…</div>
              )}
              {showEval && isPlayerTurn && !game.isGameOver() && (
                <span className="text-[10px] text-muted-foreground/80 font-mono hidden sm:inline">
                  Eval hidden (your turn)
                </span>
              )}
              {awaitingClockPunch && (
                <Button
                  type="button"
                  size="sm"
                  onClick={handlePunchClock}
                  className="h-7 px-3 gap-1.5 text-xs font-extrabold bg-amber-500 hover:bg-amber-400 text-zinc-950 shadow-sm"
                >
                  <Hand className="w-3.5 h-3.5" />
                  <span>Hit Clock (Space)</span>
                </Button>
              )}
              <BoardScaleControl />
              <Button
                variant={settings.manualClockPunch ? "secondary" : "ghost"}
                size="sm"
                className={cn(
                  "h-7 px-2 gap-1 text-[11px] font-medium",
                  settings.manualClockPunch && "border border-amber-500/50 text-amber-300",
                )}
                onClick={() => updateSetting("manualClockPunch", !settings.manualClockPunch)}
                title="Toggle Press the Clock Myself mode"
              >
                <Timer className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Manual Clock</span>
              </Button>
              <BoardViewToggle />
              <TheaterToggleButton active={isTheater} onToggle={() => setIsTheater((t) => !t)} />
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => setFlipped((f) => !f)}
                title="Flip board"
                aria-label="Flip board"
              >
                <FlipHorizontal2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
          <div
            className={cn(
              "mx-auto w-full flex gap-3 items-stretch",
              isTheater
                ? "max-w-none"
                : settings.immersive3D
                  ? "max-w-[calc(min(90vh,1120px)*var(--board-scale,1))]"
                  : "max-w-[calc(min(60vh,540px)*var(--board-scale,1))]",
            )}
          >
            {showEval && (
              <div className="flex items-stretch">
                {showEvalVisible ? (
                  <EvaluationBar evalData={evalData} loading={evalLoading} />
                ) : (
                  <div
                    className="w-6 self-stretch rounded-md border border-dashed border-border/40 bg-secondary/15 flex items-center justify-center"
                    title="Evaluation bar automatically hidden during player's turn"
                  >
                    <span className="text-[9px] text-muted-foreground/60 rotate-90 select-none font-mono">
                      PAUSED
                    </span>
                  </div>
                )}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <Board
                game={game}
                flipped={flipped}
                disabled={pending || awaitingClockPunch || isOver}
                lastMove={lastMove}
                onAttemptMove={handleAttemptMove}
                activeSide={clock.activeSide}
                whiteTimeMs={clock.whiteMs}
                blackTimeMs={clock.blackMs}
                activeClockSide={clock.activeSide}
                playerSide={playerColor}
                needsClockPunch={awaitingClockPunch}
                onClockPunch={handlePunchClock}
                indicators={indicators}
                bestFrom={bestFrom}
                isTheater={isTheater}
                onToggleTheater={() => setIsTheater((t) => !t)}
              />
            </div>
          </div>
        </Card>

        {perspectiveRating != null && <SimulatorLegend label={`${perspectiveRating} Elo`} />}

        <ParticipantHeader
          name={player.name}
          avatar={player.avatar}
          elo={player.elo}
          title={player.title}
          titleColor={player.titleColor}
          side={playerColor === "w" ? "White" : "Black"}
          clockSlot={
            <MatchClockBadge
              ms={playerMs}
              active={!isOver && clock.activeSide === playerColor}
              needsPunch={awaitingClockPunch}
            />
          }
        />
      </section>

      <aside
        className={cn(
          "flex flex-col h-full min-h-[360px] self-stretch gap-3",
          isTheater ? "max-h-[420px]" : "max-h-[calc(min(60vh,540px)+80px)]",
        )}
      >
        <Card className="bg-card p-3 flex-1 flex flex-col min-h-[300px] overflow-hidden">
          <div className="text-xs font-semibold uppercase tracking-wide mb-2 px-1">Moves</div>
          <div
            ref={movesContainerRef}
            className="flex-1 overflow-y-auto scroll-thin rounded-md border border-border/30"
          >
            {moveRows.length === 0 ? (
              <div className="text-xs text-muted-foreground px-2 py-4">No moves yet.</div>
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {moveRows.map((r) => (
                    <tr key={r.n} className="odd:bg-secondary/30">
                      <td className="px-2 py-1 text-muted-foreground w-8 text-xs font-mono">
                        {r.n}.
                      </td>
                      <td className="px-2 py-1 font-mono">{r.w}</td>
                      <td className="px-2 py-1 font-mono text-muted-foreground">{r.b ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Card>
        <Button
          onClick={() => setResigned(true)}
          variant="destructive"
          disabled={game.isGameOver() || resigned || moveRows.length === 0}
          className="w-full font-bold h-9 text-xs"
        >
          <Flag className="w-3.5 h-3.5 mr-1.5" /> Resign
        </Button>
      </aside>

      <PromotionDialog
        open={!!promotion}
        color={playerColor}
        onSelect={(p) => {
          if (promotion) {
            finishMove(promotion.from, promotion.to, p);
            setPromotion(null);
          }
        }}
      />
    </div>
  );
}

function ParticipantHeader({
  name,
  avatar,
  elo,
  title,
  titleColor,
  side,
  clockSlot,
}: {
  name: string;
  avatar: string | null;
  elo: number;
  title?: string | null;
  titleColor?: string | null;
  side: string;
  clockSlot?: React.ReactNode;
}) {
  const isWhite = side === "White";
  return (
    <Card className="bg-card/90 py-1.5 px-3 flex items-center gap-2.5 rounded-lg border border-border/60">
      <div className="w-8 h-8 rounded-full bg-secondary grid place-items-center overflow-hidden shrink-0 ring-1 ring-primary/40">
        {avatar ? (
          <img src={avatar} alt={name} className="w-full h-full object-cover" />
        ) : (
          <User className="w-4 h-4 text-muted-foreground" />
        )}
      </div>
      <div className="flex-1 min-w-0 flex items-center gap-2">
        <div className="text-xs font-bold truncate inline-flex items-center gap-1.5 min-w-0">
          <TitleBadge title={title} color={titleColor} size="sm" />
          <span className="truncate">{name}</span>
        </div>
        <span className="text-[10px] text-muted-foreground/80 shrink-0 font-mono">({elo})</span>
      </div>
      <div className="flex items-center gap-1.5 shrink-0 px-2 py-0.5 rounded-md bg-secondary/60">
        <span
          className={cn(
            "w-2.5 h-2.5 rounded-full ring-1 ring-border/80",
            isWhite ? "bg-white" : "bg-zinc-900",
          )}
        />
        <span className="text-[10px] font-semibold uppercase tracking-wider">{side}</span>
      </div>
      {clockSlot}
    </Card>
  );
}
