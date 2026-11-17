import { useEffect, useMemo, useState } from "react";
import { Chess, type Square } from "chess.js";
import {
  Award,
  Bot,
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  Crown,
  History,
  ListChecks,
  PlaySquare,
  Trophy,
} from "lucide-react";
import {
  fetchChampionshipData,
  getActiveCycle,
  getHallOfFame,
  getReigningChampion,
  subscribeChampionship,
  type ChampionshipCycle,
  type HallOfFameRecord,
  type ReigningChampion,
  type ScheduledGame,
} from "@/lib/championshipStore";
import { loadBots, subscribeBots, type BotConfig } from "@/lib/botStore";
import { Board } from "./Board";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function ChampionshipHub() {
  const [cycle, setCycle] = useState<ChampionshipCycle | null>(getActiveCycle());
  const [hall, setHall] = useState<HallOfFameRecord[]>(getHallOfFame());
  const [reigning, setReigning] = useState<ReigningChampion>(getReigningChampion());
  const [bots, setBots] = useState<BotConfig[]>([]);
  const [activeTab, setActiveTab] = useState<"live" | "candidates" | "qual" | "hall">("live");
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [replayMoveIndex, setReplayMoveIndex] = useState<number | null>(null);

  useEffect(() => {
    setBots(loadBots());
    const unsubBots = subscribeBots(() => setBots(loadBots()));
    fetchChampionshipData().then((data) => {
      setCycle(data.activeCycle);
      setHall(data.hall);
      setReigning(data.reigning);
    });
    const unsubChamp = subscribeChampionship(() => {
      setCycle(getActiveCycle());
      setHall(getHallOfFame());
      setReigning(getReigningChampion());
    });

    // Gentle spectator sync poll when viewing Championship Hub
    const poll = window.setInterval(() => {
      void fetchChampionshipData();
    }, 5000);

    return () => {
      unsubBots();
      unsubChamp();
      window.clearInterval(poll);
    };
  }, []);

  const botMap = useMemo(() => {
    const m = new Map<string, BotConfig>();
    for (const b of bots) m.set(b.id, b);
    return m;
  }, [bots]);

  const featuredGame: ScheduledGame | null = useMemo(() => {
    if (!cycle) return null;
    const allStageGames =
      cycle.stage === "match"
        ? cycle.match.games
        : cycle.stage === "candidates"
          ? cycle.candidates.games
          : cycle.stage === "qualification"
            ? cycle.qualification.games
            : cycle.match.games;

    if (selectedGameId) {
      const found = allStageGames.find((g) => g.id === selectedGameId);
      if (found) return found;
    }
    const live = allStageGames.find((g) => g.status === "live");
    if (live) return live;
    const completed = [...allStageGames].reverse().find((g) => g.status === "completed");
    return completed ?? allStageGames[0] ?? null;
  }, [cycle, selectedGameId]);

  const { boardGame, lastMove, totalMoves } = useMemo(() => {
    const g = new Chess();
    const moves = featuredGame?.moveHistory ?? [];
    const limit =
      replayMoveIndex === null
        ? moves.length
        : Math.max(0, Math.min(moves.length, replayMoveIndex));
    let lm: { from: Square; to: Square } | null = null;
    for (let i = 0; i < limit; i++) {
      const m = g.move(moves[i]);
      if (m && i === limit - 1) {
        lm = { from: m.from as Square, to: m.to as Square };
      }
    }
    return { boardGame: g, lastMove: lm, totalMoves: moves.length };
  }, [featuredGame, replayMoveIndex]);

  const currentMatchGameNumber = useMemo(() => {
    if (!cycle || cycle.stage !== "match") return 1;
    const liveIdx = cycle.match.games.findIndex((g) => g.status === "live");
    if (liveIdx >= 0) return cycle.match.games[liveIdx].gameNumber;
    const completed = cycle.match.games.filter((g) => g.status === "completed").length;
    return Math.min(cycle.match.totalGames, Math.max(1, completed + 1));
  }, [cycle]);

  return (
    <div className="max-w-6xl mx-auto p-3 sm:p-6 space-y-6">
      {/* REIGNING CHAMPION HERO */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#1a1d21] via-[#121417] to-[#1a1d21] border border-amber-500/30 p-6 sm:p-8 shadow-2xl">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-6 relative z-10">
          <div className="flex items-center gap-5">
            <div className="relative shrink-0">
              {reigning.avatarUrl ? (
                <img
                  src={reigning.avatarUrl}
                  alt={reigning.botName}
                  className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl object-cover ring-2 ring-amber-500 shadow-xl"
                />
              ) : (
                <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-zinc-800 grid place-items-center ring-2 ring-amber-500 shadow-xl">
                  <Bot className="w-10 h-10 text-amber-400" />
                </div>
              )}
              <div className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-amber-500 grid place-items-center text-black shadow-md">
                <Crown className="w-5 h-5 fill-black" />
              </div>
            </div>
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 text-[11px] font-bold tracking-wider uppercase border border-amber-500/30">
                Official World Champion
              </div>
              <h1 className="text-2xl sm:text-3xl font-black text-white mt-1">
                {reigning.botName}
              </h1>
              <p className="text-xs text-zinc-400">
                Rating: <span className="font-semibold text-white">{reigning.rating}</span> • Title
                Defenses:{" "}
                <span className="font-semibold text-amber-400">{reigning.defensesCount}</span> •
                Reign: Since {reigning.reignSince}
              </p>
            </div>
          </div>
          <div className="text-center sm:text-right sm:border-l sm:border-zinc-800 sm:pl-6 space-y-1">
            <div className="text-[11px] uppercase tracking-wider text-zinc-400 font-mono">
              Championship Status
            </div>
            <div className="text-sm font-bold text-amber-400 capitalize">
              {cycle
                ? cycle.stage === "completed"
                  ? "Cycle Concluded"
                  : `${cycle.stage} Stage Active`
                : "Next Cycle Upcoming"}
            </div>
            {cycle && (
              <div className="text-[11px] text-zinc-400">
                {cycle.name} ({cycle.season})
              </div>
            )}
          </div>
        </div>
      </div>

      {/* TABS */}
      <div className="flex flex-wrap gap-2 border-b border-border pb-2">
        <button
          onClick={() => setActiveTab("live")}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all",
            activeTab === "live"
              ? "bg-amber-500 text-black shadow-lg shadow-amber-500/20"
              : "text-muted-foreground hover:text-foreground hover:bg-secondary/60",
          )}
        >
          <PlaySquare className="w-4 h-4" /> Live Title Match
        </button>
        <button
          onClick={() => setActiveTab("candidates")}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all",
            activeTab === "candidates"
              ? "bg-amber-500 text-black shadow-lg shadow-amber-500/20"
              : "text-muted-foreground hover:text-foreground hover:bg-secondary/60",
          )}
        >
          <Trophy className="w-4 h-4" /> Candidates Tournament
        </button>
        <button
          onClick={() => setActiveTab("qual")}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all",
            activeTab === "qual"
              ? "bg-amber-500 text-black shadow-lg shadow-amber-500/20"
              : "text-muted-foreground hover:text-foreground hover:bg-secondary/60",
          )}
        >
          <ListChecks className="w-4 h-4" /> Qualification
        </button>
        <button
          onClick={() => setActiveTab("hall")}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all",
            activeTab === "hall"
              ? "bg-amber-500 text-black shadow-lg shadow-amber-500/20"
              : "text-muted-foreground hover:text-foreground hover:bg-secondary/60",
          )}
        >
          <History className="w-4 h-4" /> Hall of Champions
        </button>
      </div>

      {/* TAB CONTENT: LIVE MATCH */}
      {activeTab === "live" && (
        <Card className="p-6 bg-card border-border space-y-6">
          {!cycle || (cycle.stage !== "match" && cycle.stage !== "completed") ? (
            <div className="space-y-6">
              <div className="text-center py-6 space-y-2 text-muted-foreground">
                <Trophy className="w-10 h-10 mx-auto text-muted-foreground/60 mb-2" />
                <div className="font-bold text-foreground">No Title Match Currently Active</div>
                <p className="text-xs max-w-md mx-auto">
                  The Candidates tournament must conclude before the 14-game World Championship
                  Match begins.
                  {cycle ? ` Currently tracking ${cycle.stage} stage games below.` : ""}
                </p>
              </div>
              {featuredGame && (
                <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-6 items-start border-t border-border pt-6">
                  <div className="w-full mx-auto">
                    <Board
                      game={boardGame}
                      flipped={false}
                      disabled
                      lastMove={lastMove}
                      onAttemptMove={() => false}
                    />
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono uppercase text-amber-500 font-bold">
                        Featured {cycle?.stage} Game #{featuredGame.gameNumber}
                      </span>
                      <Badge variant="outline" className="text-[10px] uppercase">
                        {featuredGame.status}
                      </Badge>
                    </div>
                    <div className="text-sm font-bold">
                      {botMap.get(featuredGame.whiteBotId)?.name ?? featuredGame.whiteBotId} vs{" "}
                      {botMap.get(featuredGame.blackBotId)?.name ?? featuredGame.blackBotId}
                    </div>
                    {totalMoves > 0 && (
                      <div className="flex items-center gap-1.5">
                        <Button size="sm" variant="secondary" onClick={() => setReplayMoveIndex(0)}>
                          <ChevronFirst className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() =>
                            setReplayMoveIndex((i) => Math.max(0, (i ?? totalMoves) - 1))
                          }
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </Button>
                        <span className="text-xs font-mono px-2">
                          {replayMoveIndex ?? totalMoves}/{totalMoves}
                        </span>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() =>
                            setReplayMoveIndex((i) =>
                              i === null ? totalMoves : Math.min(totalMoves, i + 1),
                            )
                          }
                        >
                          <ChevronRight className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => setReplayMoveIndex(null)}
                        >
                          <ChevronLast className="w-4 h-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              {/* Match Header Score */}
              <div className="flex flex-col sm:flex-row items-center justify-around gap-6 p-6 rounded-xl bg-secondary/30 border border-border">
                <div className="text-center space-y-1.5">
                  <div className="text-xs uppercase font-mono text-amber-500 font-bold">
                    Reigning Champion
                  </div>
                  <div className="text-xl font-black">
                    {botMap.get(cycle.match.championId)?.name || reigning.botName}
                  </div>
                  <div className="text-4xl font-black text-amber-500">
                    {cycle.match.championScore}
                  </div>
                </div>
                <div className="text-center space-y-1">
                  <div className="text-xs text-muted-foreground uppercase font-mono">
                    Game {currentMatchGameNumber} of {cycle.match.totalGames}
                  </div>
                  <div className="text-2xl font-bold text-muted-foreground font-mono">VS</div>
                  <div className="text-xs text-muted-foreground">
                    First to {cycle.match.targetScore} wins
                  </div>
                </div>
                <div className="text-center space-y-1.5">
                  <div className="text-xs uppercase font-mono text-sky-400 font-bold">
                    Candidates Challenger
                  </div>
                  <div className="text-xl font-black">
                    {botMap.get(cycle.match.challengerId)?.name || "Challenger"}
                  </div>
                  <div className="text-4xl font-black text-sky-400">
                    {cycle.match.challengerScore}
                  </div>
                </div>
              </div>

              {/* Spectator Board & Schedule */}
              <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-6 items-start">
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs px-1">
                    <span className="font-semibold">
                      {featuredGame
                        ? `Game ${featuredGame.gameNumber}: ${
                            botMap.get(featuredGame.whiteBotId)?.name ?? featuredGame.whiteBotId
                          } (White) vs ${
                            botMap.get(featuredGame.blackBotId)?.name ?? featuredGame.blackBotId
                          } (Black)`
                        : "Championship Board"}
                    </span>
                    {featuredGame?.result && featuredGame.status === "completed" && (
                      <Badge variant="secondary" className="font-mono">
                        {featuredGame.result}
                      </Badge>
                    )}
                  </div>
                  <div className="w-full mx-auto">
                    <Board
                      game={boardGame}
                      flipped={false}
                      disabled
                      lastMove={lastMove}
                      onAttemptMove={() => false}
                    />
                  </div>
                  {totalMoves > 0 && (
                    <div className="flex items-center justify-center gap-1.5">
                      <Button size="sm" variant="secondary" onClick={() => setReplayMoveIndex(0)}>
                        <ChevronFirst className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          setReplayMoveIndex((i) => Math.max(0, (i ?? totalMoves) - 1))
                        }
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </Button>
                      <span className="text-xs font-mono px-2 min-w-[64px] text-center">
                        {replayMoveIndex ?? totalMoves} / {totalMoves}
                      </span>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          setReplayMoveIndex((i) =>
                            i === null ? totalMoves : Math.min(totalMoves, i + 1),
                          )
                        }
                      >
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setReplayMoveIndex(null)}
                      >
                        <ChevronLast className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-border bg-background/50 overflow-hidden">
                  <div className="px-3 py-2.5 border-b border-border text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Match Games
                  </div>
                  <div className="max-h-[420px] overflow-y-auto divide-y divide-border/50">
                    {cycle.match.games.map((g) => {
                      const active = featuredGame?.id === g.id;
                      const wName = botMap.get(g.whiteBotId)?.name ?? g.whiteBotId;
                      const bName = botMap.get(g.blackBotId)?.name ?? g.blackBotId;
                      return (
                        <button
                          key={g.id}
                          type="button"
                          onClick={() => {
                            setSelectedGameId(g.id);
                            setReplayMoveIndex(null);
                          }}
                          className={cn(
                            "w-full text-left px-3 py-2 text-xs flex items-center justify-between gap-2 hover:bg-secondary/40 transition-colors",
                            active && "bg-amber-500/10 text-amber-400 font-semibold",
                          )}
                        >
                          <div className="truncate">
                            <span className="font-mono text-muted-foreground mr-2">
                              G{g.gameNumber}
                            </span>
                            {wName} vs {bName}
                          </div>
                          <span className="font-mono shrink-0 text-[11px]">
                            {g.status === "completed"
                              ? g.result
                              : g.status === "live"
                                ? "LIVE"
                                : "—"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* TAB CONTENT: CANDIDATES STANDINGS */}
      {activeTab === "candidates" && (
        <Card className="p-6 bg-card border-border">
          <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
            <Trophy className="w-5 h-5 text-amber-500" /> Official Candidates Leaderboard
          </h3>
          {!cycle || cycle.candidates.standings.length === 0 ? (
            <div className="py-10 text-center text-xs text-muted-foreground">
              The Candidates Tournament has not started yet for the current cycle.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-secondary/60 text-muted-foreground uppercase font-mono border-b border-border">
                  <tr>
                    <th className="p-3">#</th>
                    <th className="p-3">Bot</th>
                    <th className="p-3">Rating</th>
                    <th className="p-3 text-center">Played</th>
                    <th className="p-3 text-center">W</th>
                    <th className="p-3 text-center">D</th>
                    <th className="p-3 text-center">L</th>
                    <th className="p-3 text-right">Points</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {cycle.candidates.standings.map((s, idx) => (
                    <tr
                      key={s.botId}
                      className={idx === 0 ? "bg-amber-500/10 font-bold text-amber-400" : ""}
                    >
                      <td className="p-3">{idx + 1}</td>
                      <td className="p-3 flex items-center gap-2">
                        {s.avatarUrl ? (
                          <img
                            src={s.avatarUrl}
                            alt=""
                            className="w-5 h-5 rounded-full object-cover"
                          />
                        ) : (
                          <Bot className="w-4 h-4 text-muted-foreground" />
                        )}
                        <span>{s.botName}</span>
                        {idx === 0 && <Crown className="w-3.5 h-3.5 text-amber-400" />}
                      </td>
                      <td className="p-3 text-muted-foreground font-mono">{s.rating}</td>
                      <td className="p-3 text-center">{s.played}</td>
                      <td className="p-3 text-center text-emerald-500">{s.wins}</td>
                      <td className="p-3 text-center text-muted-foreground">{s.draws}</td>
                      <td className="p-3 text-center text-rose-500">{s.losses}</td>
                      <td className="p-3 text-right font-bold text-sm">{s.points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* TAB CONTENT: QUALIFICATION STANDINGS */}
      {activeTab === "qual" && (
        <Card className="p-6 bg-card border-border">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold flex items-center gap-2">
              <Award className="w-5 h-5 text-amber-500" /> Qualification Standings
            </h3>
            {cycle && (
              <Badge variant="outline" className="text-[11px] uppercase font-mono">
                {cycle.qualification.format.replace(/_/g, " ")} · Top{" "}
                {cycle.qualification.qualifySlots} Qualify
              </Badge>
            )}
          </div>
          {!cycle || cycle.qualification.standings.length === 0 ? (
            <div className="py-10 text-center text-xs text-muted-foreground">
              No active Qualification tournament at this time.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-secondary/60 text-muted-foreground uppercase font-mono border-b border-border">
                  <tr>
                    <th className="p-3">#</th>
                    <th className="p-3">Bot</th>
                    <th className="p-3">Rating</th>
                    <th className="p-3 text-center">Played</th>
                    <th className="p-3 text-center">W</th>
                    <th className="p-3 text-center">D</th>
                    <th className="p-3 text-center">L</th>
                    <th className="p-3 text-right">Points</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {cycle.qualification.standings.map((s, idx) => {
                    const isQualifying = idx < (cycle.qualification.qualifySlots || 8);
                    return (
                      <tr
                        key={s.botId}
                        className={isQualifying ? "bg-emerald-500/5" : "opacity-75"}
                      >
                        <td className="p-3 font-mono">{idx + 1}</td>
                        <td className="p-3 flex items-center gap-2">
                          {s.avatarUrl ? (
                            <img
                              src={s.avatarUrl}
                              alt=""
                              className="w-5 h-5 rounded-full object-cover"
                            />
                          ) : (
                            <Bot className="w-4 h-4 text-muted-foreground" />
                          )}
                          <span className="font-semibold">{s.botName}</span>
                          {isQualifying && (
                            <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-500 text-[9px] font-bold uppercase">
                              Q
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-muted-foreground font-mono">{s.rating}</td>
                        <td className="p-3 text-center">{s.played}</td>
                        <td className="p-3 text-center text-emerald-500">{s.wins}</td>
                        <td className="p-3 text-center text-muted-foreground">{s.draws}</td>
                        <td className="p-3 text-center text-rose-500">{s.losses}</td>
                        <td className="p-3 text-right font-bold text-sm">{s.points}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* TAB CONTENT: HALL OF CHAMPIONS */}
      {activeTab === "hall" && (
        <div className="space-y-4">
          {hall.length === 0 ? (
            <Card className="p-12 text-center text-muted-foreground text-xs">
              No previous championship records archived yet.
            </Card>
          ) : (
            hall.map((record, i) => (
              <Card
                key={`${record.cycleId}-${i}`}
                className="p-5 bg-card border-border flex items-center justify-between gap-4"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/30 grid place-items-center text-amber-500 shrink-0">
                    <Crown className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="text-[11px] font-mono text-muted-foreground uppercase">
                      {record.year} • {record.cycleName}
                    </div>
                    <div className="text-base font-bold flex items-center gap-2 flex-wrap">
                      {record.championName}{" "}
                      <span className="text-xs font-normal text-muted-foreground">def.</span>{" "}
                      {record.challengerName}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Concluded: {record.dateConcluded} • {record.gamesPlayed} Games Played
                    </div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xs font-mono text-muted-foreground">Score</div>
                  <div className="text-lg font-black text-amber-500">{record.finalScore}</div>
                </div>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
}
