import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  ArrowLeft,
  Bot as BotIcon,
  Check,
  Crown,
  Pause,
  Play,
  Sparkles,
  Swords,
  Trophy,
  User,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  BOT_CATEGORIES,
  loadBots,
  subscribeBots,
  type BotConfig,
} from "@/lib/botStore";
import {
  BotVsBotMatch,
  BotVsBotMode,
  SpeedSelector,
  type MatchResult,
  type SpeedSetting,
} from "./BotVsBotMode";
import { HumanVsBotMatch, type PlayerProfileLite } from "./HumanVsBotMatch";
import { TitleBadge } from "./ChessApp";
import { useAuth } from "@/lib/useAuth";
import type { Color } from "chess.js";

const PLAYER_ID = "__player__";
type Participant =
  | { kind: "bot"; id: string; bot: BotConfig }
  | { kind: "player"; id: string; profile: PlayerProfileLite };

function pName(p: Participant): string { return p.kind === "bot" ? p.bot.name : p.profile.name; }
function pElo(p: Participant): number { return p.kind === "bot" ? p.bot.elo : p.profile.elo; }
function pTitle(p: Participant): { title?: string | null; color?: string | null } {
  return p.kind === "bot"
    ? { title: p.bot.title, color: p.bot.titleColor }
    : { title: p.profile.title, color: p.profile.titleColor };
}
function pAvatar(p: Participant): string | null {
  return p.kind === "bot" ? (p.bot.avatar ?? null) : p.profile.avatar;
}

/* ============================================================
   Top-level Game Modes hub
   ============================================================ */

type HubView = "home" | "bvb-entry" | "bvb-single" | "bvb-tournament";

export function GameModesHub() {
  const [view, setView] = useState<HubView>("home");

  if (view === "bvb-single") return <BotVsBotMode onBack={() => setView("bvb-entry")} />;
  if (view === "bvb-tournament") return <TournamentMode onBack={() => setView("bvb-entry")} />;
  if (view === "bvb-entry") return <BotVsBotEntry onBack={() => setView("home")} onPick={setView} />;

  return (
    <div className="max-w-[1200px] mx-auto space-y-6">
      <header className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-md bg-primary/15 grid place-items-center ring-1 ring-primary/30">
          <Sparkles className="w-5 h-5 text-primary" />
        </div>
        <div>
          <div className="text-xl font-bold leading-tight">Game Modes</div>
          <div className="text-xs text-muted-foreground">Pick a mode to jump into.</div>
        </div>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <ModeCard
          title="Bot vs Bot"
          desc="Watch two bots play — as a single exhibition match or a full tournament."
          icon={<Swords className="w-6 h-6" />}
          available
          onOpen={() => setView("bvb-entry")}
        />
        <ModeCard
          title="Coming Soon"
          desc="More game modes are in the works."
          icon={<BotIcon className="w-6 h-6" />}
        />
        <ModeCard
          title="More Game Modes"
          desc="Stay tuned for new spectator and challenge modes."
          icon={<Trophy className="w-6 h-6" />}
        />
      </div>
    </div>
  );
}

function ModeCard({
  title,
  desc,
  icon,
  available,
  onOpen,
}: {
  title: string;
  desc: string;
  icon: React.ReactNode;
  available?: boolean;
  onOpen?: () => void;
}) {
  return (
    <Card
      className={cn(
        "p-5 flex flex-col gap-3 min-h-[180px]",
        available ? "bg-card hover:border-primary/40 transition-colors" : "bg-card/50 opacity-70",
      )}
    >
      <div className={cn(
        "w-11 h-11 rounded-md grid place-items-center",
        available ? "bg-primary/15 text-primary ring-1 ring-primary/30" : "bg-secondary text-muted-foreground",
      )}>
        {icon}
      </div>
      <div className="flex-1">
        <div className="text-base font-bold">{title}</div>
        <div className="text-xs text-muted-foreground mt-1">{desc}</div>
      </div>
      {available ? (
        <Button size="sm" onClick={onOpen} className="w-full font-semibold">
          Open Mode
        </Button>
      ) : (
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground text-center border border-dashed border-border/60 rounded-md py-1.5">
          Coming Soon
        </div>
      )}
    </Card>
  );
}

/* ============================================================
   Bot vs Bot entry: Single Match | Tournament
   ============================================================ */

function BotVsBotEntry({
  onBack,
  onPick,
}: {
  onBack: () => void;
  onPick: (v: HubView) => void;
}) {
  return (
    <div className="max-w-[1100px] mx-auto space-y-6">
      <div className="flex items-center justify-between gap-3">
        <header className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-md bg-primary/15 grid place-items-center ring-1 ring-primary/30">
            <Swords className="w-5 h-5 text-primary" />
          </div>
          <div>
            <div className="text-xl font-bold leading-tight">Bot vs Bot</div>
            <div className="text-xs text-muted-foreground">Choose how you want to watch.</div>
          </div>
        </header>
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-1.5" /> Back
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-6 bg-card hover:border-primary/40 transition-colors flex flex-col gap-4">
          <div className="w-11 h-11 rounded-md bg-primary/15 text-primary grid place-items-center ring-1 ring-primary/30">
            <Swords className="w-6 h-6" />
          </div>
          <div>
            <div className="text-lg font-bold">Single Match</div>
            <div className="text-xs text-muted-foreground mt-1">One-off exhibition between two bots. Includes speed control and replay.</div>
          </div>
          <Button className="w-full font-semibold" onClick={() => onPick("bvb-single")}>
            <Play className="w-4 h-4 mr-1.5" /> Start Single Match
          </Button>
        </Card>

        <Card className="p-6 bg-card hover:border-primary/40 transition-colors flex flex-col gap-4">
          <div className="w-11 h-11 rounded-md bg-primary/15 text-primary grid place-items-center ring-1 ring-primary/30">
            <Trophy className="w-6 h-6" />
          </div>
          <div>
            <div className="text-lg font-bold">Tournament</div>
            <div className="text-xs text-muted-foreground mt-1">Round robin, knockout, or championship match. Watch broadcast-style, one game at a time.</div>
          </div>
          <Button className="w-full font-semibold" onClick={() => onPick("bvb-tournament")}>
            <Trophy className="w-4 h-4 mr-1.5" /> Create Tournament
          </Button>
        </Card>
      </div>
    </div>
  );
}

/* ============================================================
   Tournament
   ============================================================ */

type TournamentType = "round-robin" | "knockout" | "championship";

type Pairing = {
  round: number;
  whiteId: string;
  blackId: string;
  result?: MatchResult["winner"] | null; // null while pending
  reason?: string;
};

type Standing = {
  botId: string;
  wins: number;
  losses: number;
  draws: number;
  points: number;
};

function TournamentMode({ onBack }: { onBack: () => void }) {
  const { profile } = useAuth();
  const [bots, setBots] = useState<BotConfig[]>([]);
  useEffect(() => {
    setBots(loadBots());
    return subscribeBots(() => setBots(loadBots()));
  }, []);

  const [stage, setStage] = useState<"setup" | "running">("setup");
  const [name, setName] = useState("New Tournament");
  const [type, setType] = useState<TournamentType>("round-robin");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [includePlayer, setIncludePlayer] = useState(false);
  const [speed, setSpeed] = useState<SpeedSetting>("normal");
  const [schedule, setSchedule] = useState<Pairing[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [matchKey, setMatchKey] = useState(0);

  const playerProfile: PlayerProfileLite | null = useMemo(() => {
    if (!profile) return null;
    return {
      name: profile.username || "You",
      avatar: profile.avatar_url,
      elo: profile.elo_rating,
      title: profile.title_badge ?? null,
      titleColor: null,
    };
  }, [profile]);

  const participants = useMemo<Participant[]>(() => {
    const list: Participant[] = selectedIds
      .map((id) => {
        const b = bots.find((x) => x.id === id);
        return b ? ({ kind: "bot", id: b.id, bot: b } as Participant) : null;
      })
      .filter(Boolean) as Participant[];
    if (includePlayer && playerProfile) {
      list.push({ kind: "player", id: PLAYER_ID, profile: playerProfile });
    }
    return list;
  }, [selectedIds, bots, includePlayer, playerProfile]);

  const canStart =
    (type === "championship" && participants.length === 2) ||
    (type === "round-robin" && participants.length >= 3) ||
    (type === "knockout" && participants.length >= 2);

  const toggle = (id: string) =>
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const startTournament = () => {
    const initial = buildInitialSchedule(type, participants.map((p) => p.id));
    setSchedule(initial);
    setCurrentIdx(0);
    setPaused(false);
    setCountdown(null);
    setStage("running");
    setMatchKey((k) => k + 1);
  };

  if (stage === "running") {
    return (
      <TournamentRunning
        key={matchKey}
        name={name}
        type={type}
        participants={participants}
        schedule={schedule}
        setSchedule={setSchedule}
        currentIdx={currentIdx}
        setCurrentIdx={setCurrentIdx}
        speed={speed}
        paused={paused}
        setPaused={setPaused}
        countdown={countdown}
        setCountdown={setCountdown}
        onExit={() => setStage("setup")}
      />
    );
  }

  return (
    <div className="max-w-[1200px] mx-auto space-y-6">
      <div className="flex items-center justify-between gap-3">
        <header className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-md bg-primary/15 grid place-items-center ring-1 ring-primary/30">
            <Trophy className="w-5 h-5 text-primary" />
          </div>
          <div>
            <div className="text-xl font-bold leading-tight">Create Tournament</div>
            <div className="text-xs text-muted-foreground">Set the format and pick your bots.</div>
          </div>
        </header>
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-1.5" /> Back
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-6">
        <div className="space-y-4 min-w-0">
          <Card className="bg-card p-4 space-y-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Tournament Name</div>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Summer Championship" />
            </div>

            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Format</div>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { key: "round-robin", label: "Round Robin", sub: "Everyone plays everyone" },
                    { key: "knockout", label: "Knockout", sub: "Single elimination" },
                    { key: "championship", label: "Championship", sub: "Best of 4 (2 bots)" },
                  ] as { key: TournamentType; label: string; sub: string }[]
                ).map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => {
                      setType(opt.key);
                      if (opt.key === "championship" && selectedIds.length > 2) {
                        setSelectedIds(selectedIds.slice(0, 2));
                      }
                    }}
                    className={cn(
                      "rounded-lg py-3 px-2 border text-center transition-colors",
                      type === opt.key
                        ? "bg-primary/15 border-primary/50 text-primary"
                        : "bg-secondary/30 border-transparent hover:bg-secondary/60",
                    )}
                  >
                    <div className="text-sm font-semibold">{opt.label}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">{opt.sub}</div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Match Speed</div>
              <SpeedSelector value={speed} onChange={setSpeed} />
              <div className="text-[10px] text-muted-foreground mt-1.5">
                Only changes the visible pace between moves. Bot strength is unchanged.
              </div>
            </div>
          </Card>

          {playerProfile && (
            <Card className="bg-card p-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-md bg-primary/15 grid place-items-center ring-1 ring-primary/40 overflow-hidden shrink-0">
                {playerProfile.avatar ? (
                  <img src={playerProfile.avatar} alt={playerProfile.name} className="w-full h-full object-cover" />
                ) : (
                  <User className="w-4 h-4 text-primary" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold truncate">Play as yourself</div>
                <div className="text-[11px] text-muted-foreground truncate">
                  {playerProfile.name} · ELO {playerProfile.elo}
                </div>
              </div>
              <button
                onClick={() => setIncludePlayer((v) => !v)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-semibold border transition-colors",
                  includePlayer
                    ? "bg-primary/15 border-primary/50 text-primary"
                    : "bg-secondary/40 border-transparent hover:bg-secondary/60",
                )}
              >
                {includePlayer ? "Joined" : "Join"}
              </button>
            </Card>
          )}

          <MultiBotPicker
            bots={bots}
            selectedIds={selectedIds}
            onToggle={toggle}
            max={type === "championship" ? (includePlayer ? 1 : 2) : undefined}
          />
        </div>

        <aside className="space-y-3">
          <Card className="bg-card p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Selected ({participants.length})</div>
            {participants.length === 0 ? (
              <div className="text-xs text-muted-foreground py-3 text-center border border-dashed border-border/60 rounded-md">
                No participants yet
              </div>
            ) : (
              <div className="space-y-1.5 max-h-[280px] overflow-auto scroll-thin">
                {participants.map((p) => {
                  const t = pTitle(p);
                  return (
                    <div key={p.id} className="flex items-center gap-2 bg-secondary/40 rounded-md p-2">
                      <ParticipantAvatar participant={p} size={28} />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-semibold truncate inline-flex items-center gap-1">
                          {t.title && <TitleBadge title={t.title} color={t.color} size="sm" />}
                          <span className="truncate">{pName(p)}</span>
                          {p.kind === "player" && (
                            <span className="text-[9px] uppercase tracking-wider text-primary/80">You</span>
                          )}
                        </div>
                        <div className="text-[10px] text-muted-foreground">ELO {pElo(p)}</div>
                      </div>
                      <button
                        onClick={() => {
                          if (p.kind === "player") setIncludePlayer(false);
                          else toggle(p.id);
                        }}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          <Card className="bg-card p-4 space-y-2 text-xs">
            <div className="font-semibold">Format rules</div>
            {type === "round-robin" && (
              <div className="text-muted-foreground">Every bot plays every other bot once. Min 3 bots. Win = 1 pt, Draw = 0.5, Loss = 0.</div>
            )}
            {type === "knockout" && (
              <div className="text-muted-foreground">Single-elimination bracket. Loser is out; draws re-decided by higher ELO. Min 2 bots.</div>
            )}
            {type === "championship" && (
              <div className="text-muted-foreground">Best of 4 games between exactly 2 bots. Colors alternate each game.</div>
            )}
          </Card>

          <Button
            onClick={startTournament}
            disabled={!canStart}
            className="w-full h-11 font-bold bg-success text-primary-foreground hover:bg-success/90"
          >
            <Play className="w-4 h-4 mr-1.5" /> Start Tournament
          </Button>
          {!canStart && (
            <div className="text-[10px] text-center text-muted-foreground">
              {type === "championship" ? "Select exactly 2 bots." : type === "round-robin" ? "Select at least 3 bots." : "Select at least 2 bots."}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

/* ───────── Tournament running ───────── */

function TournamentRunning({
  name,
  type,
  participants,
  schedule,
  setSchedule,
  currentIdx,
  setCurrentIdx,
  speed,
  paused,
  setPaused,
  countdown,
  setCountdown,
  onExit,
}: {
  name: string;
  type: TournamentType;
  participants: Participant[];
  schedule: Pairing[];
  setSchedule: React.Dispatch<React.SetStateAction<Pairing[]>>;
  currentIdx: number;
  setCurrentIdx: React.Dispatch<React.SetStateAction<number>>;
  speed: SpeedSetting;
  paused: boolean;
  setPaused: React.Dispatch<React.SetStateAction<boolean>>;
  countdown: number | null;
  setCountdown: React.Dispatch<React.SetStateAction<number | null>>;
  onExit: () => void;
}) {
  const byId = useMemo(() => new Map(participants.map((p) => [p.id, p])), [participants]);

  const current = schedule[currentIdx];
  const done = !current;

  const standings = useMemo<Standing[]>(() => {
    const map = new Map<string, Standing>();
    for (const p of participants) map.set(p.id, { botId: p.id, wins: 0, losses: 0, draws: 0, points: 0 });
    for (const p of schedule) {
      if (!p.result) continue;
      const w = map.get(p.whiteId)!;
      const bl = map.get(p.blackId)!;
      if (p.result === "white") { w.wins++; w.points += 1; bl.losses++; }
      else if (p.result === "black") { bl.wins++; bl.points += 1; w.losses++; }
      else { w.draws++; bl.draws++; w.points += 0.5; bl.points += 0.5; }
    }
    return Array.from(map.values()).sort((a, b) => b.points - a.points || b.wins - a.wins);
  }, [schedule, participants]);

  const onMatchFinished = useCallback(
    (res: MatchResult) => {
      setSchedule((prev) => {
        const next = [...prev];
        const p = next[currentIdx];
        if (!p || p.result != null) return prev;
        let outcome = res.winner;
        if (type === "knockout" && outcome === "draw") {
          const w = byId.get(p.whiteId)!;
          const b = byId.get(p.blackId)!;
          outcome = pElo(w) >= pElo(b) ? "white" : "black";
        }
        next[currentIdx] = { ...p, result: outcome, reason: res.reason };
        return next;
      });
      setCountdown(20);
    },
    [currentIdx, setSchedule, setCountdown, type, byId],
  );

  useEffect(() => {
    if (type !== "knockout") return;
    const rounds = Array.from(new Set(schedule.map((p) => p.round))).sort((a, b) => a - b);
    const last = rounds[rounds.length - 1];
    const lastRoundPairs = schedule.filter((p) => p.round === last);
    if (lastRoundPairs.some((p) => p.result == null)) return;
    if (lastRoundPairs.length <= 1) return;
    const winners = lastRoundPairs.map((p) => (p.result === "white" ? p.whiteId : p.result === "black" ? p.blackId : p.whiteId));
    const nextRound: Pairing[] = [];
    for (let i = 0; i + 1 < winners.length; i += 2) {
      nextRound.push({ round: last + 1, whiteId: winners[i], blackId: winners[i + 1], result: null });
    }
    if (winners.length % 2 === 1) {
      const bye = winners[winners.length - 1];
      nextRound.push({ round: last + 1, whiteId: bye, blackId: bye, result: "white", reason: "Bye" });
    }
    if (nextRound.length === 0) return;
    setSchedule((prev) => [...prev, ...nextRound]);
  }, [schedule, type, setSchedule]);

  useEffect(() => {
    if (countdown == null) return;
    if (paused) return;
    if (countdown <= 0) {
      setCountdown(null);
      setCurrentIdx((i) => i + 1);
      return;
    }
    const t = setTimeout(() => setCountdown((c) => (c == null ? null : c - 1)), 1000);
    return () => clearTimeout(t);
  }, [countdown, paused, setCountdown, setCurrentIdx]);

  const champion: Participant | undefined = useMemo(() => {
    if (!done) return undefined;
    if (type === "knockout") {
      const rounds = Array.from(new Set(schedule.map((p) => p.round))).sort((a, b) => a - b);
      const finalRound = schedule.filter((p) => p.round === rounds[rounds.length - 1]);
      if (finalRound.length === 1 && finalRound[0].result) {
        const winnerId = finalRound[0].result === "white" ? finalRound[0].whiteId : finalRound[0].blackId;
        return byId.get(winnerId);
      }
      return undefined;
    }
    return byId.get(standings[0]?.botId ?? "");
  }, [done, type, schedule, standings, byId]);

  return (
    <div className="max-w-[1500px] mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <header className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-md bg-primary/15 grid place-items-center ring-1 ring-primary/30 shrink-0">
            <Trophy className="w-5 h-5 text-primary" />
          </div>
          <div className="min-w-0">
            <div className="text-xl font-bold leading-tight truncate">{name}</div>
            <div className="text-xs text-muted-foreground">
              {labelForType(type)} · {participants.length} players · Speed: {speed}
            </div>
          </div>
        </header>
        <div className="flex items-center gap-2">
          {!done && (
            <Button variant="secondary" size="sm" onClick={() => setPaused((p) => !p)}>
              {paused ? <><Play className="w-4 h-4 mr-1.5" /> Resume</> : <><Pause className="w-4 h-4 mr-1.5" /> Pause</>}
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onExit}>
            <ArrowLeft className="w-4 h-4 mr-1.5" /> Exit
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-6">
        <div className="min-w-0">
          {done ? (
            <Card className="bg-card p-8 text-center space-y-4">
              <Crown className="w-14 h-14 text-primary mx-auto" />
              <div className="text-2xl font-black">Tournament Complete</div>
              {champion && (
                <div className="flex flex-col items-center gap-2">
                  <ParticipantAvatar participant={champion} size={80} />
                  <div className="text-lg font-bold inline-flex items-center gap-2">
                    {pTitle(champion).title && (
                      <TitleBadge title={pTitle(champion).title} color={pTitle(champion).color} size="md" />
                    )}
                    {pName(champion)}
                    {champion.kind === "player" && (
                      <span className="text-xs uppercase tracking-wider text-primary/80">You</span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">Champion · ELO {pElo(champion)}</div>
                </div>
              )}
              <Button onClick={onExit} className="mt-2">Back to setup</Button>
            </Card>
          ) : paused ? (
            <Card className="bg-card p-8 text-center space-y-4">
              <Pause className="w-12 h-12 text-primary mx-auto" />
              <div className="text-lg font-bold">Tournament paused</div>
              <div className="text-xs text-muted-foreground">Review the standings and resume whenever you're ready.</div>
              <Button onClick={() => setPaused(false)}>
                <Play className="w-4 h-4 mr-1.5" /> Resume Tournament
              </Button>
            </Card>
          ) : countdown != null && current && current.result != null ? (
            <Card className="bg-card p-8 text-center space-y-3">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Next match in</div>
              <div className="text-6xl font-black text-primary">{countdown}</div>
              <div className="text-xs text-muted-foreground">Get ready…</div>
              <Button variant="secondary" size="sm" onClick={() => { setCountdown(0); }}>
                Skip
              </Button>
            </Card>
          ) : current ? (
            (() => {
              const whiteP = byId.get(current.whiteId);
              const blackP = byId.get(current.blackId);
              if (!whiteP || !blackP) return null;
              const header = (
                <Card className="bg-card p-2.5 flex items-center justify-between text-xs">
                  <span className="font-semibold">
                    {labelForType(type)} · Round {current.round} · Game {currentIdx + 1} of {schedule.length}
                  </span>
                  <span className="text-muted-foreground">Speed: {speed}</span>
                </Card>
              );
              // Player is involved → Human vs Bot match.
              if (whiteP.kind === "player" || blackP.kind === "player") {
                const playerIsWhite = whiteP.kind === "player";
                const player = (playerIsWhite ? whiteP : blackP) as Extract<Participant, { kind: "player" }>;
                const botP = (playerIsWhite ? blackP : whiteP) as Extract<Participant, { kind: "bot" }>;
                const playerColor: Color = playerIsWhite ? "w" : "b";
                return (
                  <HumanVsBotMatch
                    key={currentIdx}
                    bot={botP.bot}
                    player={player.profile}
                    playerColor={playerColor}
                    onFinished={onMatchFinished}
                    headerExtra={header}
                  />
                );
              }
              // Bot vs Bot.
              return (
                <BotVsBotMatch
                  key={currentIdx}
                  white={(whiteP as Extract<Participant, { kind: "bot" }>).bot}
                  black={(blackP as Extract<Participant, { kind: "bot" }>).bot}
                  speed={speed}
                  hideExit
                  onFinished={onMatchFinished}
                  headerExtra={header}
                />
              );
            })()
          ) : null}
        </div>

        <aside className="space-y-3">
          <StandingsCard standings={standings} participants={byId} />
          <ScheduleCard schedule={schedule} participants={byId} currentIdx={currentIdx} />
        </aside>
      </div>
    </div>
  );
}

function StandingsCard({
  standings,
  participants,
}: {
  standings: Standing[];
  participants: Map<string, Participant>;
}) {
  return (
    <Card className="bg-card p-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-1 mb-2">Standings</div>
      <div className="overflow-auto scroll-thin max-h-[320px]">
        <table className="w-full text-xs">
          <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left px-2 py-1 w-6">#</th>
              <th className="text-left px-2 py-1">Player</th>
              <th className="text-center px-1 py-1">W</th>
              <th className="text-center px-1 py-1">L</th>
              <th className="text-center px-1 py-1">D</th>
              <th className="text-right px-2 py-1">Pts</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((s, i) => {
              const p = participants.get(s.botId);
              if (!p) return null;
              const t = pTitle(p);
              return (
                <tr key={s.botId} className={cn("odd:bg-secondary/30", p.kind === "player" && "bg-primary/10")}>
                  <td className="px-2 py-1 font-semibold">{i + 1}</td>
                  <td className="px-2 py-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <ParticipantAvatar participant={p} size={20} />
                      <span className="truncate inline-flex items-center gap-1">
                        {t.title && <TitleBadge title={t.title} color={t.color} size="sm" />}
                        <span className="truncate">{pName(p)}</span>
                        {p.kind === "player" && <span className="text-[9px] text-primary/80 uppercase">You</span>}
                      </span>
                    </div>
                  </td>
                  <td className="text-center px-1 py-1">{s.wins}</td>
                  <td className="text-center px-1 py-1">{s.losses}</td>
                  <td className="text-center px-1 py-1">{s.draws}</td>
                  <td className="text-right px-2 py-1 font-mono font-semibold">{s.points.toFixed(1)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function ScheduleCard({
  schedule,
  participants,
  currentIdx,
}: {
  schedule: Pairing[];
  participants: Map<string, Participant>;
  currentIdx: number;
}) {
  return (
    <Card className="bg-card p-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-1 mb-2">Schedule</div>
      <div className="overflow-auto scroll-thin max-h-[300px] space-y-1">
        {schedule.map((p, i) => {
          const w = participants.get(p.whiteId);
          const b = participants.get(p.blackId);
          if (!w || !b) return null;
          const isCurrent = i === currentIdx;
          const done = p.result != null;
          return (
            <div
              key={i}
              className={cn(
                "flex items-center gap-2 rounded-md px-2 py-1.5 text-xs",
                isCurrent && !done ? "bg-primary/15 ring-1 ring-primary/40" : "bg-secondary/30",
              )}
            >
              <span className="text-[10px] text-muted-foreground w-8 shrink-0">R{p.round}·{i + 1}</span>
              <span className={cn("flex-1 truncate", p.result === "white" && "font-semibold text-primary")}>{pName(w)}</span>
              <span className="text-muted-foreground text-[10px]">vs</span>
              <span className={cn("flex-1 truncate text-right", p.result === "black" && "font-semibold text-primary")}>{pName(b)}</span>
              <span className="w-10 text-right shrink-0">
                {done ? (
                  p.result === "draw" ? <span className="text-muted-foreground">½–½</span>
                  : <Check className="w-3.5 h-3.5 text-success inline" />
                ) : isCurrent ? <span className="text-primary text-[10px] uppercase">Live</span>
                : <span className="text-muted-foreground text-[10px]">—</span>}
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function ParticipantAvatar({ participant, size = 32 }: { participant: Participant; size?: number }) {
  const src = pAvatar(participant);
  return (
    <div
      className={cn(
        "rounded-md bg-secondary grid place-items-center overflow-hidden shrink-0",
        participant.kind === "player" ? "ring-1 ring-primary/50" : "ring-1 ring-border",
      )}
      style={{ width: size, height: size }}
    >
      {src ? (
        <img src={src} alt={pName(participant)} className="w-full h-full object-cover" />
      ) : (
        <User className="w-1/2 h-1/2 text-muted-foreground" />
      )}
    </div>
  );
}

/* ───────── Multi-select bot picker ───────── */

function MultiBotPicker({
  bots,
  selectedIds,
  onToggle,
  max,
}: {
  bots: BotConfig[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  max?: number;
}) {
  const atMax = max != null && selectedIds.length >= max;
  return (
    <Card className="bg-card p-3">
      <div className="flex items-center justify-between px-1 mb-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Bot Library</div>
        {max && <div className="text-[10px] text-muted-foreground">Max {max}</div>}
      </div>
      <Accordion type="multiple" className="w-full">
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
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2 pt-1">
                    {list.map((b) => {
                      const isMe = selectedIds.includes(b.id);
                      const disabled = !isMe && atMax;
                      return (
                        <button
                          key={b.id}
                          disabled={disabled}
                          onClick={() => onToggle(b.id)}
                          className={cn(
                            "flex items-center gap-2 rounded-lg p-2 transition-colors border text-left min-w-0",
                            isMe
                              ? "bg-primary/15 border-primary/40"
                              : "bg-secondary/30 hover:bg-secondary/60 border-transparent",
                            disabled && "opacity-40 cursor-not-allowed",
                          )}
                        >
                          <BotAvatar bot={b} size={32} />
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-semibold truncate inline-flex items-center gap-1 max-w-full">
                              {b.title && <TitleBadge title={b.title} color={b.titleColor} size="sm" />}
                              <span className="truncate">{b.name}</span>
                            </div>
                            <div className="text-[10px] text-muted-foreground">ELO {b.elo}</div>
                          </div>
                          {isMe && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
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

function BotAvatar({ bot, size = 32 }: { bot: BotConfig; size?: number }) {
  return (
    <div
      className="rounded-md bg-secondary grid place-items-center overflow-hidden ring-1 ring-border shrink-0"
      style={{ width: size, height: size }}
    >
      {bot.avatar ? (
        <img src={bot.avatar} alt={bot.name} className="w-full h-full object-cover" />
      ) : (
        <User className="w-1/2 h-1/2 text-muted-foreground" />
      )}
    </div>
  );
}

function labelForType(t: TournamentType): string {
  return t === "round-robin" ? "Round Robin" : t === "knockout" ? "Knockout" : "Championship";
}

/* ───────── Schedule builders ───────── */

function buildInitialSchedule(type: TournamentType, bots: BotConfig[]): Pairing[] {
  if (type === "round-robin") {
    const out: Pairing[] = [];
    for (let i = 0; i < bots.length; i++) {
      for (let j = i + 1; j < bots.length; j++) {
        // Alternate colors across pairings for fairness.
        const whiteFirst = (i + j) % 2 === 0;
        out.push({
          round: 1,
          whiteId: whiteFirst ? bots[i].id : bots[j].id,
          blackId: whiteFirst ? bots[j].id : bots[i].id,
          result: null,
        });
      }
    }
    return out;
  }
  if (type === "championship") {
    const [a, b] = bots;
    return [
      { round: 1, whiteId: a.id, blackId: b.id, result: null },
      { round: 2, whiteId: b.id, blackId: a.id, result: null },
      { round: 3, whiteId: a.id, blackId: b.id, result: null },
      { round: 4, whiteId: b.id, blackId: a.id, result: null },
    ];
  }
  // knockout — round 1 pairings; more rounds appended as results come in
  const shuffled = [...bots].sort(() => Math.random() - 0.5);
  const out: Pairing[] = [];
  for (let i = 0; i + 1 < shuffled.length; i += 2) {
    out.push({ round: 1, whiteId: shuffled[i].id, blackId: shuffled[i + 1].id, result: null });
  }
  if (shuffled.length % 2 === 1) {
    const bye = shuffled[shuffled.length - 1];
    out.push({ round: 1, whiteId: bye.id, blackId: bye.id, result: "white", reason: "Bye" });
  }
  return out;
}
