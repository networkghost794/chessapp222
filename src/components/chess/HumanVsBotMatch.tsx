import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chess, type Color, type PieceSymbol, type Square } from "chess.js";
import { Board } from "./Board";
import { PromotionDialog } from "./PromotionDialog";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Flag, FlipHorizontal2, User } from "lucide-react";
import { TitleBadge } from "./ChessApp";
import { cn } from "@/lib/utils";
import {
  chooseBotMove,
  pickThinkingDelayMs,
  type BotConfig,
} from "@/lib/botStore";
import { playMoveResultSound } from "@/lib/sounds";
import type { MatchResult } from "./BotVsBotMode";
import { SimulatorLegend } from "./SimulatorLegend";
import { evaluatePerspective, type MoveVerdict } from "@/lib/perspectiveEval";
import { botDisplayIdentity, useImmersive } from "@/lib/immersive";

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
}: {
  bot: BotConfig;
  player: PlayerProfileLite;
  playerColor: Color;
  headerExtra?: React.ReactNode;
  onFinished: (r: MatchResult) => void;
  /** When set, shows "Play Through Their Eyes" move indicators for this rating. */
  perspectiveRating?: number;
}) {
  const gameRef = useRef(new Chess());
  const game = gameRef.current;

  const [immersive] = useImmersive();
  const botId = botDisplayIdentity(bot, immersive);

  const [flipped, setFlipped] = useState(playerColor === "b");
  const [history, setHistory] = useState<string[]>([]);
  const [lastMove, setLastMove] = useState<{ from: Square; to: Square } | null>(null);
  const [pending, setPending] = useState(false);
  const [promotion, setPromotion] = useState<{ from: Square; to: Square } | null>(null);
  const [resigned, setResigned] = useState(false);
  const [indicators, setIndicators] = useState<Record<string, MoveVerdict> | null>(null);
  const [bestFrom, setBestFrom] = useState<string | null>(null);
  const [, setTick] = useState(0);
  const force = useCallback(() => setTick((t) => t + 1), []);
  const finishedRef = useRef(false);


  const requestBotMove = useCallback(async () => {
    if (game.isGameOver()) { setPending(false); return; }
    const startedAt = Date.now();
    try {
      const result = await chooseBotMove(game, bot);
      if (!result) { setPending(false); return; }
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
    } finally {
      setPending(false);
    }
  }, [game, bot, force]);

  // If the bot moves first.
  useEffect(() => {
    if (playerColor === "b") {
      setPending(true);
      const t = setTimeout(() => requestBotMove(), 250);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        setPending(true);
        setTimeout(() => requestBotMove(), 250);
      }
      return true;
    },
    [game, force, requestBotMove],
  );

  const handleAttemptMove = useCallback(
    (from: Square, to: Square) => {
      if (pending || resigned || game.isGameOver()) return false;
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
      if (isPromotion) { setPromotion({ from, to }); return true; }
      return finishMove(from, to);
    },
    [game, pending, resigned, playerColor, finishMove],
  );

  // Report outcome exactly once.
  useEffect(() => {
    if (finishedRef.current) return;
    if (!game.isGameOver() && !resigned) return;
    finishedRef.current = true;
    let winner: MatchResult["winner"] = "draw";
    let reason = "Draw";
    if (resigned) {
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
    onFinished({ winner, reason, history: [...history] });
  }, [history.length, resigned, game, playerColor, onFinished, history]);

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
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perspectiveRating, pending, resigned, history.length, playerColor]);

  const moveRows = useMemo(() => {
    const rows: Array<{ n: number; w: string; b?: string }> = [];
    for (let i = 0; i < history.length; i += 2) rows.push({ n: i / 2 + 1, w: history[i], b: history[i + 1] });
    return rows;
  }, [history]);

  const statusText = useMemo(() => {
    if (game.isCheckmate()) return `Checkmate — ${game.turn() === "w" ? botId.name : "You"} loses`;
    if (game.isDraw()) return "Draw";
    if (resigned) return "You resigned";
    if (game.inCheck()) return `${game.turn() === playerColor ? "You are" : botId.name + " is"} in check`;
    return `${game.turn() === playerColor ? "Your" : botId.name + "'s"} move`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history.length, game, botId.name, playerColor, resigned]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] gap-6">
      <section className="space-y-3 min-w-0">
        {headerExtra}
        <ParticipantHeader
          name={botId.name}
          avatar={bot.avatar ?? null}
          elo={bot.elo}
          title={botId.title}
          titleColor={botId.titleColor}
          side={playerColor === "w" ? "Black" : "White"}
        />

        <Card className="p-4 md:p-5 bg-card min-w-0">
          <div className="flex items-center justify-between mb-3 gap-2">
            <div className="text-sm font-medium truncate">{statusText}</div>
            <div className="flex items-center gap-2 shrink-0">
              {pending && <div className="text-xs text-muted-foreground">Bot thinking…</div>}
              <Button variant="ghost" size="sm" onClick={() => setFlipped((f) => !f)}>
                <FlipHorizontal2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
          <div className="mx-auto w-full max-w-[calc(min(65vh,560px)*var(--board-scale,1))]">
            <Board
              game={game}
              flipped={flipped}
              disabled={pending || resigned || game.isGameOver()}
              lastMove={lastMove}
              onAttemptMove={handleAttemptMove}
              indicators={indicators}
              bestFrom={bestFrom}
            />
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
        />
      </section>

      <aside className="flex flex-col gap-3">
        <Card className="bg-card p-3 flex-1 min-h-[220px]">
          <div className="text-sm font-semibold mb-2 px-1">Moves</div>
          <div className="max-h-[440px] overflow-auto scroll-thin rounded-md">
            {moveRows.length === 0 ? (
              <div className="text-xs text-muted-foreground px-2 py-4">No moves yet.</div>
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {moveRows.map((r) => (
                    <tr key={r.n} className="odd:bg-secondary/30">
                      <td className="px-2 py-1 text-muted-foreground w-8 text-xs">{r.n}.</td>
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
          className="w-full font-bold"
        >
          <Flag className="w-4 h-4 mr-2" /> Resign
        </Button>
      </aside>

      <PromotionDialog
        open={!!promotion}
        color={playerColor}
        onSelect={(p) => {
          if (promotion) { finishMove(promotion.from, promotion.to, p); setPromotion(null); }
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
}: {
  name: string;
  avatar: string | null;
  elo: number;
  title?: string | null;
  titleColor?: string | null;
  side: string;
}) {
  return (
    <Card className={cn("bg-card p-3 flex items-center gap-3")}>
      <div className="w-11 h-11 rounded-full bg-secondary grid place-items-center overflow-hidden shrink-0 ring-1 ring-primary/40">
        {avatar ? (
          <img src={avatar} alt={name} className="w-full h-full object-cover" />
        ) : (
          <User className="w-5 h-5 text-muted-foreground" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold truncate inline-flex items-center gap-2">
          <TitleBadge title={title} color={titleColor} size="sm" />
          <span className="truncate">{name}</span>
          <span className="text-muted-foreground/70 font-normal">({elo})</span>
        </div>
      </div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground shrink-0">{side}</div>
    </Card>
  );
}
