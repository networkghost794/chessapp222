import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chess, type Square } from "chess.js";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  FlipHorizontal2,
  Play,
  RotateCcw,
  Swords,
  User,
  X,
  Rabbit,
  Turtle,
  Zap,
} from "lucide-react";
import { Board } from "./Board";
import { TitleBadge } from "./ChessApp";
import { botDisplayIdentity, isImmersiveEnabled } from "@/lib/immersive";
import { cn } from "@/lib/utils";
import {
  BOT_CATEGORIES,
  chooseBotMove,
  loadBots,
  pickOpeningForBot,
  pickThinkingDelayMs,
  subscribeBots,
  type BotConfig,
} from "@/lib/botStore";
import type { OpeningDef } from "@/lib/openingLibrary";
import { playMoveResultSound } from "@/lib/sounds";
import { EvaluationBar } from "./EvaluationBar";
import { evaluatePosition, type PositionEval } from "@/lib/stockfishEval";
import { PositionEditor } from "./PositionEditor";
import { Switch } from "@/components/ui/switch";

/* ───────── Speed control ───────── */

export type SpeedSetting = "slow" | "normal" | "fast";

export const SPEED_RANGES: Record<SpeedSetting, { min: number; max: number }> = {
  slow: { min: 7000, max: 8000 },
  normal: { min: 3000, max: 4000 },
  fast: { min: 1000, max: 2000 },
};

export function resolveDelayMs(bot: BotConfig, speed: SpeedSetting | null): number {
  if (!speed) return pickThinkingDelayMs(bot);
  const { min, max } = SPEED_RANGES[speed];
  return Math.floor(min + Math.random() * (max - min));
}

export function SpeedSelector({
  value,
  onChange,
  className,
}: {
  value: SpeedSetting;
  onChange: (v: SpeedSetting) => void;
  className?: string;
}) {
  const opts: { key: SpeedSetting; label: string; sub: string; icon: React.ReactNode }[] = [
    { key: "slow", label: "Slow", sub: "7–8s / move", icon: <Turtle className="w-4 h-4" /> },
    { key: "normal", label: "Normal", sub: "3–4s / move", icon: <Zap className="w-4 h-4" /> },
    { key: "fast", label: "Fast", sub: "1–2s / move", icon: <Rabbit className="w-4 h-4" /> },
  ];
  return (
    <div className={cn("grid grid-cols-3 gap-2", className)}>
      {opts.map((o) => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          className={cn(
            "flex flex-col items-center gap-1 rounded-lg py-3 px-2 border text-center transition-colors",
            value === o.key
              ? "bg-primary/15 border-primary/50 text-primary"
              : "bg-secondary/30 border-transparent hover:bg-secondary/60",
          )}
        >
          <div className="flex items-center gap-1.5 text-sm font-semibold">{o.icon}{o.label}</div>
          <div className="text-[10px] text-muted-foreground">{o.sub}</div>
        </button>
      ))}
    </div>
  );
}

/* ───────── Bot vs Bot single-match mode ───────── */

type Stage = "select" | "vs" | "match";

export function BotVsBotMode({ onBack }: { onBack?: () => void }) {
  const [bots, setBots] = useState<BotConfig[]>([]);
  useEffect(() => {
    setBots(loadBots());
    return subscribeBots(() => setBots(loadBots()));
  }, []);

  const [botA, setBotA] = useState<BotConfig | null>(null);
  const [botB, setBotB] = useState<BotConfig | null>(null);
  const [speed, setSpeed] = useState<SpeedSetting>("normal");
  const [showEval, setShowEval] = useState(true);
  const [gameType, setGameType] = useState<"standard" | "custom">("standard");
  const [customFen, setCustomFen] = useState<string | null>(null);
  const [editingPosition, setEditingPosition] = useState(false);
  const [stage, setStage] = useState<Stage>("select");

  useEffect(() => {
    if (botA && !bots.find((b) => b.id === botA.id)) setBotA(null);
    if (botB && !bots.find((b) => b.id === botB.id)) setBotB(null);
  }, [bots, botA, botB]);

  const start = useCallback(() => {
    if (!botA || !botB) return;
    if (gameType === "custom" && !customFen) return;
    setStage("vs");
  }, [botA, botB, gameType, customFen]);

  useEffect(() => {
    if (stage !== "vs") return;
    const t = setTimeout(() => setStage("match"), 1200);
    return () => clearTimeout(t);
  }, [stage]);

  if (stage === "match" && botA && botB) {
    return (
      <BotVsBotMatch
        white={botA}
        black={botB}
        speed={speed}
        showEval={showEval}
        startFen={gameType === "custom" ? customFen : null}
        onExit={() => { setStage("select"); }}
      />
    );
  }

  if (editingPosition) {
    return (
      <div className="max-w-[1200px] mx-auto space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="text-lg font-bold">Custom Position</div>
          <Button variant="ghost" size="sm" onClick={() => setEditingPosition(false)}>
            <ArrowLeft className="w-4 h-4 mr-1.5" /> Back to setup
          </Button>
        </div>
        <PositionEditor
          onCancel={() => setEditingPosition(false)}
          onConfirm={(fen) => { setCustomFen(fen); setEditingPosition(false); }}
        />
      </div>
    );
  }

  return (
    <div className="max-w-[1500px] mx-auto space-y-6">
      <div className="flex items-center justify-between gap-3">
        <header className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-md bg-primary/15 grid place-items-center ring-1 ring-primary/30">
            <Swords className="w-5 h-5 text-primary" />
          </div>
          <div>
            <div className="text-xl font-bold leading-tight">Bot vs Bot · Single Match</div>
            <div className="text-xs text-muted-foreground">Pick two bots and watch them battle.</div>
          </div>
        </header>
        {onBack && (
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="w-4 h-4 mr-1.5" /> Back
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="bg-card p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Match Speed</div>
          <SpeedSelector value={speed} onChange={setSpeed} />
          <div className="text-[10px] text-muted-foreground mt-2">
            Only affects delay between visible moves. Bot strength is unchanged.
          </div>
        </Card>

        <Card className="bg-card p-4 space-y-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Starting Position</div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => { setGameType("standard"); setCustomFen(null); }}
                className={cn(
                  "rounded-lg py-3 px-2 border text-center transition-colors",
                  gameType === "standard"
                    ? "bg-primary/15 border-primary/50 text-primary"
                    : "bg-secondary/30 border-transparent hover:bg-secondary/60",
                )}
              >
                <div className="text-sm font-semibold">Standard Game</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">Normal chess start</div>
              </button>
              <button
                onClick={() => setGameType("custom")}
                className={cn(
                  "rounded-lg py-3 px-2 border text-center transition-colors",
                  gameType === "custom"
                    ? "bg-primary/15 border-primary/50 text-primary"
                    : "bg-secondary/30 border-transparent hover:bg-secondary/60",
                )}
              >
                <div className="text-sm font-semibold">Custom Position</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  {customFen ? "Position set ✓" : "Design your own"}
                </div>
              </button>
            </div>
            {gameType === "custom" && (
              <Button size="sm" variant="secondary" className="w-full mt-2" onClick={() => setEditingPosition(true)}>
                {customFen ? "Edit position" : "Open board editor"}
              </Button>
            )}
          </div>

          <div className="flex items-center justify-between border-t border-border/60 pt-3">
            <div>
              <div className="text-xs font-semibold">Show Evaluation Bar</div>
              <div className="text-[10px] text-muted-foreground">Stockfish eval — display only, does not affect bots.</div>
            </div>
            <Switch checked={showEval} onCheckedChange={setShowEval} />
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] gap-6 items-start">
        <SidePicker label="White" selected={botA} onSelect={setBotA} bots={bots} otherId={botB?.id ?? null} />
        <div className="hidden lg:flex flex-col items-center justify-center pt-16 text-3xl font-black text-primary">VS</div>
        <SidePicker label="Black" selected={botB} onSelect={setBotB} bots={bots} otherId={botA?.id ?? null} />
      </div>

      <div className="flex justify-center">
        <Button
          onClick={start}
          disabled={!botA || !botB || (gameType === "custom" && !customFen)}
          className="bg-success text-primary-foreground hover:bg-success/90 font-bold h-12 px-8 text-base"
        >
          <Play className="w-5 h-5 mr-2" /> Start Match
        </Button>
      </div>

      {stage === "vs" && botA && botB && (
        <div
          className="fixed inset-0 z-[80] bg-background/90 backdrop-blur-md grid place-items-center animate-in fade-in duration-200 cursor-pointer"
          onClick={() => setStage("match")}
        >
          <div className="flex items-center gap-8 md:gap-16 px-6">
            <VsBotCard bot={botA} side="left" />
            <div className="text-5xl md:text-7xl font-black text-primary animate-pulse drop-shadow-[0_0_20px_hsl(var(--primary)/0.6)]">
              VS
            </div>
            <VsBotCard bot={botB} side="right" />
          </div>
          <div className="absolute bottom-8 text-xs text-muted-foreground">Click anywhere to skip</div>
        </div>
      )}
    </div>
  );
}

/* ───────── Bot picker (categorized) ───────── */

export function SidePicker({
  label,
  selected,
  onSelect,
  bots,
  otherId,
}: {
  label: string;
  selected: BotConfig | null;
  onSelect: (b: BotConfig | null) => void;
  bots: BotConfig[];
  otherId: string | null;
}) {
  return (
    <Card className="bg-card p-3 min-w-0">
      <div className="flex items-center justify-between px-1 mb-2">
        <div className="text-sm font-semibold">{label}</div>
        {selected && (
          <button
            className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
            onClick={() => onSelect(null)}
          >
            <X className="w-3 h-3" /> Clear
          </button>
        )}
      </div>

      {selected ? (
        <div className="rounded-lg p-3 bg-primary/10 border border-primary/40 flex items-center gap-3">
          <div className="w-12 h-12 rounded-md bg-secondary grid place-items-center overflow-hidden shrink-0 ring-1 ring-border">
            {selected.avatar ? (
              <img src={selected.avatar} alt={selected.name} className="w-full h-full object-cover" />
            ) : (
              <User className="w-5 h-5 text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold truncate inline-flex items-center gap-1.5">
              {!isImmersiveEnabled() && (
                <TitleBadge title={selected.title} color={selected.titleColor} size="sm" />
              )}
              <span className="truncate">{selected.name}</span>
            </div>
            <div className="text-[11px] text-muted-foreground">ELO {selected.elo} · {selected.category}</div>
          </div>
        </div>
      ) : (
        <div className="text-[11px] text-muted-foreground text-center py-2 border border-dashed border-border/60 rounded-md mb-2">
          Choose a bot below
        </div>
      )}

      <Accordion type="multiple" className="w-full mt-2">
        {BOT_CATEGORIES.map((section) => {
          const list = bots
            .filter((b) => b.category === section.value)
            .sort((a, b) => a.orderIndex - b.orderIndex);
          return (
            <AccordionItem key={section.value} value={section.value} className="border-border/60">
              <AccordionTrigger className="text-xs font-semibold py-2.5 hover:no-underline">
                <span className="flex items-center gap-2">
                  {section.label}
                  <span className="text-[10px] font-normal text-muted-foreground">({list.length})</span>
                </span>
              </AccordionTrigger>
              <AccordionContent>
                {list.length === 0 ? (
                  <div className="text-[11px] text-muted-foreground px-2 py-3">No bots here.</div>
                ) : (
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    {list.map((b) => {
                      const isMe = selected?.id === b.id;
                      const isOther = otherId === b.id;
                      return (
                        <button
                          key={b.id}
                          disabled={isOther}
                          onClick={() => onSelect(b)}
                          className={cn(
                            "flex flex-col items-center text-center gap-2 rounded-lg p-3 transition-colors border min-w-0",
                            isMe
                              ? "bg-primary/15 border-primary/40"
                              : "bg-secondary/30 hover:bg-secondary/60 border-transparent",
                            isOther && "opacity-40 cursor-not-allowed",
                          )}
                        >
                          <div className="w-11 h-11 rounded-md bg-secondary grid place-items-center overflow-hidden ring-1 ring-border">
                            {b.avatar ? (
                              <img src={b.avatar} alt={b.name} className="w-full h-full object-cover" />
                            ) : (
                              <User className="w-5 h-5 text-muted-foreground" />
                            )}
                          </div>
                          <div className="w-full min-w-0">
                            <div className="text-xs font-semibold truncate inline-flex items-center gap-1 max-w-full justify-center">
                              {b.title && !isImmersiveEnabled() && (
                                <TitleBadge title={b.title} color={b.titleColor} size="sm" />
                              )}
                              <span className="truncate">{botDisplayIdentity(b, isImmersiveEnabled()).name}</span>
                            </div>
                            <div className="text-[10px] text-muted-foreground">ELO {b.elo}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </Card>
  );
}

export function VsBotCard({ bot, side }: { bot: BotConfig; side: "left" | "right" }) {
  return (
    <div className={cn("flex flex-col items-center gap-3", side === "right" ? "text-right" : "text-left")}>
      <div className="w-24 h-24 md:w-32 md:h-32 rounded-md bg-secondary grid place-items-center overflow-hidden ring-2 ring-primary/40 shadow-[0_0_30px_hsl(var(--primary)/0.3)]">
        {bot.avatar ? (
          <img src={bot.avatar} alt={bot.name} className="w-full h-full object-cover" />
        ) : (
          <User className="w-10 h-10 text-muted-foreground" />
        )}
      </div>
      <div className="text-center flex flex-col items-center gap-1">
        {!isImmersiveEnabled() && <TitleBadge title={bot.title} color={bot.titleColor} size="md" />}
        <div className="text-base md:text-xl font-bold">{botDisplayIdentity(bot, isImmersiveEnabled()).name}</div>
        <div className="text-xs text-muted-foreground">({bot.elo})</div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">{bot.category}</div>
      </div>
    </div>
  );
}

/* ───────── The auto-play match with replay ───────── */

export type MatchResult = {
  winner: "white" | "black" | "draw";
  reason: string;
  history: string[];
};

export function BotVsBotMatch({
  white,
  black,
  onExit,
  speed = null,
  onFinished,
  hideExit = false,
  headerExtra,
  showEval = false,
  startFen = null,
}: {
  white: BotConfig;
  black: BotConfig;
  onExit?: () => void;
  speed?: SpeedSetting | null;
  onFinished?: (r: MatchResult) => void;
  hideExit?: boolean;
  headerExtra?: React.ReactNode;
  showEval?: boolean;
  startFen?: string | null;
}) {
  const gameRef = useRef(startFen ? new Chess(startFen) : new Chess());
  const [history, setHistory] = useState<string[]>([]);
  const [uciHistory, setUciHistory] = useState<string[]>([]);
  const [lastMove, setLastMove] = useState<{ from: Square; to: Square } | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [, setTick] = useState(0);
  const force = useCallback(() => setTick((t) => t + 1), []);

  const [gameOver, setGameOver] = useState(false);
  const [replayIndex, setReplayIndex] = useState<number | null>(null);
  const finishedRef = useRef(false);

  // Custom starting positions skip the opening repertoire.
  const whiteOpeningRef = useRef<OpeningDef | null>(startFen ? null : pickOpeningForBot(white, "w"));
  const blackOpeningRef = useRef<OpeningDef | null>(startFen ? null : pickOpeningForBot(black, "b"));

  const cancelledRef = useRef(false);
  const busyRef = useRef(false);

  // Live evaluation (Stockfish, display-only).
  const [evalData, setEvalData] = useState<PositionEval | null>(null);
  const [evalLoading, setEvalLoading] = useState(false);

  useEffect(() => {
    cancelledRef.current = false;
    return () => { cancelledRef.current = true; };
  }, []);

  // Evaluate current position after every move (and initial load) when enabled.
  useEffect(() => {
    if (!showEval) return;
    const g = gameRef.current;
    if (g.isGameOver()) return;
    setEvalLoading(true);
    let stale = false;
    evaluatePosition(g.fen()).then((res) => {
      if (stale) return;
      if (res) setEvalData(res);
      setEvalLoading(false);
    });
    return () => { stale = true; };
  }, [showEval, history.length]);

  // Auto-play loop
  useEffect(() => {
    if (gameOver || replayIndex !== null) return;
    const game = gameRef.current;
    if (game.isGameOver()) { setGameOver(true); return; }
    if (busyRef.current) return;

    const side = game.turn();
    const bot = side === "w" ? white : black;
    const opening = side === "w" ? whiteOpeningRef.current : blackOpeningRef.current;

    busyRef.current = true;
    setThinking(true);
    const startedAt = Date.now();
    (async () => {
      try {
        const result = await chooseBotMove(game, bot, { openingLine: opening?.line ?? null });
        if (cancelledRef.current) return;
        if (!result) { setGameOver(true); return; }
        const targetMs = resolveDelayMs(bot, speed);
        const elapsed = Date.now() - startedAt;
        if (elapsed < targetMs) await new Promise((r) => setTimeout(r, targetMs - elapsed));
        if (cancelledRef.current) return;
        const pick = result.move;
        const m = game.move({
          from: pick.from as Square,
          to: pick.to as Square,
          promotion: pick.promotion as "q" | "r" | "b" | "n" | undefined,
        });
        if (!m) return;
        playMoveResultSound(m);
        setHistory((h) => [...h, m.san]);
        setUciHistory((h) => [...h, pick.from + pick.to + (pick.promotion ?? "")]);
        setLastMove({ from: pick.from as Square, to: pick.to as Square });
        force();
        if (game.isGameOver()) setGameOver(true);
      } finally {
        busyRef.current = false;
        setThinking(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history.length, gameOver, replayIndex, white, black, speed]);

  // Fire onFinished exactly once when game ends.
  useEffect(() => {
    if (!gameOver || finishedRef.current) return;
    finishedRef.current = true;
    const g = gameRef.current;
    let winner: MatchResult["winner"] = "draw";
    let reason = "Draw";
    if (g.isCheckmate()) {
      // Whoever is to move just got mated.
      winner = g.turn() === "w" ? "black" : "white";
      reason = "Checkmate";
    } else if (g.isStalemate()) { reason = "Stalemate"; }
    else if (g.isThreefoldRepetition()) { reason = "Threefold repetition"; }
    else if (g.isInsufficientMaterial()) { reason = "Insufficient material"; }
    else if (g.isDraw()) { reason = "Draw"; }
    onFinished?.({ winner, reason, history: [...history] });
  }, [gameOver, history, onFinished]);

  const statusText = useMemo(() => {
    const g = gameRef.current;
    if (g.isCheckmate()) return `Checkmate — ${g.turn() === "w" ? black.name : white.name} wins`;
    if (g.isStalemate()) return "Stalemate";
    if (g.isDraw()) return "Draw";
    if (g.inCheck()) return `${g.turn() === "w" ? white.name : black.name} is in check`;
    return `${g.turn() === "w" ? white.name : black.name} to move`;
  }, [history.length, white.name, black.name]);

  const moveRows = useMemo(() => {
    const rows: Array<{ n: number; w: string; b?: string; wIdx: number; bIdx?: number }> = [];
    for (let i = 0; i < history.length; i += 2) {
      rows.push({
        n: i / 2 + 1,
        w: history[i],
        b: history[i + 1],
        wIdx: i,
        bIdx: i + 1 < history.length ? i + 1 : undefined,
      });
    }
    return rows;
  }, [history]);

  const replayGame = useMemo(() => {
    if (replayIndex === null) return null;
    const g = startFen ? new Chess(startFen) : new Chess();
    for (let i = 0; i <= replayIndex && i < history.length; i++) g.move(history[i]);
    return g;
  }, [replayIndex, history, startFen]);

  const displayGame = replayGame ?? gameRef.current;

  const displayLastMove = useMemo(() => {
    if (replayIndex === null) return lastMove;
    if (replayIndex < 0 || replayIndex >= uciHistory.length) return null;
    const u = uciHistory[replayIndex];
    return { from: u.slice(0, 2) as Square, to: u.slice(2, 4) as Square };
  }, [replayIndex, uciHistory, lastMove]);

  const canReplay = gameOver && history.length > 0;
  const clampIdx = (i: number) => Math.max(0, Math.min(history.length - 1, i));
  const goTo = (i: number) => setReplayIndex(clampIdx(i));

  return (
    <div className="max-w-[1500px] mx-auto grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-6 lg:gap-8">
      <section className="space-y-4 min-w-0">
        {headerExtra}
        <BotHeaderCard bot={flipped ? white : black} sideLabel={flipped ? "White" : "Black"} />

        <Card className="p-5 md:p-6 bg-card min-w-0">
          <div className="flex items-center justify-between mb-4 gap-2">
            <div className="text-sm font-medium truncate">
              {gameOver
                ? (replayIndex === null ? statusText : `Replay · move ${replayIndex + 1}/${history.length}`)
                : statusText}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {thinking && !gameOver && <div className="text-xs text-muted-foreground">Thinking…</div>}
              <Button variant="ghost" size="sm" onClick={() => setFlipped((f) => !f)}>
                <FlipHorizontal2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
          <div className="mx-auto w-full max-w-[calc(min(65vh,560px)*var(--board-scale,1))] flex gap-3 items-stretch">
            {showEval && (
              <div className="flex items-stretch">
                <EvaluationBar evalData={evalData} loading={evalLoading} />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <Board
                game={displayGame}
                flipped={flipped}
                disabled
                lastMove={displayLastMove}
                onAttemptMove={() => false}
              />
            </div>
          </div>

          {canReplay && (
            <div className="flex items-center justify-center gap-2 mt-4">
              <Button variant="secondary" size="sm" onClick={() => goTo(0)} disabled={replayIndex === 0}>
                <ChevronFirst className="w-4 h-4" />
              </Button>
              <Button variant="secondary" size="sm" onClick={() => goTo((replayIndex ?? history.length) - 1)} disabled={replayIndex === 0}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <div className="text-xs text-muted-foreground min-w-[80px] text-center">
                {replayIndex === null ? `${history.length}/${history.length}` : `${replayIndex + 1}/${history.length}`}
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => goTo(replayIndex === null ? history.length - 1 : replayIndex + 1)}
                disabled={replayIndex !== null && replayIndex >= history.length - 1}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setReplayIndex(history.length - 1)}
                disabled={replayIndex === history.length - 1 || replayIndex === null}
              >
                <ChevronLast className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setReplayIndex(null)} className="text-xs">
                Live
              </Button>
            </div>
          )}
        </Card>

        <BotHeaderCard bot={flipped ? black : white} sideLabel={flipped ? "Black" : "White"} />
      </section>

      <aside className="flex flex-col gap-3">
        <Card className="bg-card p-3 flex-1 min-h-[260px]">
          <div className="flex items-center justify-between px-1 mb-2">
            <div className="text-sm font-semibold">Moves</div>
            {gameOver && <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Click to review</div>}
          </div>
          <div className="max-h-[480px] overflow-auto scroll-thin rounded-md">
            {moveRows.length === 0 ? (
              <div className="text-xs text-muted-foreground px-2 py-4">No moves yet.</div>
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {moveRows.map((r) => (
                    <tr key={r.n} className="odd:bg-secondary/30">
                      <td className="px-2 py-1 text-muted-foreground w-8 text-xs">{r.n}.</td>
                      <MoveCell san={r.w} idx={r.wIdx} active={replayIndex === r.wIdx} clickable={canReplay} onClick={goTo} />
                      {r.bIdx !== undefined ? (
                        <MoveCell san={r.b!} idx={r.bIdx} active={replayIndex === r.bIdx} clickable={canReplay} onClick={goTo} muted />
                      ) : <td className="px-2 py-1" />}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Card>
        {!hideExit && (
          gameOver ? (
            <div className="flex gap-2">
              <Button variant="secondary" onClick={onExit} className="flex-1">
                <RotateCcw className="w-4 h-4 mr-2" /> New match
              </Button>
            </div>
          ) : (
            <Button variant="destructive" onClick={onExit} className="w-full">
              Stop match
            </Button>
          )
        )}
      </aside>
    </div>
  );
}

function MoveCell({
  san,
  idx,
  active,
  clickable,
  onClick,
  muted,
}: {
  san: string;
  idx: number;
  active: boolean;
  clickable: boolean;
  onClick: (i: number) => void;
  muted?: boolean;
}) {
  return (
    <td
      className={cn(
        "px-2 py-1 font-mono select-none",
        muted && "text-muted-foreground",
        clickable && "cursor-pointer hover:text-primary",
        active && "bg-primary/25 text-primary font-semibold rounded-sm",
      )}
      onClick={() => { if (clickable) onClick(idx); }}
    >
      {san}
    </td>
  );
}

export function BotHeaderCard({ bot, sideLabel }: { bot: BotConfig; sideLabel: string }) {
  return (
    <Card className="bg-card p-3 flex items-center gap-3">
      <div className="w-11 h-11 rounded-full bg-secondary grid place-items-center overflow-hidden shrink-0 ring-1 ring-primary/40">
        {bot.avatar ? (
          <img src={bot.avatar} alt={bot.name} className="w-full h-full object-cover" />
        ) : (
          <User className="w-5 h-5 text-muted-foreground" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold truncate inline-flex items-center gap-2">
          {!isImmersiveEnabled() && <TitleBadge title={bot.title} color={bot.titleColor} size="sm" />}
          <span className="truncate">{botDisplayIdentity(bot, isImmersiveEnabled()).name}</span>
          <span className="text-muted-foreground/70 font-normal">({bot.elo})</span>
        </div>
        <div className="text-[11px] text-muted-foreground truncate">{bot.category}</div>
      </div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground shrink-0">{sideLabel}</div>
    </Card>
  );
}
