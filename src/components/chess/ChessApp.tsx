import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chess, type Square, type PieceSymbol, type Color } from "chess.js";
import { Board } from "./Board";
import { PromotionDialog } from "./PromotionDialog";
import { BotRoster } from "./BotRoster";
import { OwnerPortal } from "./OwnerPortal";
import { Button } from "@/components/ui/button";

import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { ChevronDown, Flag, FlipHorizontal2, LogOut, Play, Plus, RotateCcw, Settings, Terminal, Trophy, User, Wifi } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  chooseBotMove,
  getActiveBotId,
  incrementBotLifetime,
  loadBots,
  refreshFromCloud,
  subscribeBots,
  type BotConfig,
} from "@/lib/botStore";
import { useAuth } from "@/lib/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { BathroomBreak } from "./BathroomBreak";
import { ProfileSettings } from "./ProfileSettings";
import { BotChatBubble } from "./BotChatBubble";

type LogEntry = { kind: "info" | "warn" | "error" | "ok"; text: string; ts: string };
type ConnStatus = "idle" | "ok" | "error" | "checking";
type ColorChoice = "white" | "black" | "random";
type BotStats = { wins: number; losses: number; draws: number };

const EMPTY_STATS: BotStats = { wins: 0, losses: 0, draws: 0 };

export function ChessApp() {
  const { profile, refreshProfile, signOut, user } = useAuth();
  const gameRef = useRef(new Chess());
  const [, setTick] = useState(0);
  const force = useCallback(() => setTick((t) => t + 1), []);
  const recordedRef = useRef(false);

  const [flipped, setFlipped] = useState(false);
  const [status, setStatus] = useState<ConnStatus>("idle");
  const [log, setLog] = useState<LogEntry[]>([]);
  const [history, setHistory] = useState<string[]>([]);
  const [uciHistory, setUciHistory] = useState<string[]>([]);
  const [lastMove, setLastMove] = useState<{ from: Square; to: Square } | null>(null);
  const [pending, setPending] = useState(false);
  const [promotion, setPromotion] = useState<{ from: Square; to: Square } | null>(null);
  const [configOpen, setConfigOpen] = useState(true);
  const [activeBot, setActiveBotState] = useState<BotConfig | null>(null);

  const [colorChoice, setColorChoice] = useState<ColorChoice>("white");
  const [playerColor, setPlayerColor] = useState<Color>("w");
  const [botStats, setBotStats] = useState<BotStats>(EMPTY_STATS);
  const [resultModal, setResultModal] = useState<{ open: boolean; title: string; detail: string }>({
    open: false,
    title: "",
    detail: "",
  });

  const game = gameRef.current;

  const [bathroomOpen, setBathroomOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [resignedFlag, setResignedFlag] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [matchActive, setMatchActive] = useState(false);

  useEffect(() => {
    const refresh = () => {
      const id = getActiveBotId();
      setActiveBotState(id ? loadBots().find((b) => b.id === id) ?? null : null);
    };
    refresh();
    const unsub = subscribeBots(refresh);
    refreshFromCloud();
    return unsub;
  }, []);

  const addLog = useCallback((kind: LogEntry["kind"], text: string) => {
    const ts = new Date().toLocaleTimeString();
    setLog((l) => [...l.slice(-200), { kind, text, ts }]);
  }, []);

  useEffect(() => {
    addLog("info", "Native Stockfish engine ready (Web Worker, no network).");
  }, [addLog]);

  // Load bot stats whenever active bot or user changes
  const loadBotStats = useCallback(async (bot: BotConfig | null) => {
    if (!user || !bot) { setBotStats(EMPTY_STATS); return; }
    const { data, error } = await supabase
      .from("bot_stats")
      .select("wins,losses,draws")
      .eq("user_id", user.id)
      .eq("bot_id", bot.id)
      .maybeSingle();
    if (error) { setBotStats(EMPTY_STATS); return; }
    setBotStats(data ?? EMPTY_STATS);
  }, [user]);

  useEffect(() => { loadBotStats(activeBot); }, [activeBot, loadBotStats]);

  const requestBotMoveRef = useRef<() => void>(() => {});

  const requestBotMove = useCallback(
    async () => {
      if (game.isGameOver()) { setPending(false); return; }
      setStatus("checking");
      try {
        const result = await chooseBotMove(game, activeBot);
        if (!result) { setPending(false); return; }
        const { move: pick, source } = result;
        const m = game.move({
          from: pick.from as Square,
          to: pick.to as Square,
          promotion: pick.promotion as "q" | "r" | "b" | "n" | undefined,
        });
        if (!m) throw new Error(`Illegal engine move ${pick.from}${pick.to}`);
        setHistory((h) => [...h, m.san]);
        setUciHistory((h) => [...h, pick.from + pick.to + (pick.promotion ?? "")]);
        setLastMove({ from: pick.from as Square, to: pick.to as Square });
        setStatus(source === "fallback" ? "error" : "ok");
        if (source === "book") addLog("ok", `${activeBot?.name ?? "Bot"} played ${m.san} (book)`);
        else if (source === "engine") addLog("ok", `${activeBot?.name ?? "Bot"} played ${m.san} (Stockfish)`);
        else addLog("warn", `${activeBot?.name ?? "Bot"} played ${m.san} (fallback heuristic)`);
        force();
      } catch (err) {
        setStatus("error");
        const msg = err instanceof Error ? err.message : String(err);
        addLog("error", `Engine error: ${msg}`);
      } finally {
        setPending(false);
      }
    },
    [game, addLog, force, activeBot],
  );

  useEffect(() => { requestBotMoveRef.current = requestBotMove; }, [requestBotMove]);

  const beginMatch = useCallback(() => {
    gameRef.current = new Chess();
    setHistory([]);
    setUciHistory([]);
    setLastMove(null);
    setPromotion(null);
    recordedRef.current = false;
    setResignedFlag(false);

    let color: Color = "w";
    if (colorChoice === "white") color = "w";
    else if (colorChoice === "black") color = "b";
    else color = Math.random() < 0.5 ? "w" : "b";
    setPlayerColor(color);
    setFlipped(color === "b");
    addLog("info", `New match — you play ${color === "w" ? "White" : "Black"}.`);
    setMatchActive(true);
    force();

    if (color === "b") {
      setPending(true);
      setTimeout(() => requestBotMoveRef.current(), 250);
    } else {
      setPending(false);
    }
  }, [colorChoice, addLog, force]);

  const startMatch = useCallback(() => {
    if (!activeBot) {
      addLog("warn", "Pick a bot from the library first.");
      return;
    }
    setSetupOpen(true);
  }, [activeBot, addLog]);

  const resetGame = useCallback(() => {
    gameRef.current = new Chess();
    setHistory([]);
    setUciHistory([]);
    setLastMove(null);
    setPending(false);
    setPromotion(null);
    recordedRef.current = false;
    setResignedFlag(false);
    addLog("info", "Board reset.");
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
      setPending(true);
      setTimeout(() => requestBotMoveRef.current(), 250);
      return true;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [game, uciHistory],
  );

  const handleAttemptMove = useCallback(
    (from: Square, to: Square) => {
      if (pending) return false;
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
    [game, pending, finishMove, playerColor],
  );

  const gameStatusText = useMemo(() => {
    if (game.isCheckmate()) return `Checkmate — ${game.turn() === "w" ? "Black" : "White"} wins`;
    if (game.isStalemate()) return "Stalemate";
    if (game.isDraw()) return "Draw";
    if (game.inCheck()) return `${game.turn() === "w" ? "White" : "Black"} is in check`;
    return `${game.turn() === "w" ? "White" : "Black"} to move`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history.length, game]);

  const resignMatch = useCallback(() => {
    if (recordedRef.current || game.isGameOver()) return;
    if (history.length === 0) {
      addLog("warn", "Nothing to resign — start a match first.");
      return;
    }
    setPending(false);
    setResignedFlag(true);
    addLog("warn", `You resigned. ${activeBot?.name ?? "Bot"} wins.`);
  }, [game, history.length, addLog, activeBot]);

  // Record result when the game ends (or on resign)
  useEffect(() => {
    if (!user || !profile || recordedRef.current) return;
    const over = game.isGameOver() || resignedFlag;
    if (!over) return;
    recordedRef.current = true;

    let userField: "wins" | "losses" | "draws" = "draws";
    let botField: "wins" | "losses" | "draws" = "draws";
    let eloDelta = 0;
    let title = "Draw";
    let detail = "The game ended in a draw.";

    if (resignedFlag) {
      userField = "losses"; botField = "wins"; eloDelta = 0;
      title = "Defeat";
      detail = `You resigned — ${activeBot?.name ?? "the bot"} wins.`;
    } else if (game.isCheckmate()) {
      const loser = game.turn();
      if (loser === playerColor) {
        userField = "losses"; botField = "wins"; eloDelta = 0;
        title = "Defeat";
        detail = `${activeBot?.name ?? "Bot"} delivered checkmate.`;
      } else {
        userField = "wins"; botField = "losses"; eloDelta = 0;
        title = "Victory";
        detail = `You checkmated ${activeBot?.name ?? "the bot"}!`;
      }
    } else if (game.isStalemate()) {
      detail = "Stalemate — no legal moves.";
    }
    void eloDelta;

    // Bot games are cosmetic-only for Elo — record wins/losses but never change rating.
    const profUpdate = {
      wins: profile.wins,
      losses: profile.losses,
      draws: profile.draws,
      elo_rating: profile.elo_rating,
    };
    profUpdate[userField] = profUpdate[userField] + 1;
    supabase.from("profiles").update(profUpdate).eq("id", user.id).then(({ error }) => {
      if (error) addLog("error", `Score sync failed: ${error.message}`);
      else {
        addLog("ok", `Result saved (${userField} — Elo unchanged, bot game)`);
        refreshProfile();
      }
    });

    if (activeBot) {
      const next: BotStats = {
        wins: botStats.wins + (botField === "wins" ? 1 : 0),
        losses: botStats.losses + (botField === "losses" ? 1 : 0),
        draws: botStats.draws + (botField === "draws" ? 1 : 0),
      };
      setBotStats(next);
      supabase.from("bot_stats").upsert({
        user_id: user.id,
        bot_id: activeBot.id,
        bot_name: activeBot.name,
        ...next,
      }, { onConflict: "user_id,bot_id" }).then(({ error }) => {
        if (error) addLog("error", `Bot stats sync failed: ${error.message}`);
      });
      // Global lifetime counters on the public custom_bots row
      if (botField === "wins") incrementBotLifetime(activeBot.id, 1, 0);
      else if (botField === "losses") incrementBotLifetime(activeBot.id, 0, 1);
    }

    setResultModal({ open: true, title, detail });
    setMatchActive(false);
  }, [history.length, game, user, profile, addLog, refreshProfile, activeBot, playerColor, botStats, resignedFlag]);

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
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setBathroomOpen(true)}
            className="h-9 px-2 text-lg hover:bg-secondary/60"
            title="Bathroom Break"
          >
            🚽 <span className="hidden md:inline text-xs ml-1 font-semibold">Bathroom Break</span>
          </Button>
          <div className="w-9 h-9 rounded-lg bg-primary/15 grid place-items-center ring-1 ring-primary/30">
            <span className="text-primary text-lg font-black">♞</span>
          </div>
          <div>
            <h1 className="text-lg md:text-xl font-bold tracking-tight">BotBoard</h1>
            <p className="text-xs text-muted-foreground">Custom engine sparring arena</p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className={cn("w-2 h-2 rounded-full", statusDot)} />
          <span>{status === "ok" ? "Engine online" : status === "error" ? "Engine offline" : status === "checking" ? "Contacting engine" : "Standby"}</span>
          {profile && (
            <>
              <Button variant="ghost" size="sm" onClick={() => setProfileOpen(true)} className="h-7 px-2 text-xs">
                <Settings className="w-3.5 h-3.5 mr-1" /> Profile
              </Button>
              <Button variant="ghost" size="sm" onClick={() => signOut()} className="h-7 px-2 text-xs">
                <LogOut className="w-3.5 h-3.5 mr-1" /> Sign out
              </Button>
            </>
          )}
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-4 md:gap-6">
        {/* Board area */}
        <section className="space-y-4">
          {activeBot && (
            <Card className="bg-card p-3 flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-secondary grid place-items-center overflow-hidden shrink-0 ring-1 ring-primary/40">
                {activeBot.avatar ? (
                  <img src={activeBot.avatar} alt={activeBot.name} className="w-full h-full object-cover" />
                ) : (
                  <User className="w-5 h-5 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold truncate">
                  {activeBot.name} <span className="text-muted-foreground font-normal">· ELO {activeBot.elo}</span>
                </div>
                {activeBot.quote && (
                  <div className="text-xs text-muted-foreground italic truncate">“{activeBot.quote}”</div>
                )}
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  Bot Record — <span className="text-success">Wins: {botStats.wins}</span>
                  {" | "}<span className="text-destructive">Losses: {botStats.losses}</span>
                  {" | "}<span>Draws: {botStats.draws}</span>
                </div>
              </div>
              <span className="text-[10px] uppercase tracking-wider text-primary">{activeBot.category}</span>
            </Card>
          )}
          <Card className="p-4 md:p-6 bg-card">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-medium">{gameStatusText}</div>
              {pending && <div className="text-xs text-muted-foreground">Bot thinking…</div>}
            </div>
            <Board
              game={game}
              flipped={flipped}
              disabled={pending || game.isGameOver() || bathroomOpen || resignedFlag}
              lastMove={lastMove}
              onAttemptMove={handleAttemptMove}
            />
          </Card>
          <Button
            onClick={resignMatch}
            variant="destructive"
            disabled={game.isGameOver() || resignedFlag || history.length === 0}
            className="w-full font-bold"
          >
            <Flag className="w-4 h-4 mr-2" /> 🏳️ Resign Match
          </Button>
          {profile && (
            <Card className="bg-card p-3 flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-secondary grid place-items-center overflow-hidden shrink-0 ring-1 ring-primary/40">
                {profile.avatar_url ? (
                  <img src={profile.avatar_url} alt={profile.username} className="w-full h-full object-cover" />
                ) : (
                  <User className="w-5 h-5 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold truncate flex items-center gap-1.5">
                  {profile.profile_icon && <span className="text-base leading-none">{profile.profile_icon}</span>}
                  <span className="truncate">{profile.username}</span>
                  {profile.title_badge && (
                    <span className={cn(
                      "text-[10px] font-bold px-1.5 py-0.5 rounded",
                      profile.title_badge.includes("CRTR")
                        ? "bg-gradient-to-r from-amber-500/30 to-yellow-300/20 text-amber-300 ring-1 ring-amber-400/50"
                        : "bg-primary/20 text-primary ring-1 ring-primary/40",
                    )}>{profile.title_badge}</span>
                  )}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {profile.wins}W · {profile.losses}L · {profile.draws}D
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Elo</div>
                <div className="text-lg font-black text-primary leading-none">{profile.elo_rating}</div>
              </div>
            </Card>
          )}
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
                    <span className="text-sm font-semibold">Native Engine</span>
                    <span className={cn("ml-1 w-2 h-2 rounded-full", statusDot)} />
                  </div>
                  <ChevronDown className={cn("w-4 h-4 transition-transform", configOpen && "rotate-180")} />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="px-4 pb-4 space-y-2">
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Stockfish runs locally inside a browser Web Worker — no network, no timeouts.
                    Each move is first looked up in the bot&apos;s Polyglot <code>.bin</code> opening
                    book (if uploaded). Once book theory is exhausted, the engine returns its top
                    candidates and the bot&apos;s slider weights pick from them.
                  </p>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </Card>

          {/* Color selector + Play Match */}
          <Card className="bg-card p-3 space-y-2">
            <Label className="text-xs text-muted-foreground px-1">Play as</Label>
            <div className="grid grid-cols-3 gap-2">
              {([
                { v: "white", label: "⚪ White" },
                { v: "black", label: "⚫ Black" },
                { v: "random", label: "🔀 Random" },
              ] as Array<{ v: ColorChoice; label: string }>).map((o) => (
                <button
                  key={o.v}
                  type="button"
                  onClick={() => setColorChoice(o.v)}
                  className={cn(
                    "text-xs font-medium py-2 rounded-md border transition-colors",
                    colorChoice === o.v
                      ? "bg-primary/15 border-primary/50 text-primary"
                      : "bg-secondary/40 border-border/60 text-muted-foreground hover:bg-secondary",
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <Button
              onClick={startMatch}
              className="w-full bg-success text-primary-foreground hover:bg-success/90 font-bold h-11 text-base"
            >
              <Play className="w-4 h-4 mr-2" /> PLAY MATCH
            </Button>
          </Card>

          {/* Controls */}
          <Card className="bg-card p-3">
            <div className="grid grid-cols-3 gap-2">
              <Button variant="default" size="sm" onClick={startMatch}>
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

          <BotRoster onSelect={(b) => addLog("ok", `Switched active bot to ${b.name}`)} />

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
        color={playerColor}
        onSelect={(p) => {
          if (promotion) {
            finishMove(promotion.from, promotion.to, p);
            setPromotion(null);
          }
        }}
      />

      <Dialog open={resultModal.open} onOpenChange={(v) => setResultModal((r) => ({ ...r, open: v }))}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <Trophy className={cn("w-5 h-5",
                resultModal.title === "Victory" && "text-success",
                resultModal.title === "Defeat" && "text-destructive",
                resultModal.title === "Draw" && "text-primary",
              )} />
              {resultModal.title}
            </DialogTitle>
            <DialogDescription>{resultModal.detail}</DialogDescription>
          </DialogHeader>
          {activeBot && (
            <div className="rounded-md bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
              <div className="font-semibold text-foreground mb-1">{activeBot.name} — lifetime record</div>
              <span className="text-success">W {botStats.wins}</span>
              {" · "}<span className="text-destructive">L {botStats.losses}</span>
              {" · "}<span>D {botStats.draws}</span>
            </div>
          )}
          <DialogFooter>
            <Button variant="secondary" onClick={() => setResultModal((r) => ({ ...r, open: false }))}>
              Close
            </Button>
            <Button
              onClick={() => { setResultModal((r) => ({ ...r, open: false })); startMatch(); }}
              className="bg-success text-primary-foreground hover:bg-success/90"
            >
              <Play className="w-4 h-4 mr-1" /> Play again
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <OwnerPortal />

      <BathroomBreak open={bathroomOpen} onClose={() => setBathroomOpen(false)} />
      <ProfileSettings open={profileOpen} onOpenChange={setProfileOpen} />
    </div>
  );
}
