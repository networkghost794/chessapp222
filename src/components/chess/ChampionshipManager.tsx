import { useEffect, useMemo, useRef, useState } from "react";
import { Chess, type Square } from "chess.js";
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  Crown,
  FastForward,
  Pause,
  Play,
  RotateCcw,
  Square as StopIcon,
  Trophy,
} from "lucide-react";
import { toast } from "sonner";
import {
  calculateMatchScore,
  calculateStandings,
  fetchChampionshipData,
  generateChampionshipMatchGames,
  generateDoubleRoundRobin,
  generateQualificationGames,
  getActiveCycle,
  getHallOfFame,
  getReigningChampion,
  playChampionshipBotGame,
  saveActiveCycle,
  saveHallOfFame,
  saveReigningChampion,
  subscribeChampionship,
  type ChampionshipCycle,
  type QualFormat,
  type ReigningChampion,
  type ScheduledGame,
} from "@/lib/championshipStore";
import { loadBots, subscribeBots, type BotConfig } from "@/lib/botStore";
import { Board } from "./Board";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const QUAL_FORMATS: { value: QualFormat; label: string }[] = [
  { value: "round_robin", label: "Round-Robin" },
  { value: "double_round_robin", label: "Double Round-Robin" },
  { value: "swiss", label: "Swiss System" },
  { value: "knockout", label: "Knockout Bracket" },
];

export function ChampionshipManager() {
  const [cycle, setCycle] = useState<ChampionshipCycle | null>(getActiveCycle());
  const [reigning, setReigning] = useState<ReigningChampion>(getReigningChampion());
  const [bots, setBots] = useState<BotConfig[]>([]);

  // Cycle creation state
  const [cycleName, setCycleName] = useState("BotBoard World Championship 2026");
  const [season, setSeason] = useState("Season 1");
  const [selectedBotIds, setSelectedBotIds] = useState<string[]>([]);
  const [qualFormat, setQualFormat] = useState<QualFormat>("round_robin");
  const [qualifySlots, setQualifySlots] = useState<number>(8);

  // Live automated game runner state
  const [runningGameId, setRunningGameId] = useState<string | null>(null);
  const [runningBatch, setRunningBatch] = useState(false);
  const [liveFen, setLiveFen] = useState<string>(new Chess().fen());
  const [liveLastMove, setLiveLastMove] = useState<{ from: Square; to: Square } | null>(null);
  const [livePlies, setLivePlies] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setBots(loadBots());
    const unsubBots = subscribeBots(() => setBots(loadBots()));
    fetchChampionshipData().then((data) => {
      setCycle(data.activeCycle);
      setReigning(data.reigning);
    });
    const unsubChamp = subscribeChampionship(() => {
      setCycle(getActiveCycle());
      setReigning(getReigningChampion());
    });
    return () => {
      unsubBots();
      unsubChamp();
      abortRef.current?.abort();
    };
  }, []);

  const botMap = useMemo(() => {
    const m = new Map<string, BotConfig>();
    for (const b of bots) m.set(b.id, b);
    return m;
  }, [bots]);

  const toggleBotSelection = (id: string) => {
    setSelectedBotIds((prev) => (prev.includes(id) ? prev.filter((b) => b !== id) : [...prev, id]));
  };

  const selectTopBots = (count: number) => {
    const top = [...bots]
      .filter((b) => b.id !== reigning.botId && b.category !== "Personal")
      .sort((a, b) => b.elo - a.elo)
      .slice(0, count)
      .map((b) => b.id);
    setSelectedBotIds(top);
  };

  const handleSetStartingChampion = async (botId: string) => {
    const bot = botMap.get(botId);
    if (!bot) return;
    await saveReigningChampion({
      botId: bot.id,
      botName: bot.name,
      rating: bot.elo,
      avatarUrl: bot.avatar,
      reignSince: new Date().toISOString().split("T")[0],
      defensesCount: 0,
      titlesWon: 1,
    });
    toast.success(`${bot.name} designated as Reigning World Champion.`);
  };

  const handleCreateCycle = async () => {
    if (selectedBotIds.length < 4) {
      toast.error("Please select at least 4 bots to participate.");
      return;
    }

    const slots = Math.max(2, Math.min(8, qualifySlots, selectedBotIds.length));
    const initialGames = generateQualificationGames(selectedBotIds, qualFormat, "qualification");
    const initialStandings = calculateStandings(selectedBotIds, initialGames, slots);

    const newCycle: ChampionshipCycle = {
      id: `cycle-${Date.now()}`,
      name: cycleName.trim() || "BotBoard World Championship 2026",
      season: season.trim() || "Season 1",
      createdAt: new Date().toISOString(),
      stage: "qualification",
      isPaused: false,
      reigningChampionId: reigning.botId,
      qualification: {
        format: qualFormat,
        botIds: selectedBotIds,
        qualifySlots: slots,
        games: initialGames,
        standings: initialStandings,
        isCompleted: false,
      },
      candidates: {
        botIds: [],
        games: [],
        standings: [],
        isCompleted: false,
      },
      match: {
        championId: reigning.botId,
        challengerId: "",
        totalGames: 14,
        championScore: 0,
        challengerScore: 0,
        targetScore: 7.5,
        games: [],
        currentGameIndex: 0,
        tiebreaksRequired: false,
        isCompleted: false,
      },
    };

    await saveActiveCycle(newCycle);
    toast.success("Championship cycle initialized!");
  };

  const currentStageGames: ScheduledGame[] = useMemo(() => {
    if (!cycle) return [];
    if (cycle.stage === "qualification") return cycle.qualification.games;
    if (cycle.stage === "candidates") return cycle.candidates.games;
    if (cycle.stage === "match") return cycle.match.games;
    return [];
  }, [cycle]);

  const applyGameUpdate = async (
    baseCycle: ChampionshipCycle,
    updatedGame: ScheduledGame,
  ): Promise<ChampionshipCycle> => {
    if (baseCycle.stage === "qualification") {
      const games = baseCycle.qualification.games.map((g) =>
        g.id === updatedGame.id ? updatedGame : g,
      );
      const standings = calculateStandings(
        baseCycle.qualification.botIds,
        games,
        baseCycle.qualification.qualifySlots,
      );
      const isCompleted = games.length > 0 && games.every((g) => g.status === "completed");
      const next: ChampionshipCycle = {
        ...baseCycle,
        qualification: {
          ...baseCycle.qualification,
          games,
          standings,
          isCompleted,
        },
      };
      await saveActiveCycle(next);
      return next;
    }

    if (baseCycle.stage === "candidates") {
      const games = baseCycle.candidates.games.map((g) =>
        g.id === updatedGame.id ? updatedGame : g,
      );
      const standings = calculateStandings(baseCycle.candidates.botIds, games, 1);
      const isCompleted = games.length > 0 && games.every((g) => g.status === "completed");
      const next: ChampionshipCycle = {
        ...baseCycle,
        candidates: {
          ...baseCycle.candidates,
          games,
          standings,
          winnerBotId: isCompleted ? standings[0]?.botId : baseCycle.candidates.winnerBotId,
          isCompleted,
        },
      };
      await saveActiveCycle(next);
      return next;
    }

    // Match stage
    const games = baseCycle.match.games.map((g) => (g.id === updatedGame.id ? updatedGame : g));
    const { championScore, challengerScore } = calculateMatchScore(
      baseCycle.match.championId,
      baseCycle.match.challengerId,
      games,
    );
    const completedCount = games.filter((g) => g.status === "completed").length;
    const target = baseCycle.match.targetScore;
    const clinched = championScore >= target || challengerScore >= target;
    const allPlayed = games.length > 0 && completedCount === games.length;
    const tiebreaksRequired = !clinched && allPlayed && championScore === challengerScore;

    const next: ChampionshipCycle = {
      ...baseCycle,
      match: {
        ...baseCycle.match,
        games,
        championScore,
        challengerScore,
        currentGameIndex: Math.min(games.length - 1, completedCount),
        tiebreaksRequired,
      },
    };
    await saveActiveCycle(next);
    return next;
  };

  const runSingleGame = async (targetCycle: ChampionshipCycle, gameToRun: ScheduledGame) => {
    const controller = new AbortController();
    abortRef.current = controller;
    setRunningGameId(gameToRun.id);
    setLiveFen(new Chess().fen());
    setLiveLastMove(null);
    setLivePlies(0);

    // Mark live in cloud so public spectators see it
    let workingCycle = await applyGameUpdate(targetCycle, {
      ...gameToRun,
      status: "live",
      result: "*",
      moveHistory: [],
    });

    const whiteBot = botMap.get(gameToRun.whiteBotId) ?? null;
    const blackBot = botMap.get(gameToRun.blackBotId) ?? null;

    let lastBroadcastAt = 0;
    const outcome = await playChampionshipBotGame(whiteBot, blackBot, {
      moveDelayMs: 90,
      maxPlies: 200,
      signal: controller.signal,
      onMove: (moves, fen) => {
        setLiveFen(fen);
        setLivePlies(moves.length);
        const c = new Chess();
        for (let i = 0; i < moves.length; i++) {
          const mv = c.move(moves[i]);
          if (i === moves.length - 1 && mv) {
            setLiveLastMove({ from: mv.from as Square, to: mv.to as Square });
          }
        }
        const now = Date.now();
        if (now - lastBroadcastAt > 1800) {
          lastBroadcastAt = now;
          void applyGameUpdate(workingCycle, {
            ...gameToRun,
            status: "live",
            result: "*",
            moveHistory: moves,
          }).then((updated) => {
            workingCycle = updated;
          });
        }
      },
    });

    if (controller.signal.aborted) {
      await applyGameUpdate(workingCycle, {
        ...gameToRun,
        status: "upcoming",
        result: undefined,
      });
      setRunningGameId(null);
      return workingCycle;
    }

    const finishedCycle = await applyGameUpdate(workingCycle, {
      ...gameToRun,
      status: "completed",
      result: outcome.result,
      moveHistory: outcome.moveHistory,
      pgn: outcome.pgn,
    });
    setRunningGameId(null);
    return finishedCycle;
  };

  const handleRunNextGame = async () => {
    if (!cycle || cycle.isPaused || runningGameId) return;
    const nextGame = currentStageGames.find((g) => g.status === "upcoming" || g.status === "live");
    if (!nextGame) {
      toast.info("All scheduled games in this stage are completed.");
      return;
    }
    const updated = await runSingleGame(cycle, nextGame);
    toast.success(`Game #${nextGame.gameNumber} completed.`);
    if (
      updated.stage === "match" &&
      (updated.match.championScore >= updated.match.targetScore ||
        updated.match.challengerScore >= updated.match.targetScore)
    ) {
      const champWon = updated.match.championScore >= updated.match.targetScore;
      const leaderName = champWon
        ? (botMap.get(updated.match.championId)?.name ?? "Champion")
        : (botMap.get(updated.match.challengerId)?.name ?? "Challenger");
      toast.success(`${leaderName} has clinched the Championship Match! Click Declare Winner.`);
    }
  };

  const handleRunAllRemaining = async () => {
    if (!cycle || cycle.isPaused || runningGameId) return;
    setRunningBatch(true);
    let current: ChampionshipCycle | null = cycle;
    try {
      while (current && !current.isPaused) {
        const list =
          current.stage === "qualification"
            ? current.qualification.games
            : current.stage === "candidates"
              ? current.candidates.games
              : current.stage === "match"
                ? current.match.games
                : [];
        const nextGame = list.find((g) => g.status === "upcoming" || g.status === "live");
        if (!nextGame) break;
        if (
          current.stage === "match" &&
          (current.match.championScore >= current.match.targetScore ||
            current.match.challengerScore >= current.match.targetScore)
        ) {
          break;
        }
        const beforeAbort = abortRef.current?.signal.aborted;
        current = await runSingleGame(current, nextGame);
        if (beforeAbort || abortRef.current?.signal.aborted) break;
      }
      toast.success("Automated stage run finished.");
    } finally {
      setRunningBatch(false);
    }
  };

  const handleStopRunning = () => {
    abortRef.current?.abort();
    setRunningBatch(false);
    setRunningGameId(null);
    toast.info("Stopped active simulation.");
  };

  const handleTogglePause = async () => {
    if (!cycle) return;
    if (!cycle.isPaused && runningGameId) {
      abortRef.current?.abort();
      setRunningBatch(false);
    }
    await saveActiveCycle({ ...cycle, isPaused: !cycle.isPaused });
  };

  const advanceToCandidates = async () => {
    if (!cycle) return;
    const slots = Math.min(8, cycle.qualification.qualifySlots || 8);
    const topBots = cycle.qualification.standings.slice(0, slots).map((s) => s.botId);
    if (topBots.length < 2) {
      toast.error("Not enough qualified bots to begin Candidates.");
      return;
    }

    const candidateGames = generateDoubleRoundRobin(topBots, "candidates");
    const candidateStandings = calculateStandings(topBots, candidateGames, 1);

    const updated: ChampionshipCycle = {
      ...cycle,
      stage: "candidates",
      qualification: { ...cycle.qualification, isCompleted: true },
      candidates: {
        botIds: topBots,
        games: candidateGames,
        standings: candidateStandings,
        isCompleted: false,
      },
    };

    await saveActiveCycle(updated);
    toast.success("Advanced to Stage 2: The Candidates Tournament!");
  };

  const advanceToMatch = async () => {
    if (!cycle || !cycle.candidates.standings[0]) return;
    const challengerId = cycle.candidates.standings[0].botId;
    const matchGames = generateChampionshipMatchGames(cycle.reigningChampionId, challengerId, 14);

    const updated: ChampionshipCycle = {
      ...cycle,
      stage: "match",
      candidates: { ...cycle.candidates, winnerBotId: challengerId, isCompleted: true },
      match: {
        ...cycle.match,
        championId: cycle.reigningChampionId,
        challengerId,
        games: matchGames,
        championScore: 0,
        challengerScore: 0,
        currentGameIndex: 0,
        tiebreaksRequired: false,
        isCompleted: false,
      },
    };

    await saveActiveCycle(updated);
    toast.success("Advanced to Stage 3: The World Championship Match!");
  };

  const addTiebreakGames = async () => {
    if (!cycle || cycle.stage !== "match") return;
    const startNum = cycle.match.games.length + 1;
    const tb = generateChampionshipMatchGames(
      cycle.match.championId,
      cycle.match.challengerId,
      4,
    ).map((g, idx) => ({
      ...g,
      id: `match-tb-${startNum + idx}`,
      gameNumber: startNum + idx,
    }));
    const allGames = [...cycle.match.games, ...tb];
    const targetScore = allGames.length / 2 + 0.5;
    await saveActiveCycle({
      ...cycle,
      match: {
        ...cycle.match,
        totalGames: allGames.length,
        targetScore,
        games: allGames,
        tiebreaksRequired: false,
      },
    });
    toast.success("Added 4-game Rapid Tiebreak series!");
  };

  const declareWinner = async (winnerId: string) => {
    if (!cycle) return;
    const winnerBot = botMap.get(winnerId);
    const winnerName =
      winnerBot?.name ?? (winnerId === reigning.botId ? reigning.botName : winnerId);

    const isDefense = winnerId === cycle.reigningChampionId;
    const challengerId = isDefense ? cycle.match.challengerId : cycle.reigningChampionId;
    const challenger = botMap.get(challengerId);

    const nextDefenses = isDefense ? reigning.defensesCount + 1 : 0;
    const nextTitles = isDefense ? reigning.titlesWon : (reigning.titlesWon || 0) + 1;

    await saveReigningChampion({
      botId: winnerId,
      botName: winnerName,
      rating: winnerBot?.elo ?? reigning.rating,
      avatarUrl: winnerBot?.avatar ?? reigning.avatarUrl,
      reignSince: isDefense ? reigning.reignSince : new Date().toISOString().split("T")[0],
      defensesCount: nextDefenses,
      titlesWon: nextTitles,
    });

    const hallRecord = {
      cycleId: cycle.id,
      cycleName: cycle.name,
      year: new Date().getFullYear().toString(),
      championId: winnerId,
      championName: winnerName,
      championAvatar: winnerBot?.avatar ?? reigning.avatarUrl,
      challengerId: challenger?.id || challengerId || "unknown",
      challengerName: challenger?.name || "Challenger",
      challengerAvatar: challenger?.avatar,
      finalScore: `${cycle.match.championScore} - ${cycle.match.challengerScore}`,
      gamesPlayed: cycle.match.games.filter((g) => g.status === "completed").length,
      dateConcluded: new Date().toISOString().split("T")[0],
      defensesCount: nextDefenses,
    };

    const currentHall = getHallOfFame();
    await saveHallOfFame([hallRecord, ...currentHall]);

    await saveActiveCycle({
      ...cycle,
      stage: "completed",
      match: { ...cycle.match, isCompleted: true, winnerId },
    });

    toast.success(`${winnerName} is crowned the Official World Champion!`);
  };

  const handleResetCycle = async () => {
    if (!confirm("Reset and clear the current championship cycle? Progress will be discarded.")) {
      return;
    }
    abortRef.current?.abort();
    setRunningBatch(false);
    setRunningGameId(null);
    await saveActiveCycle(null);
    toast.info("Championship cycle cleared.");
  };

  const liveBoardGame = useMemo(() => new Chess(liveFen), [liveFen]);
  const completedCount = currentStageGames.filter((g) => g.status === "completed").length;
  const recommendedWinnerId = useMemo(() => {
    if (!cycle || cycle.stage !== "match") return reigning.botId;
    if (cycle.match.challengerScore > cycle.match.championScore) {
      return cycle.match.challengerId || cycle.reigningChampionId;
    }
    return cycle.reigningChampionId;
  }, [cycle, reigning.botId]);

  return (
    <div className="space-y-6 max-w-5xl mx-auto py-4 text-foreground">
      {/* Current Reigning Banner */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-warning/20 via-card to-warning/5 border border-warning/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-warning/20 border border-warning/40 overflow-hidden grid place-items-center text-warning shadow-lg shadow-warning/10 shrink-0">
            {reigning.avatarUrl ? (
              <img
                src={reigning.avatarUrl}
                alt={reigning.botName}
                className="w-full h-full object-cover"
              />
            ) : (
              <Crown className="w-8 h-8" />
            )}
          </div>
          <div>
            <div className="text-xs uppercase font-mono tracking-widest text-warning font-semibold">
              Reigning World Champion
            </div>
            <h2 className="text-2xl font-black">{reigning.botName}</h2>
            <p className="text-xs text-muted-foreground">
              Rating: {reigning.rating} • {reigning.defensesCount} Successful Defenses • Titleholder
              since {reigning.reignSince}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {(!cycle || cycle.stage === "completed") && bots.length > 0 && (
            <select
              value={botMap.has(reigning.botId) ? reigning.botId : ""}
              onChange={(e) => {
                if (e.target.value) void handleSetStartingChampion(e.target.value);
              }}
              aria-label="Set Reigning Champion"
              className="h-8 rounded-md border border-border bg-background px-2.5 text-xs text-foreground"
            >
              <option value="">Change Champion…</option>
              {[...bots]
                .sort((a, b) => b.elo - a.elo)
                .map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.elo})
                  </option>
                ))}
            </select>
          )}
          <Badge className="bg-warning/20 text-warning border-warning/40 px-3 py-1 text-xs font-bold">
            WORLD CHAMPION
          </Badge>
        </div>
      </div>

      {!cycle || cycle.stage === "completed" ? (
        /* Create Cycle Form */
        <Card className="p-6 bg-card border-border space-y-5">
          <h3 className="text-lg font-bold flex items-center gap-2">
            <Trophy className="w-5 h-5 text-warning" /> Launch New World Championship Cycle
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="sm:col-span-2">
              <label className="text-xs font-semibold">Championship Name</label>
              <Input
                value={cycleName}
                onChange={(e) => setCycleName(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-xs font-semibold">Season / Year</label>
              <Input value={season} onChange={(e) => setSeason(e.target.value)} className="mt-1" />
            </div>
            <div>
              <label className="text-xs font-semibold">Qualification Format</label>
              <select
                value={qualFormat}
                onChange={(e) => setQualFormat(e.target.value as QualFormat)}
                className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-xs"
              >
                {QUAL_FORMATS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold">Candidates Qualifiers (2–8):</label>
              <Input
                type="number"
                min={2}
                max={8}
                value={qualifySlots}
                onChange={(e) =>
                  setQualifySlots(Math.max(2, Math.min(8, Number(e.target.value) || 8)))
                }
                className="w-20 h-8 text-xs"
              />
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => selectTopBots(8)}>
                Top 8 Rated
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => selectTopBots(12)}>
                Top 12 Rated
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedBotIds([])}>
                Clear
              </Button>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold mb-2 block">
              Select Participating Bots ({selectedBotIds.length} selected)
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 max-h-64 overflow-y-auto p-2 border border-border rounded-lg bg-background/50">
              {bots
                .filter((b) => b.id !== reigning.botId)
                .map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => toggleBotSelection(b.id)}
                    className={cn(
                      "flex items-center gap-2 p-2 rounded-md border text-left text-xs transition-colors",
                      selectedBotIds.includes(b.id)
                        ? "border-warning bg-warning/15 font-semibold text-warning"
                        : "border-border hover:bg-muted/50",
                    )}
                  >
                    {b.avatar ? (
                      <img
                        src={b.avatar}
                        alt={b.name}
                        className="w-6 h-6 rounded-full object-cover shrink-0"
                      />
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-secondary grid place-items-center shrink-0">
                        <Bot className="w-3.5 h-3.5 text-muted-foreground" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate">{b.name}</div>
                      <div className="text-[10px] text-muted-foreground font-mono">{b.elo}</div>
                    </div>
                  </button>
                ))}
            </div>
          </div>

          <Button
            onClick={handleCreateCycle}
            className="w-full bg-warning text-warning-foreground font-bold hover:bg-warning/90"
          >
            Launch Official Championship Cycle
          </Button>
        </Card>
      ) : (
        /* Active Cycle Control Hub */
        <div className="space-y-4">
          <Card className="p-6 bg-card border-border space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-warning font-semibold">
                    ACTIVE CHAMPIONSHIP CYCLE
                  </span>
                  {cycle.isPaused && (
                    <Badge variant="outline" className="text-[10px] border-warning/50 text-warning">
                      PAUSED
                    </Badge>
                  )}
                </div>
                <h3 className="text-xl font-bold">{cycle.name}</h3>
                <p className="text-xs text-muted-foreground">
                  {cycle.season} • Current Stage:{" "}
                  <span className="text-foreground font-bold uppercase">{cycle.stage}</span>
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleTogglePause}
                  className="gap-1.5 text-xs"
                >
                  {cycle.isPaused ? (
                    <>
                      <Play className="w-3.5 h-3.5" /> Resume
                    </>
                  ) : (
                    <>
                      <Pause className="w-3.5 h-3.5" /> Pause
                    </>
                  )}
                </Button>
                {cycle.stage === "qualification" && (
                  <Button
                    size="sm"
                    onClick={advanceToCandidates}
                    className="bg-warning text-warning-foreground font-bold hover:bg-warning/90 gap-1.5"
                  >
                    Advance to Candidates <ArrowRight className="w-4 h-4" />
                  </Button>
                )}
                {cycle.stage === "candidates" && (
                  <Button
                    size="sm"
                    onClick={advanceToMatch}
                    className="bg-warning text-warning-foreground font-bold hover:bg-warning/90 gap-1.5"
                  >
                    Start Title Match <ArrowRight className="w-4 h-4" />
                  </Button>
                )}
                {cycle.stage === "match" && cycle.match.tiebreaksRequired && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={addTiebreakGames}
                    className="gap-1.5 font-bold"
                  >
                    Launch Tiebreaks (4 Games)
                  </Button>
                )}
                {cycle.stage === "match" && (
                  <Button
                    size="sm"
                    onClick={() => declareWinner(recommendedWinnerId)}
                    className="bg-emerald-600 text-white font-bold hover:bg-emerald-500 gap-1.5"
                  >
                    <Trophy className="w-4 h-4" /> Declare & Crown Winner
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleResetCycle}
                  className="text-xs text-destructive hover:text-destructive gap-1"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Reset
                </Button>
              </div>
            </div>

            {/* Quick Stats Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
              <div className="p-3 rounded-lg bg-background border border-border">
                <div className="text-xs text-muted-foreground">Qualification Stage</div>
                <div className="text-sm font-bold">
                  {cycle.qualification.botIds.length} Bots ·{" "}
                  {cycle.qualification.games.filter((g) => g.status === "completed").length}/
                  {cycle.qualification.games.length} Games
                </div>
              </div>
              <div className="p-3 rounded-lg bg-background border border-border">
                <div className="text-xs text-muted-foreground">Candidates Stage</div>
                <div className="text-sm font-bold">
                  {cycle.candidates.botIds.length > 0
                    ? `${cycle.candidates.botIds.length} Contenders · ${
                        cycle.candidates.games.filter((g) => g.status === "completed").length
                      }/${cycle.candidates.games.length} Games`
                    : `${Math.min(8, cycle.qualification.qualifySlots)} Qualifiers`}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-background border border-border">
                <div className="text-xs text-muted-foreground">Championship Match</div>
                <div className="text-sm font-bold">
                  {cycle.stage === "match"
                    ? `${cycle.match.championScore} - ${cycle.match.challengerScore} (Target ${cycle.match.targetScore})`
                    : "Awaiting Candidates Winner"}
                </div>
              </div>
            </div>

            {/* Match / Round Execution Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl bg-background/60 border border-border">
              <div className="text-xs">
                <span className="font-bold">Stage Progress:</span> {completedCount} /{" "}
                {currentStageGames.length} games completed
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {runningGameId ? (
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={handleStopRunning}
                    className="gap-1.5"
                  >
                    <StopIcon className="w-3.5 h-3.5" /> Stop Simulation ({livePlies} plies)
                  </Button>
                ) : (
                  <>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={cycle.isPaused || completedCount >= currentStageGames.length}
                      onClick={handleRunNextGame}
                      className="gap-1.5"
                    >
                      <Play className="w-3.5 h-3.5" /> Play Next Game
                    </Button>
                    <Button
                      size="sm"
                      disabled={cycle.isPaused || completedCount >= currentStageGames.length}
                      onClick={handleRunAllRemaining}
                      className="bg-warning text-warning-foreground hover:bg-warning/90 gap-1.5 font-semibold"
                    >
                      <FastForward className="w-3.5 h-3.5" /> Run Remaining Games
                    </Button>
                  </>
                )}
              </div>
            </div>

            {/* Live Mini Board when running a game in Studio */}
            {runningGameId && (
              <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-4 items-center p-4 rounded-xl border border-warning/30 bg-warning/5">
                <div className="w-full max-w-[320px] mx-auto">
                  <Board
                    game={liveBoardGame}
                    flipped={false}
                    disabled
                    lastMove={liveLastMove}
                    onAttemptMove={() => false}
                    force2D
                  />
                </div>
                <div className="space-y-2 text-xs">
                  <div className="inline-flex items-center gap-1.5 font-mono uppercase text-warning font-bold">
                    Live Match Engine Running
                  </div>
                  <div className="text-sm font-bold">
                    {(() => {
                      const g = currentStageGames.find((x) => x.id === runningGameId);
                      if (!g) return "Active Match";
                      const w = botMap.get(g.whiteBotId)?.name ?? g.whiteBotId;
                      const b = botMap.get(g.blackBotId)?.name ?? g.blackBotId;
                      return `Game #${g.gameNumber}: ${w} (White) vs ${b} (Black)`;
                    })()}
                  </div>
                  <p className="text-muted-foreground">
                    Plies played: <span className="font-mono font-semibold">{livePlies}</span> •{" "}
                    {runningBatch ? "Auto-running stage schedule" : "Single game execution"}
                  </p>
                </div>
              </div>
            )}

            {/* Stage Pairings List */}
            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Stage Schedule & Results
              </div>
              <div className="max-h-64 overflow-y-auto divide-y divide-border/60 rounded-lg border border-border bg-background/40">
                {currentStageGames.map((g) => {
                  const wName = botMap.get(g.whiteBotId)?.name ?? g.whiteBotId;
                  const bName = botMap.get(g.blackBotId)?.name ?? g.blackBotId;
                  return (
                    <div
                      key={g.id}
                      className="flex items-center justify-between gap-3 px-3 py-2 text-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-mono text-muted-foreground w-8 shrink-0">
                          #{g.gameNumber}
                        </span>
                        <span className="font-semibold truncate">{wName}</span>
                        <span className="text-muted-foreground">vs</span>
                        <span className="font-semibold truncate">{bName}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {g.status === "completed" ? (
                          <span className="inline-flex items-center gap-1 font-mono font-bold text-emerald-500">
                            <CheckCircle2 className="w-3.5 h-3.5" /> {g.result}
                          </span>
                        ) : g.status === "live" ? (
                          <Badge className="bg-warning/20 text-warning border-warning/40 text-[10px]">
                            LIVE
                          </Badge>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={cycle.isPaused || !!runningGameId}
                            onClick={() => void runSingleGame(cycle, g)}
                            className="h-6 px-2 text-[11px]"
                          >
                            <Play className="w-3 h-3 mr-1" /> Play
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
