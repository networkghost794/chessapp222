import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chess, type Color, type PieceSymbol, type Square } from "chess.js";
import {
  Award,
  Bot,
  Check,
  Copy,
  Flag,
  FlipHorizontal2,
  LineChart,
  RotateCcw,
  Shield,
  Swords,
  Trophy,
  User,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  chooseBotMove,
  loadBots,
  pickThinkingDelayMs,
  refreshFromCloud,
  subscribeBots,
  type BotConfig,
} from "@/lib/botStore";
import {
  fetchPrivateBotProfiles,
  recordPrivateGame,
  resetPrivateBotProfiles,
  type PrivateBotProfile,
} from "@/lib/privateBotPlayerStore";
import { evaluatePosition, type PositionEval } from "@/lib/stockfishEval";
import { playMoveResultSound } from "@/lib/sounds";
import { cn } from "@/lib/utils";
import { Board } from "./Board";
import { BoardScaleControl, BoardViewToggle, TheaterToggleButton } from "./BoardScaleControl";
import { TitleBadge } from "./ChessApp";
import { EvaluationBar } from "./EvaluationBar";
import { PrivateRatingModal } from "./PrivateRatingModal";
import { PromotionDialog } from "./PromotionDialog";

function formatRelativeDate(ts: number): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diffSec < 60) return "just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return new Date(ts).toLocaleDateString();
}

export function PrivateBotPlayerArena() {
  const [bots, setBots] = useState<BotConfig[]>([]);
  const [profiles, setProfiles] = useState<Record<string, PrivateBotProfile>>({});
  const [loading, setLoading] = useState(true);

  const [activeTab, setActiveTab] = useState<"select" | "play" | "leaderboard" | "profile">(
    "select",
  );
  const [selectedBotId, setSelectedBotId] = useState<string | null>(null);
  const [opponentBotId, setOpponentBotId] = useState<string | null>(null);
  const [playerColor, setPlayerColor] = useState<Color>("w");

  // Active Match state
  const gameRef = useRef<Chess>(new Chess());
  const matchSessionRef = useRef(0);
  const finishedRef = useRef(false);
  const [, setTick] = useState(0);
  const force = useCallback(() => setTick((t) => t + 1), []);

  const [flipped, setFlipped] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [lastMove, setLastMove] = useState<{ from: Square; to: Square } | null>(null);
  const [engineThinking, setEngineThinking] = useState(false);
  const [promotion, setPromotion] = useState<{ from: Square; to: Square } | null>(null);
  const [isTheater, setIsTheater] = useState(false);
  const [showEval, setShowEval] = useState(false);
  const [evalData, setEvalData] = useState<PositionEval | null>(null);
  const [evalLoading, setEvalLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const profilesRef = useRef(profiles);
  profilesRef.current = profiles;

  const movesContainerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (movesContainerRef.current) {
      movesContainerRef.current.scrollTop = movesContainerRef.current.scrollHeight;
    }
  }, [history.length]);

  // Result modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [matchResult, setMatchResult] = useState<{
    result: "win" | "loss" | "draw";
    reason: string;
    userOldRating: number;
    userNewRating: number;
    userDelta: number;
    oppOldRating: number;
    oppDelta: number;
  } | null>(null);

  useEffect(() => {
    let mounted = true;
    const init = async () => {
      setLoading(true);
      let botList = loadBots();
      if (botList.length === 0) {
        botList = await refreshFromCloud();
      }
      if (!mounted) return;
      setBots(botList);
      const profs = await fetchPrivateBotProfiles(botList);
      if (!mounted) return;
      setProfiles(profs);
      if (botList.length > 0) {
        setSelectedBotId((prev) => prev ?? botList[0].id);
        if (botList.length > 1) {
          setOpponentBotId((prev) => prev ?? botList[1].id);
        }
      }
      setLoading(false);
    };
    void init();

    const unsub = subscribeBots(() => {
      const latest = loadBots();
      setBots(latest);
    });
    return () => {
      mounted = false;
      matchSessionRef.current += 1;
      unsub();
    };
  }, []);

  // Keep opponent distinct if user picks the same bot as pilot
  useEffect(() => {
    if (selectedBotId && opponentBotId === selectedBotId && bots.length > 1) {
      const alt = bots.find((b) => b.id !== selectedBotId);
      if (alt) setOpponentBotId(alt.id);
    }
  }, [selectedBotId, opponentBotId, bots]);

  const selectedBot = bots.find((b) => b.id === selectedBotId) ?? null;
  const opponentBot = bots.find((b) => b.id === opponentBotId) ?? null;
  const selectedProfile = selectedBotId ? (profiles[selectedBotId] ?? null) : null;

  // Live evaluation (when enabled)
  useEffect(() => {
    if (!showEval || activeTab !== "play") return;
    const g = gameRef.current;
    if (g.isGameOver()) return;
    let stale = false;
    setEvalLoading(true);
    void evaluatePosition(g.fen()).then((res) => {
      if (stale) return;
      if (res) setEvalData(res);
      setEvalLoading(false);
    });
    return () => {
      stale = true;
    };
  }, [showEval, activeTab, history.length]);

  const finalizeGame = useCallback(
    (res: "win" | "loss" | "draw", reason: string) => {
      if (finishedRef.current || !selectedBotId || !opponentBotId) return;
      finishedRef.current = true;
      setEngineThinking(false);
      setPromotion(null);

      const g = gameRef.current;
      const resultData = recordPrivateGame(
        profilesRef.current,
        selectedBotId,
        opponentBotId,
        playerColor,
        res,
        g.history().length,
        g.pgn(),
        reason,
      );
      setProfiles(resultData.updatedProfiles);
      setMatchResult({
        result: res,
        reason,
        userOldRating: resultData.userOldRating,
        userNewRating: resultData.userNewRating,
        userDelta: resultData.userDelta,
        oppOldRating: resultData.oppOldRating,
        oppDelta: resultData.oppDelta,
      });
      setModalOpen(true);
    },
    [selectedBotId, opponentBotId, playerColor],
  );

  const checkGameOver = useCallback(
    (g: Chess): boolean => {
      if (!g.isGameOver()) return false;
      let res: "win" | "loss" | "draw" = "draw";
      let reason = "Draw";
      if (g.isCheckmate()) {
        const winner = g.turn() === "w" ? "b" : "w";
        res = winner === playerColor ? "win" : "loss";
        reason = "Checkmate";
      } else if (g.isStalemate()) {
        reason = "Stalemate";
      } else if (g.isThreefoldRepetition()) {
        reason = "Threefold repetition";
      } else if (g.isInsufficientMaterial()) {
        reason = "Insufficient material";
      } else if (g.isDrawByFiftyMoves?.()) {
        reason = "Fifty-move rule";
      }
      finalizeGame(res, reason);
      return true;
    },
    [playerColor, finalizeGame],
  );

  const triggerOpponentMove = useCallback(
    async (session: number, opp: BotConfig) => {
      const g = gameRef.current;
      if (session !== matchSessionRef.current || g.isGameOver() || finishedRef.current) return;
      setEngineThinking(true);
      const startedAt = Date.now();
      try {
        const picked = await chooseBotMove(g, opp);
        if (session !== matchSessionRef.current || finishedRef.current || !picked) return;

        const targetMs = Math.min(1800, Math.max(300, pickThinkingDelayMs(opp)));
        const elapsed = Date.now() - startedAt;
        if (elapsed < targetMs) {
          await new Promise((r) => setTimeout(r, targetMs - elapsed));
        }
        if (session !== matchSessionRef.current || finishedRef.current) return;

        const moveRes = g.move({
          from: picked.move.from as Square,
          to: picked.move.to as Square,
          promotion: picked.move.promotion as "q" | "r" | "b" | "n" | undefined,
        });
        if (moveRes) {
          playMoveResultSound(moveRes);
          setHistory([...g.history()]);
          setLastMove({ from: moveRes.from, to: moveRes.to });
          force();
          checkGameOver(g);
        }
      } finally {
        if (session === matchSessionRef.current) {
          setEngineThinking(false);
        }
      }
    },
    [checkGameOver, force],
  );

  const startMatch = useCallback(() => {
    if (!selectedBot || !opponentBot) return;
    const session = matchSessionRef.current + 1;
    matchSessionRef.current = session;
    finishedRef.current = false;

    const newG = new Chess();
    gameRef.current = newG;
    setHistory([]);
    setLastMove(null);
    setPromotion(null);
    setEngineThinking(false);
    setEvalData(null);
    setFlipped(playerColor === "b");
    setModalOpen(false);
    setMatchResult(null);
    setActiveTab("play");
    force();

    if (playerColor === "b") {
      window.setTimeout(() => {
        void triggerOpponentMove(session, opponentBot);
      }, 260);
    }
  }, [selectedBot, opponentBot, playerColor, force, triggerOpponentMove]);

  const finishHumanMove = useCallback(
    (from: Square, to: Square, promo?: PieceSymbol): boolean => {
      const g = gameRef.current;
      if (g.isGameOver() || finishedRef.current) return false;
      try {
        const moveRes = g.move({
          from,
          to,
          promotion: promo as "q" | "r" | "b" | "n" | undefined,
        });
        if (!moveRes) return false;

        playMoveResultSound(moveRes);
        setHistory([...g.history()]);
        setLastMove({ from: moveRes.from, to: moveRes.to });
        force();

        if (checkGameOver(g)) return true;

        if (opponentBot) {
          const session = matchSessionRef.current;
          window.setTimeout(() => {
            void triggerOpponentMove(session, opponentBot);
          }, 260);
        }
        return true;
      } catch {
        return false;
      }
    },
    [opponentBot, force, checkGameOver, triggerOpponentMove],
  );

  const handleAttemptMove = useCallback(
    (from: Square, to: Square): boolean => {
      const g = gameRef.current;
      if (g.isGameOver() || finishedRef.current || engineThinking) return false;
      if (g.turn() !== playerColor) return false;

      const piece = g.get(from);
      if (!piece || piece.color !== playerColor) return false;

      const legal = (g.moves({ square: from, verbose: true }) as Array<{ to: string }>).some(
        (m) => m.to === to,
      );
      if (!legal) return false;

      const isPromotion =
        piece.type === "p" &&
        ((piece.color === "w" && to[1] === "8") || (piece.color === "b" && to[1] === "1"));

      if (isPromotion) {
        setPromotion({ from, to });
        return true;
      }

      return finishHumanMove(from, to);
    },
    [engineThinking, playerColor, finishHumanMove],
  );

  const handleResign = () => {
    if (finishedRef.current || gameRef.current.isGameOver()) return;
    matchSessionRef.current += 1;
    finalizeGame("loss", "Resignation");
  };

  const handleResetAll = async () => {
    const fresh = await resetPrivateBotProfiles(bots);
    setProfiles(fresh);
    setConfirmReset(false);
    toast.success("Private Glicko-2 ratings reset to initial values.");
  };

  const moveRows = useMemo(() => {
    const rows: { num: number; white?: string; black?: string }[] = [];
    for (let i = 0; i < history.length; i += 2) {
      rows.push({
        num: i / 2 + 1,
        white: history[i],
        black: history[i + 1],
      });
    }
    return rows;
  }, [history]);

  const sortedLeaderboard = useMemo(() => {
    return Object.values(profiles).sort((a, b) => b.currentRating - a.currentRating);
  }, [profiles]);

  if (loading) {
    return (
      <div className="p-12 text-center text-muted-foreground font-mono text-sm">
        Loading Private Bot Arena…
      </div>
    );
  }

  return (
    <div className="max-w-[1360px] mx-auto space-y-6 pb-12">
      {/* Top Mode Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl bg-card border border-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-warning/15 border border-warning/40 grid place-items-center text-warning font-bold text-lg">
            ♟
          </div>
          <div>
            <h1 className="text-base font-bold text-foreground flex items-center gap-2">
              Private Bot Player Mode
              <Badge className="bg-warning/15 text-warning border border-warning/30 text-[10px]">
                OWNER EXCLUSIVE
              </Badge>
            </h1>
            <p className="text-xs text-muted-foreground">
              Pilot any bot personally with isolated private Glicko-2 ratings, separate from public
              scores.
            </p>
          </div>
        </div>

        {/* View Navigation */}
        <div className="flex items-center gap-1.5 bg-background/70 p-1 rounded-lg border border-border">
          <Button
            size="sm"
            variant={activeTab === "select" ? "secondary" : "ghost"}
            onClick={() => setActiveTab("select")}
            className="text-xs h-7"
          >
            Play / Setup
          </Button>
          {selectedBot && opponentBot && (
            <Button
              size="sm"
              variant={activeTab === "play" ? "secondary" : "ghost"}
              onClick={() => setActiveTab("play")}
              className="text-xs h-7"
            >
              <Swords className="w-3.5 h-3.5 mr-1 text-warning" /> Match Board
            </Button>
          )}
          <Button
            size="sm"
            variant={activeTab === "leaderboard" ? "secondary" : "ghost"}
            onClick={() => setActiveTab("leaderboard")}
            className="text-xs h-7"
          >
            <Trophy className="w-3.5 h-3.5 mr-1 text-warning" /> Leaderboard
          </Button>
          {selectedBot && (
            <Button
              size="sm"
              variant={activeTab === "profile" ? "secondary" : "ghost"}
              onClick={() => setActiveTab("profile")}
              className="text-xs h-7"
            >
              <User className="w-3.5 h-3.5 mr-1" /> Bot Profile
            </Button>
          )}
        </div>
      </div>

      {/* SELECT / SETUP VIEW */}
      {activeTab === "select" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left 2 Cols: Bot Roster Selection */}
          <div className="lg:col-span-2 space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              1. Select Bot Identity to Pilot
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {bots.map((b) => {
                const prof = profiles[b.id];
                const isSelected = b.id === selectedBotId;
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => setSelectedBotId(b.id)}
                    className={cn(
                      "p-3.5 rounded-xl border text-left cursor-pointer transition-all",
                      isSelected
                        ? "bg-warning/10 border-warning shadow-md ring-1 ring-warning/50"
                        : "bg-card border-border hover:border-muted-foreground/50",
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-lg bg-secondary border border-border overflow-hidden shrink-0">
                        {b.avatar ? (
                          <img src={b.avatar} alt={b.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full grid place-items-center">
                            <Bot className="w-5 h-5 text-muted-foreground" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-sm text-foreground flex items-center gap-1 min-w-0">
                          <TitleBadge title={b.title} color={b.titleColor} size="sm" />
                          <span className="truncate">{b.name}</span>
                          {b.country && <span className="text-xs shrink-0">{b.country}</span>}
                        </div>
                        <div className="text-[11px] font-mono text-warning font-semibold">
                          Private: {prof?.currentRating ?? b.elo}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {prof?.wins ?? 0}W - {prof?.losses ?? 0}L - {prof?.draws ?? 0}D
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Col: Match Configuration */}
          <div className="space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              2. Match Setup
            </h2>
            <Card className="bg-card border-border p-5 space-y-4">
              {/* Identity Display */}
              <div>
                <label className="text-[11px] text-muted-foreground font-semibold block mb-1.5">
                  You are piloting
                </label>
                <div className="flex items-center justify-between gap-2.5 p-2.5 rounded-lg bg-background/70 border border-border">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-9 h-9 rounded-full overflow-hidden bg-secondary shrink-0 grid place-items-center">
                      {selectedProfile?.avatar ? (
                        <img
                          src={selectedProfile.avatar}
                          alt={selectedProfile.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Bot className="w-4 h-4 text-muted-foreground" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-foreground truncate flex items-center gap-1">
                        <TitleBadge
                          title={selectedProfile?.title}
                          color={selectedProfile?.titleColor}
                          size="sm"
                        />
                        <span className="truncate">{selectedProfile?.name ?? "Select a bot"}</span>
                      </div>
                      <div className="text-[10px] font-mono text-warning">
                        Private: {selectedProfile?.currentRating ?? 1500} · Peak{" "}
                        {selectedProfile?.peakRating ?? 1500}
                      </div>
                    </div>
                  </div>
                  {selectedProfile && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground shrink-0"
                      onClick={() => setActiveTab("profile")}
                    >
                      Stats
                    </Button>
                  )}
                </div>
              </div>

              {/* Opponent Selection */}
              <div>
                <label className="text-[11px] text-muted-foreground font-semibold block mb-1.5">
                  Choose Opponent Engine
                </label>
                <Select value={opponentBotId ?? ""} onValueChange={(v) => setOpponentBotId(v)}>
                  <SelectTrigger className="bg-background border-border text-xs h-9">
                    <SelectValue placeholder="Select opponent" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border text-xs max-h-64">
                    {bots
                      .filter((b) => b.id !== selectedBotId)
                      .map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name} (Public: {b.elo} | Private:{" "}
                          {profiles[b.id]?.currentRating ?? b.elo})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Color Choice */}
              <div>
                <label className="text-[11px] text-muted-foreground font-semibold block mb-1.5">
                  Playing Color
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={playerColor === "w" ? "default" : "outline"}
                    onClick={() => setPlayerColor("w")}
                    className={
                      playerColor === "w"
                        ? "bg-white text-black hover:bg-white/90 font-bold"
                        : "border-border text-muted-foreground"
                    }
                  >
                    ⚪ White (1st)
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={playerColor === "b" ? "default" : "outline"}
                    onClick={() => setPlayerColor("b")}
                    className={
                      playerColor === "b"
                        ? "bg-zinc-800 text-white hover:bg-zinc-700 font-bold border border-zinc-600"
                        : "border-border text-muted-foreground"
                    }
                  >
                    ⚫ Black (2nd)
                  </Button>
                </div>
              </div>

              <Button
                onClick={startMatch}
                disabled={!selectedBot || !opponentBot}
                className="w-full bg-warning text-black hover:bg-warning/90 font-bold h-10 mt-2"
              >
                <Swords className="w-4 h-4 mr-2" /> Start Rated Match
              </Button>
            </Card>
          </div>
        </div>
      )}

      {/* ACTIVE GAME VIEW */}
      {activeTab === "play" && selectedBot && opponentBot && (
        <div
          className={cn(
            "grid gap-5 items-start",
            isTheater
              ? "grid-cols-1"
              : "grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] max-w-[1160px] mx-auto",
          )}
        >
          {/* Board + Player Cards */}
          <div className="space-y-3">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-lg bg-card border border-border">
              <div className="flex items-center gap-1.5">
                <BoardScaleControl />
                <BoardViewToggle />
                <TheaterToggleButton active={isTheater} onToggle={() => setIsTheater((t) => !t)} />
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-[11px]"
                  onClick={() => setFlipped((f) => !f)}
                  title="Flip board"
                >
                  <FlipHorizontal2 className="w-3.5 h-3.5 mr-1" /> Flip
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={showEval ? "secondary" : "ghost"}
                  className="h-7 px-2 text-[11px]"
                  onClick={() => setShowEval((v) => !v)}
                  title="Toggle Stockfish eval bar"
                >
                  <LineChart className="w-3.5 h-3.5 mr-1" /> Eval
                </Button>
              </div>
              <div className="flex items-center gap-1.5">
                {!finishedRef.current && !gameRef.current.isGameOver() ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 px-2.5 text-[11px] border-destructive/40 text-destructive hover:bg-destructive/10"
                    onClick={handleResign}
                  >
                    <Flag className="w-3.5 h-3.5 mr-1" /> Resign
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    className="h-7 px-2.5 text-[11px] bg-warning text-black hover:bg-warning/90 font-semibold"
                    onClick={startMatch}
                  >
                    <RotateCcw className="w-3.5 h-3.5 mr-1" /> Rematch
                  </Button>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setActiveTab("select")}
                  className="h-7 px-2.5 text-[11px]"
                >
                  Setup
                </Button>
              </div>
            </div>

            {/* Opponent Card (Top) */}
            <div className="flex items-center justify-between p-3 bg-card border border-border rounded-xl">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-full bg-secondary overflow-hidden shrink-0 grid place-items-center">
                  {opponentBot.avatar ? (
                    <img
                      src={opponentBot.avatar}
                      alt={opponentBot.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Bot className="w-5 h-5 text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-bold text-foreground flex items-center gap-1.5 truncate">
                    <TitleBadge
                      title={opponentBot.title}
                      color={opponentBot.titleColor}
                      size="sm"
                    />
                    <span className="truncate">{opponentBot.name}</span>
                    {opponentBot.country && <span>{opponentBot.country}</span>}
                  </div>
                  <div className="text-xs text-muted-foreground font-mono">
                    Private: {profiles[opponentBot.id]?.currentRating ?? opponentBot.elo} ·{" "}
                    {playerColor === "w" ? "Black" : "White"}
                  </div>
                </div>
              </div>
              {engineThinking && (
                <Badge
                  variant="outline"
                  className="border-warning/50 text-warning animate-pulse text-xs shrink-0"
                >
                  Thinking…
                </Badge>
              )}
            </div>

            {/* Chessboard + Optional Eval Bar */}
            <div className="flex items-stretch justify-center gap-3">
              {showEval && <EvaluationBar evalData={evalData} loading={evalLoading} />}
              <div className="flex-1 flex justify-center">
                <Board
                  game={gameRef.current}
                  flipped={flipped}
                  disabled={
                    engineThinking ||
                    finishedRef.current ||
                    gameRef.current.isGameOver() ||
                    gameRef.current.turn() !== playerColor
                  }
                  lastMove={lastMove}
                  onAttemptMove={handleAttemptMove}
                  isTheater={isTheater}
                  onToggleTheater={() => setIsTheater((t) => !t)}
                />
              </div>
            </div>

            {/* Player Card (Bottom - Piloting selected bot) */}
            <div className="flex items-center justify-between p-3 bg-card border border-warning/40 rounded-xl">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-full border-2 border-warning/60 overflow-hidden bg-secondary shrink-0 grid place-items-center">
                  {selectedBot.avatar ? (
                    <img
                      src={selectedBot.avatar}
                      alt={selectedBot.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Bot className="w-5 h-5 text-warning" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-bold text-foreground flex items-center gap-1.5 min-w-0">
                    <TitleBadge
                      title={selectedBot.title}
                      color={selectedBot.titleColor}
                      size="sm"
                    />
                    <span className="truncate">{selectedBot.name}</span>
                    {selectedBot.country && <span>{selectedBot.country}</span>}
                    <span className="text-[10px] text-warning bg-warning/15 px-1.5 py-0.5 rounded font-mono shrink-0">
                      YOU
                    </span>
                  </div>
                  <div className="text-xs text-warning font-mono">
                    Private: {selectedProfile?.currentRating ?? selectedBot.elo} ·{" "}
                    {playerColor === "w" ? "White" : "Black"}
                  </div>
                </div>
              </div>
              <div className="text-xs font-mono text-muted-foreground shrink-0">
                {gameRef.current.isGameOver()
                  ? "Game Over"
                  : gameRef.current.turn() === playerColor
                    ? "Your turn"
                    : "Opponent turn"}
              </div>
            </div>
          </div>

          {/* Side Move Sheet */}
          <Card className="bg-card border-border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Live Moves ({history.length})
              </h3>
              <span className="text-[10px] font-mono text-muted-foreground">Rated Private</span>
            </div>
            <div
              ref={movesContainerRef}
              className="h-[340px] overflow-y-auto rounded-lg bg-background/60 border border-border/70 p-2 font-mono text-xs"
            >
              {moveRows.length === 0 ? (
                <div className="h-full grid place-items-center text-muted-foreground text-center px-4">
                  Make your opening move on the board to begin the rated game.
                </div>
              ) : (
                <div className="space-y-0.5">
                  {moveRows.map((row) => (
                    <div
                      key={row.num}
                      className="grid grid-cols-[36px_1fr_1fr] gap-2 px-1.5 py-1 rounded hover:bg-secondary/40"
                    >
                      <span className="text-muted-foreground">{row.num}.</span>
                      <span className="font-semibold text-foreground">{row.white}</span>
                      <span className="font-semibold text-foreground/90">{row.black ?? ""}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* LEADERBOARD VIEW */}
      {activeTab === "leaderboard" && (
        <Card className="bg-card border-border p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                <Trophy className="w-4 h-4 text-warning" /> Private Glicko-2 Leaderboard
              </h2>
              <p className="text-xs text-muted-foreground">
                Independent owner-arena ratings updated exclusively from Private Bot Player matches.
              </p>
            </div>
            <div>
              {confirmReset ? (
                <div className="flex items-center gap-1.5">
                  <Button
                    size="sm"
                    variant="destructive"
                    className="h-7 text-xs"
                    onClick={() => void handleResetAll()}
                  >
                    Confirm Reset All
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    onClick={() => setConfirmReset(false)}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => setConfirmReset(true)}
                >
                  Reset Private Ratings
                </Button>
              )}
            </div>
          </div>

          <div className="divide-y divide-border">
            {sortedLeaderboard.map((p, idx) => {
              const diffFromPublic = p.currentRating - p.publicRating;
              return (
                <div
                  key={p.botId}
                  onClick={() => {
                    setSelectedBotId(p.botId);
                    setActiveTab("profile");
                  }}
                  className="py-3 px-2 -mx-2 rounded-lg flex items-center justify-between hover:bg-secondary/30 cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={cn(
                        "font-mono font-bold text-sm w-7 text-center shrink-0",
                        idx === 0
                          ? "text-warning"
                          : idx === 1
                            ? "text-zinc-300"
                            : idx === 2
                              ? "text-amber-600"
                              : "text-muted-foreground",
                      )}
                    >
                      #{idx + 1}
                    </span>
                    <div className="w-9 h-9 rounded-full bg-secondary overflow-hidden shrink-0 grid place-items-center">
                      {p.avatar ? (
                        <img src={p.avatar} alt={p.name} className="w-full h-full object-cover" />
                      ) : (
                        <Bot className="w-4 h-4 text-muted-foreground" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="font-bold text-sm text-foreground flex items-center gap-1.5 truncate">
                        <TitleBadge title={p.title} color={p.titleColor} size="sm" />
                        <span className="truncate">{p.name}</span>
                        {p.country && <span>{p.country}</span>}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {p.gamesPlayed} games ({p.wins}W - {p.losses}L - {p.draws}D)
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-mono font-bold text-base text-warning flex items-center justify-end gap-1.5">
                      <span>{p.currentRating}</span>
                      {diffFromPublic !== 0 && (
                        <span
                          className={cn(
                            "text-[10px] px-1.5 py-0.5 rounded",
                            diffFromPublic > 0
                              ? "bg-emerald-500/15 text-emerald-400"
                              : "bg-red-500/15 text-red-400",
                          )}
                        >
                          {diffFromPublic > 0 ? `+${diffFromPublic}` : diffFromPublic} vs pub
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-muted-foreground font-mono">
                      Peak {p.peakRating} · RD {p.rd}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* BOT PROFILE VIEW */}
      {activeTab === "profile" && selectedProfile && (
        <div className="space-y-5">
          <Card className="bg-card border-border p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl border-2 border-warning/40 bg-secondary overflow-hidden shrink-0 grid place-items-center">
                  {selectedProfile.avatar ? (
                    <img
                      src={selectedProfile.avatar}
                      alt={selectedProfile.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Bot className="w-7 h-7 text-warning" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <TitleBadge
                      title={selectedProfile.title}
                      color={selectedProfile.titleColor}
                      size="md"
                    />
                    <h2 className="text-xl font-black text-foreground">{selectedProfile.name}</h2>
                    {selectedProfile.country && (
                      <span className="text-lg">{selectedProfile.country}</span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap items-center gap-3">
                    <span>Public Rating: {selectedProfile.publicRating}</span>
                    <span>·</span>
                    <span className="font-mono">RD {selectedProfile.rd}</span>
                    <span>·</span>
                    <span className="font-mono">Vol {selectedProfile.volatility.toFixed(3)}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  className="bg-warning text-black hover:bg-warning/90 font-bold"
                  onClick={() => setActiveTab("select")}
                >
                  <Swords className="w-3.5 h-3.5 mr-1.5" /> Play as {selectedProfile.name}
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
              <div className="p-3.5 rounded-xl bg-background/70 border border-border">
                <div className="text-[11px] text-muted-foreground font-semibold">
                  Private Rating
                </div>
                <div className="text-2xl font-black font-mono text-warning mt-0.5">
                  {selectedProfile.currentRating}
                </div>
              </div>
              <div className="p-3.5 rounded-xl bg-background/70 border border-border">
                <div className="text-[11px] text-muted-foreground font-semibold flex items-center gap-1">
                  <Award className="w-3.5 h-3.5 text-warning" /> Peak Rating
                </div>
                <div className="text-2xl font-black font-mono text-foreground mt-0.5">
                  {selectedProfile.peakRating}
                </div>
              </div>
              <div className="p-3.5 rounded-xl bg-background/70 border border-border">
                <div className="text-[11px] text-muted-foreground font-semibold flex items-center gap-1">
                  <Shield className="w-3.5 h-3.5 text-emerald-400" /> Record
                </div>
                <div className="text-lg font-bold font-mono text-foreground mt-1">
                  {selectedProfile.wins}W-{selectedProfile.losses}L-{selectedProfile.draws}D
                </div>
              </div>
              <div className="p-3.5 rounded-xl bg-background/70 border border-border">
                <div className="text-[11px] text-muted-foreground font-semibold">Win Rate</div>
                <div className="text-2xl font-black font-mono text-foreground mt-0.5">
                  {selectedProfile.gamesPlayed > 0
                    ? `${Math.round((selectedProfile.wins / selectedProfile.gamesPlayed) * 100)}%`
                    : "—"}
                </div>
              </div>
            </div>
          </Card>

          <Card className="bg-card border-border p-6 space-y-4">
            <h3 className="text-sm font-bold text-foreground">
              Recent Private Games ({selectedProfile.history.length})
            </h3>
            {selectedProfile.history.length === 0 ? (
              <div className="py-10 text-center text-xs text-muted-foreground">
                No private games recorded for {selectedProfile.name} yet.
              </div>
            ) : (
              <div className="divide-y divide-border">
                {selectedProfile.history.map((rec) => (
                  <div
                    key={rec.id}
                    className="py-3 flex flex-wrap items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Badge
                        className={cn(
                          "w-12 justify-center font-bold uppercase text-[10px]",
                          rec.result === "win"
                            ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                            : rec.result === "loss"
                              ? "bg-red-500/15 text-red-400 border-red-500/30"
                              : "bg-zinc-500/15 text-zinc-300 border-zinc-500/30",
                        )}
                      >
                        {rec.result}
                      </Badge>
                      <div className="min-w-0">
                        <div className="font-semibold text-foreground truncate">
                          {rec.color === "w" ? "⚪ White" : "⚫ Black"} vs {rec.opponentName}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {rec.movesCount} plies · {rec.reason ?? "Completed"} ·{" "}
                          {formatRelativeDate(rec.timestamp)}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="font-mono text-right">
                        <span className="font-bold text-foreground">{rec.newRating}</span>{" "}
                        <span
                          className={cn(
                            "font-bold",
                            rec.delta > 0
                              ? "text-[#81b64c]"
                              : rec.delta < 0
                                ? "text-red-400"
                                : "text-muted-foreground",
                          )}
                        >
                          ({rec.delta > 0 ? `+${rec.delta}` : rec.delta})
                        </span>
                      </div>
                      {rec.pgn && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-[11px]"
                          onClick={() => {
                            void navigator.clipboard?.writeText(rec.pgn);
                            setCopiedId(rec.id);
                            window.setTimeout(() => setCopiedId(null), 1500);
                          }}
                        >
                          {copiedId === rec.id ? (
                            <>
                              <Check className="w-3.5 h-3.5 mr-1 text-emerald-400" /> Copied
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5 mr-1" /> PGN
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Pawn Promotion Picker */}
      <PromotionDialog
        open={promotion !== null}
        color={playerColor}
        onSelect={(p) => {
          if (!promotion) return;
          const { from, to } = promotion;
          setPromotion(null);
          finishHumanMove(from, to, p);
        }}
      />

      {/* Post-Game Animated Modal */}
      {modalOpen && matchResult && selectedProfile && opponentBot && (
        <PrivateRatingModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          result={matchResult.result}
          reason={matchResult.reason}
          userProfile={selectedProfile}
          oldRating={matchResult.userOldRating}
          newRating={matchResult.userNewRating}
          delta={matchResult.userDelta}
          opponentName={opponentBot.name}
          opponentAvatar={opponentBot.avatar}
          opponentOldRating={matchResult.oppOldRating}
          opponentDelta={matchResult.oppDelta}
          onRematch={startMatch}
          onNewMatch={() => {
            setModalOpen(false);
            setActiveTab("select");
          }}
        />
      )}
    </div>
  );
}
