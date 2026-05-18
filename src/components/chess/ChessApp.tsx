import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chess, type Square, type PieceSymbol } from "chess.js";
import { Board } from "./Board";
import { PromotionDialog } from "./PromotionDialog";
import { BotRoster } from "./BotRoster";
import { OwnerPortal } from "./OwnerPortal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, FlipHorizontal2, Plus, RotateCcw, Terminal, User, Wifi } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getActiveBotId,
  loadBots,
  pickBotMove,
  subscribeBots,
  type BotConfig,
} from "@/lib/botStore";

type LogEntry = { kind: "info" | "warn" | "error" | "ok"; text: string; ts: string };
type ConnStatus = "idle" | "ok" | "error" | "checking";

const DEFAULT_ENDPOINT = "http://127.0.0.1:8080/move";

export function ChessApp() {
  const gameRef = useRef(new Chess());
  const [, setTick] = useState(0);
  const force = useCallback(() => setTick((t) => t + 1), []);

  const [flipped, setFlipped] = useState(false);
  const [endpoint, setEndpoint] = useState(DEFAULT_ENDPOINT);
  const [status, setStatus] = useState<ConnStatus>("idle");
  const [log, setLog] = useState<LogEntry[]>([]);
  const [history, setHistory] = useState<string[]>([]);
  const [uciHistory, setUciHistory] = useState<string[]>([]);
  const [lastMove, setLastMove] = useState<{ from: Square; to: Square } | null>(null);
  const [pending, setPending] = useState(false);
  const [promotion, setPromotion] = useState<{ from: Square; to: Square } | null>(null);
  const [configOpen, setConfigOpen] = useState(true);
  const [activeBot, setActiveBotState] = useState<BotConfig | null>(null);

  const game = gameRef.current;

  useEffect(() => {
    const refresh = () => {
      const id = getActiveBotId();
      setActiveBotState(id ? loadBots().find((b) => b.id === id) ?? null : null);
    };
    refresh();
    return subscribeBots(refresh);
  }, []);

  const addLog = useCallback((kind: LogEntry["kind"], text: string) => {
    const ts = new Date().toLocaleTimeString();
    setLog((l) => [...l.slice(-200), { kind, text, ts }]);
  }, []);

  useEffect(() => {
    addLog("info", "Engine ready. Configure your bot bridge to begin networked play.");
  }, [addLog]);

  const resetGame = useCallback(() => {
    gameRef.current = new Chess();
    setHistory([]);
    setUciHistory([]);
    setLastMove(null);
    setPending(false);
    setPromotion(null);
    addLog("info", "New game started.");
    force();
  }, [addLog, force]);

  const finishMove = useCallback(
    (from: Square, to: Square, promo?: PieceSymbol) => {
      const move = game.move({ from, to, promotion: promo as "q" | "r" | "b" | "n" | undefined });
      if (!move) return false;
      const uci = from + to + (promo ?? "");
      setHistory((h) => [...h, move.san]);
      setUciHistory((h) => [...h, uci]);
      setLastMove({ from, to });
      addLog("ok", `You played ${move.san}`);
      force();
      // schedule bot
      setPending(true);
      setTimeout(() => requestBotMove([...uciHistory, uci]), 250);
      return true;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [game, uciHistory],
  );

  const handleAttemptMove = useCallback(
    (from: Square, to: Square) => {
      if (pending) return false;
      if (game.turn() !== "w") return false;
      const piece = game.get(from);
      if (!piece) return false;
      // detect promotion
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
    [game, pending, finishMove],
  );

  const fallbackBotMove = useCallback(() => {
    const moves = game.moves({ verbose: true }) as Array<{ from: string; to: string; promotion?: string; san: string }>;
    if (moves.length === 0) return;
    const pick = moves[Math.floor(Math.random() * moves.length)];
    const m = game.move(pick);
    if (m) {
      setHistory((h) => [...h, m.san]);
      setUciHistory((h) => [...h, pick.from + pick.to + (pick.promotion ?? "")]);
      setLastMove({ from: pick.from as Square, to: pick.to as Square });
      addLog("warn", `Fallback engine played ${m.san}`);
      force();
    }
  }, [game, addLog, force]);

  const requestBotMove = useCallback(
    async (moves: string[]) => {
      if (game.isGameOver()) {
        setPending(false);
        return;
      }
      setStatus("checking");
      try {
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), 5000);
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ moves }),
          signal: ctrl.signal,
        });
        clearTimeout(tid);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { bot_move?: string };
        if (!data.bot_move) throw new Error("Missing bot_move in response");
        const uci = data.bot_move;
        const from = uci.slice(0, 2) as Square;
        const to = uci.slice(2, 4) as Square;
        const promo = uci.length >= 5 ? (uci[4] as "q" | "r" | "b" | "n") : undefined;
        const m = game.move({ from, to, promotion: promo });
        if (!m) throw new Error(`Engine returned illegal move ${uci}`);
        setHistory((h) => [...h, m.san]);
        setUciHistory((h) => [...h, uci]);
        setLastMove({ from, to });
        setStatus("ok");
        addLog("ok", `Bot played ${m.san} (engine)`);
        force();
      } catch (err) {
        setStatus("error");
        const msg = err instanceof Error ? err.message : String(err);
        addLog("warn", `Engine unreachable (${msg}). Using local fallback.`);
        fallbackBotMove();
      } finally {
        setPending(false);
      }
    },
    [endpoint, game, addLog, force, fallbackBotMove],
  );

  const gameStatusText = useMemo(() => {
    if (game.isCheckmate()) return `Checkmate — ${game.turn() === "w" ? "Black" : "White"} wins`;
    if (game.isStalemate()) return "Stalemate";
    if (game.isDraw()) return "Draw";
    if (game.inCheck()) return `${game.turn() === "w" ? "White" : "Black"} is in check`;
    return `${game.turn() === "w" ? "White" : "Black"} to move`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history.length, game]);

  // Pair moves for history
  const moveRows = useMemo(() => {
    const rows: Array<{ n: number; w: string; b?: string }> = [];
    for (let i = 0; i < history.length; i += 2) {
      rows.push({ n: i / 2 + 1, w: history[i], b: history[i + 1] });
    }
    return rows;
  }, [history]);

  const statusDot = {
    idle: "bg-muted-foreground",
    checking: "bg-warning animate-pulse",
    ok: "bg-success",
    error: "bg-destructive",
  }[status];

  return (
    <div className="min-h-screen w-full px-3 md:px-6 py-4 md:py-6">
      <header className="max-w-[1400px] mx-auto flex items-center justify-between mb-4 md:mb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/15 grid place-items-center ring-1 ring-primary/30">
            <span className="text-primary text-lg font-black">♞</span>
          </div>
          <div>
            <h1 className="text-lg md:text-xl font-bold tracking-tight">BotBoard</h1>
            <p className="text-xs text-muted-foreground">Custom engine sparring arena</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className={cn("w-2 h-2 rounded-full", statusDot)} />
          <span>{status === "ok" ? "Engine online" : status === "error" ? "Engine offline" : status === "checking" ? "Contacting engine" : "Standby"}</span>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-4 md:gap-6">
        {/* Board area */}
        <section>
          <Card className="p-4 md:p-6 bg-card">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-medium">{gameStatusText}</div>
              {pending && <div className="text-xs text-muted-foreground">Bot thinking…</div>}
            </div>
            <Board
              game={game}
              flipped={flipped}
              disabled={pending || game.isGameOver()}
              lastMove={lastMove}
              onAttemptMove={handleAttemptMove}
            />
          </Card>
        </section>

        {/* Side panel */}
        <aside className="flex flex-col gap-4">
          {/* Bot bridge */}
          <Card className="bg-card">
            <Collapsible open={configOpen} onOpenChange={setConfigOpen}>
              <CollapsibleTrigger asChild>
                <button className="w-full flex items-center justify-between px-4 py-3 text-left">
                  <div className="flex items-center gap-2">
                    <Wifi className="w-4 h-4 text-primary" />
                    <span className="text-sm font-semibold">Custom Bot Bridge</span>
                    <span className={cn("ml-1 w-2 h-2 rounded-full", statusDot)} />
                  </div>
                  <ChevronDown className={cn("w-4 h-4 transition-transform", configOpen && "rotate-180")} />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="px-4 pb-4 space-y-2">
                  <Label htmlFor="endpoint" className="text-xs text-muted-foreground">
                    Local Engine Endpoint URL
                  </Label>
                  <Input
                    id="endpoint"
                    value={endpoint}
                    onChange={(e) => setEndpoint(e.target.value)}
                    placeholder="http://127.0.0.1:8080/move"
                    className="font-mono text-xs"
                  />
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    POST {`{"moves":[...]}`} → expects {`{"bot_move":"e7e5"}`}. Falls back to local
                    random-legal engine on failure.
                  </p>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </Card>

          {/* Controls */}
          <Card className="bg-card p-3">
            <div className="grid grid-cols-3 gap-2">
              <Button variant="default" size="sm" onClick={resetGame}>
                <Plus className="w-3.5 h-3.5 mr-1" /> New
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setFlipped((f) => !f)}>
                <FlipHorizontal2 className="w-3.5 h-3.5 mr-1" /> Flip
              </Button>
              <Button variant="secondary" size="sm" onClick={resetGame}>
                <RotateCcw className="w-3.5 h-3.5 mr-1" /> Reset
              </Button>
            </div>
          </Card>

          {/* Move history */}
          <Card className="bg-card p-3 flex-1 min-h-[200px]">
            <div className="text-sm font-semibold mb-2 px-1">Move History</div>
            <div className="max-h-[260px] overflow-auto scroll-thin rounded-md">
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

          {/* Console */}
          <Card className="bg-card p-3">
            <div className="flex items-center gap-2 mb-2 px-1">
              <Terminal className="w-3.5 h-3.5 text-primary" />
              <span className="text-sm font-semibold">System Console</span>
            </div>
            <div className="bg-background/60 rounded-md p-2 max-h-[180px] overflow-auto scroll-thin font-mono text-[11px] leading-relaxed">
              {log.map((e, i) => (
                <div
                  key={i}
                  className={cn(
                    "whitespace-pre-wrap",
                    e.kind === "warn" && "text-warning",
                    e.kind === "error" && "text-destructive",
                    e.kind === "ok" && "text-success",
                    e.kind === "info" && "text-muted-foreground",
                  )}
                >
                  <span className="opacity-60">[{e.ts}]</span> {e.text}
                </div>
              ))}
            </div>
          </Card>
        </aside>
      </main>

      <PromotionDialog
        open={!!promotion}
        color="w"
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
