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
  Check,
  Crown,
  Pause,
  Play,
  Sparkles,
  Eye,
  Gauge,
  Grid3x3,
  Swords,
  Trophy,
  User,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { loadBots, subscribeBots, type BotConfig } from "@/lib/botStore";
import {
  BotVsBotMatch,
  BotVsBotMode,
  SpeedSelector,
  type MatchResult,
  type SpeedSetting,
} from "./BotVsBotMode";
import { HumanVsBotMatch, type PlayerProfileLite } from "./HumanVsBotMatch";
import { useUiSettings, visibleTiers } from "@/lib/appSettings";
import { SandboxBoard } from "./SandboxBoard";
import { TitleBadge } from "./ChessApp";
import { botDisplayIdentity, isImmersiveEnabled } from "@/lib/immersive";
import { useAuth } from "@/lib/useAuth";
import type { Color } from "chess.js";
import { Switch } from "@/components/ui/switch";

const PLAYER_ID = "__player__";
type Participant =
  | { kind: "bot"; id: string; bot: BotConfig }
  | { kind: "player"; id: string; profile: PlayerProfileLite };

function pName(p: Participant): string {
  return p.kind === "bot" ? botDisplayIdentity(p.bot, isImmersiveEnabled()).name : p.profile.name;
}
function pElo(p: Participant): number {
  return p.kind === "bot" ? p.bot.elo : p.profile.elo;
}
function pTitle(p: Participant): { title?: string | null; color?: string | null } {
  return p.kind === "bot"
    ? {
        title: botDisplayIdentity(p.bot, isImmersiveEnabled()).title,
        color: botDisplayIdentity(p.bot, isImmersiveEnabled()).titleColor,
      }
    : { title: p.profile.title, color: p.profile.titleColor };
}
function pAvatar(p: Participant): string | null {
  return p.kind === "bot" ? (p.bot.avatar ?? null) : p.profile.avatar;
}

/* ============================================================
   Top-level Game Modes hub
   ============================================================ */

type HubView = "home" | "bvb-entry" | "bvb-single" | "bvb-tournament" | "perspective" | "sandbox";

export function GameModesHub() {
  const [view, setView] = useState<HubView>("home");

  if (view === "bvb-single") return <BotVsBotMode onBack={() => setView("bvb-entry")} />;
  if (view === "bvb-tournament") return <TournamentMode onBack={() => setView("bvb-entry")} />;
  if (view === "sandbox") return <SandboxBoard onBack={() => setView("home")} />;
  if (view === "bvb-entry")
    return <BotVsBotEntry onBack={() => setView("home")} onPick={setView} />;

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
          title="Sandbox Board"
          desc="A free board where you move both sides and explore ideas."
          icon={<Grid3x3 className="w-6 h-6" />}
          available
          onOpen={() => setView("sandbox")}
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
        "evt-card evt-mode p-5 flex flex-col gap-3 min-h-[180px]",
        available ? "bg-card hover:border-primary/40 transition-colors" : "bg-card/50 opacity-70",
      )}
    >
      <div
        className={cn(
          "w-11 h-11 rounded-md grid place-items-center",
          available
            ? "bg-primary/15 text-primary ring-1 ring-primary/30"
            : "bg-secondary text-muted-foreground",
        )}
      >
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

function BotVsBotEntry({ onBack, onPick }: { onBack: () => void; onPick: (v: HubView) => void }) {
  return (
    <div className="max-w-[1100px] mx-auto space-y-6">
      <div className="flex items-center justify-between gap-3">
        <header className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/15 grid place-items-center ring-1 ring-primary/30">
            <Swords className="w-5 h-5 text-primary" />
          </div>
          <div>
            <div className="text-xl font-bold leading-tight tracking-tight">Bot vs Bot</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Choose how you want to watch.
            </div>
          </div>
        </header>
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-1.5" /> Back
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="evt-card p-6 bg-card hover:border-primary/40 transition-colors flex flex-col gap-4">
          <div className="w-11 h-11 rounded-lg bg-primary/15 text-primary grid place-items-center ring-1 ring-primary/30">
            <Swords className="w-6 h-6" />
          </div>
          <div>
            <div className="text-lg font-bold tracking-tight">Single Match</div>
            <div className="text-xs text-muted-foreground mt-1 leading-relaxed">
              One-off exhibition between two bots. Includes speed control and replay.
            </div>
          </div>
          <Button className="w-full font-semibold" onClick={() => onPick("bvb-single")}>
            <Play className="w-4 h-4 mr-1.5" /> Start Single Match
          </Button>
        </Card>

        <Card className="evt-card p-6 bg-card hover:border-primary/40 transition-colors flex flex-col gap-4">
          <div className="w-11 h-11 rounded-lg bg-primary/15 text-primary grid place-items-center ring-1 ring-primary/30">
            <Trophy className="w-6 h-6" />
          </div>
          <div>
            <div className="text-lg font-bold tracking-tight">Tournament</div>
            <div className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Round robin, knockout, or championship match. Watch broadcast-style, one game at a
              time.
            </div>
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

type TournamentType =
  "swiss" | "double-round-robin" | "world-cup" | "round-robin" | "knockout" | "championship";

type Pairing = {
  round: number;
  whiteId: string;
  blackId: string;
  result?: MatchResult["winner"] | null; // null while pending
  reason?: string;
  gameNumber?: number;
  totalGames?: number;
  isArmageddon?: boolean;
  matchId?: string;
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
  const [type, setType] = useState<TournamentType>("swiss");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [includePlayer, setIncludePlayer] = useState(false);
  const [speed, setSpeed] = useState<SpeedSetting>("normal");
  const [schedule, setSchedule] = useState<Pairing[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [matchKey, setMatchKey] = useState(0);
  const [showEval, setShowEval] = useState(false);

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
    (type === "world-cup" && participants.length >= 2) ||
    (type === "swiss" && participants.length >= 3) ||
    (type === "double-round-robin" && participants.length >= 3) ||
    (type === "round-robin" && participants.length >= 3) ||
    (type === "knockout" && participants.length >= 2);

  const toggle = (id: string) =>
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const startTournament = () => {
    const initial = buildInitialSchedule(
      type,
      participants.map((p) => p.id),
    );
    setSchedule(initial);
    setCurrentIdx(0);
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
        countdown={countdown}
        setCountdown={setCountdown}
        onExit={() => setStage("setup")}
        showEval={showEval}
      />
    );
  }

  return (
    <div className="max-w-[1200px] mx-auto space-y-6">
      <div className="flex items-center justify-between gap-3">
        <header className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/15 grid place-items-center ring-1 ring-primary/30">
            <Trophy className="w-5 h-5 text-primary" />
          </div>
          <div>
            <div className="text-xl font-bold leading-tight tracking-tight">Create Tournament</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Set the format and pick your bots.
            </div>
          </div>
        </header>
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-1.5" /> Back
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-6">
        <div className="space-y-4 min-w-0">
          <Card className="evt-card bg-card p-5 space-y-5">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                Tournament Name
              </div>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Summer Championship"
              />
            </div>

            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                Format
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {(
                  [
                    {
                      key: "swiss",
                      label: "Swiss System",
                      badge: "FIDE Olympiad",
                      sub: "Score-bracket pairings without elimination. All bots play every round.",
                    },
                    {
                      key: "double-round-robin",
                      label: "Double Round-Robin",
                      badge: "Candidates",
                      sub: "Every bot plays twice against each opponent (once White, once Black).",
                    },
                    {
                      key: "world-cup",
                      label: "FIDE World Cup",
                      badge: "Knockout Match",
                      sub: "2-game mini-matches with Armageddon sudden-death tiebreak on 1–1 draws.",
                    },
                    {
                      key: "round-robin",
                      label: "Single Round-Robin",
                      sub: "Classic round-robin where everyone plays each other once.",
                    },
                    {
                      key: "knockout",
                      label: "Single Knockout",
                      sub: "Single-elimination sudden-death tournament bracket.",
                    },
                    {
                      key: "championship",
                      label: "Championship Series",
                      sub: "Best-of-4 classical exhibition match between exactly 2 bots.",
                    },
                  ] as { key: TournamentType; label: string; badge?: string; sub: string }[]
                ).map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => {
                      setType(opt.key);
                      if (opt.key === "championship" && selectedIds.length > 2) {
                        setSelectedIds(selectedIds.slice(0, 2));
                      }
                    }}
                    className={cn(
                      "rounded-lg p-3 border text-left transition-all flex flex-col justify-between",
                      type === opt.key
                        ? "bg-primary/15 border-primary/50 text-foreground ring-1 ring-primary/40 shadow-sm"
                        : "bg-secondary/30 border-transparent hover:bg-secondary/60 text-foreground",
                    )}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <span className="text-xs font-bold leading-tight">{opt.label}</span>
                        {opt.badge && (
                          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-primary/20 text-primary uppercase font-bold shrink-0">
                            {opt.badge}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-muted-foreground leading-snug">
                        {opt.sub}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                Match Speed
              </div>
              <SpeedSelector value={speed} onChange={setSpeed} />
              <div className="text-[11px] text-muted-foreground mt-2">
                Only changes the visible pace between moves. Bot strength is unchanged.
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-border/50">
              <div className="space-y-0.5 pr-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-foreground">
                  Evaluation Bar
                </div>
                <div className="text-[11px] text-muted-foreground leading-snug">
                  Show live Stockfish evaluation during matches. In human player matches, turns off
                  automatically on your turn.
                </div>
              </div>
              <Switch checked={showEval} onCheckedChange={setShowEval} />
            </div>
          </Card>

          {playerProfile && (
            <Card className="evt-card bg-card p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-primary/15 grid place-items-center ring-1 ring-primary/40 overflow-hidden shrink-0">
                {playerProfile.avatar ? (
                  <img
                    src={playerProfile.avatar}
                    alt={playerProfile.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <User className="w-4 h-4 text-primary" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold truncate">Play as yourself</div>
                <div className="text-[11px] text-muted-foreground truncate mt-0.5">
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

        <aside className="space-y-4">
          <Card className="evt-card bg-card p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
              Selected ({participants.length})
            </div>
            {participants.length === 0 ? (
              <div className="text-xs text-muted-foreground py-4 text-center border border-dashed border-border/60 rounded-lg">
                No participants yet
              </div>
            ) : (
              <div className="space-y-1.5 max-h-[280px] overflow-auto scroll-thin">
                {participants.map((p) => {
                  const t = pTitle(p);
                  return (
                    <div
                      key={p.id}
                      className="flex items-center gap-2 bg-secondary/40 rounded-lg p-2"
                    >
                      <ParticipantAvatar participant={p} size={28} />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-semibold truncate inline-flex items-center gap-1">
                          {t.title && <TitleBadge title={t.title} color={t.color} size="sm" />}
                          <span className="truncate">{pName(p)}</span>
                          {p.kind === "player" && (
                            <span className="text-[9px] uppercase tracking-wider text-primary/80">
                              You
                            </span>
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

          <Card className="evt-card bg-card p-4 space-y-2 text-xs">
            <div className="font-semibold text-sm">Format rules</div>
            {type === "swiss" && (
              <div className="text-muted-foreground leading-relaxed">
                Official FIDE Olympiad & Grand Swiss standard. All bots compete in all rounds
                without elimination. Opponents are paired within identical score brackets. Win = 1,
                Draw = 0.5, Loss = 0. Min 3 participants.
              </div>
            )}
            {type === "double-round-robin" && (
              <div className="text-muted-foreground leading-relaxed">
                Official FIDE Candidates standard. Every bot faces every opponent twice: once as
                White and once as Black for absolute opening and color balance. Min 3 participants.
              </div>
            )}
            {type === "world-cup" && (
              <div className="text-muted-foreground leading-relaxed">
                Official FIDE World Cup standard. Each round is a 2-game mini-match. If tied 1–1
                after 2 games, an Armageddon sudden-death tiebreak game is scheduled (Black has draw
                odds!). Min 2 participants.
              </div>
            )}
            {type === "round-robin" && (
              <div className="text-muted-foreground leading-relaxed">
                Classic round-robin. Every bot plays every other bot once. Min 3 bots. Win = 1 pt,
                Draw = 0.5, Loss = 0.
              </div>
            )}
            {type === "knockout" && (
              <div className="text-muted-foreground leading-relaxed">
                Single-elimination bracket. Loser is out; draws decided by higher seed. Min 2 bots.
              </div>
            )}
            {type === "championship" && (
              <div className="text-muted-foreground leading-relaxed">
                Best of 4 games between exactly 2 bots. Colors alternate each game.
              </div>
            )}
          </Card>

          <Button
            onClick={startTournament}
            disabled={!canStart}
            className="evt-play w-full h-12 font-bold bg-success text-primary-foreground hover:bg-success/90"
          >
            <Play className="w-4 h-4 mr-1.5" /> Start Tournament
          </Button>
          {!canStart && (
            <div className="text-[11px] text-center text-muted-foreground">
              {type === "championship"
                ? "Select exactly 2 participants."
                : type === "world-cup" || type === "knockout"
                  ? "Select at least 2 participants."
                  : "Select at least 3 participants."}
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
  countdown,
  setCountdown,
  onExit,
  showEval,
}: {
  name: string;
  type: TournamentType;
  participants: Participant[];
  schedule: Pairing[];
  setSchedule: React.Dispatch<React.SetStateAction<Pairing[]>>;
  currentIdx: number;
  setCurrentIdx: React.Dispatch<React.SetStateAction<number>>;
  speed: SpeedSetting;
  countdown: number | null;
  setCountdown: React.Dispatch<React.SetStateAction<number | null>>;
  onExit: () => void;
  showEval?: boolean;
}) {
  const byId = useMemo(() => new Map(participants.map((p) => [p.id, p])), [participants]);

  const current = schedule[currentIdx];
  const done = !current;

  const standings = useMemo<Standing[]>(() => {
    const map = new Map<string, Standing>();
    for (const p of participants)
      map.set(p.id, { botId: p.id, wins: 0, losses: 0, draws: 0, points: 0 });
    for (const p of schedule) {
      if (!p.result) continue;
      const w = map.get(p.whiteId)!;
      const bl = map.get(p.blackId)!;
      if (p.result === "white") {
        w.wins++;
        w.points += 1;
        bl.losses++;
      } else if (p.result === "black") {
        bl.wins++;
        bl.points += 1;
        w.losses++;
      } else {
        w.draws++;
        bl.draws++;
        w.points += 0.5;
        bl.points += 0.5;
      }
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
        let reason = res.reason;
        if (p.isArmageddon && outcome === "draw") {
          outcome = "black";
          reason = "Armageddon Draw Odds (Black qualifies)";
        } else if (type === "knockout" && outcome === "draw") {
          const w = byId.get(p.whiteId)!;
          const b = byId.get(p.blackId)!;
          outcome = pElo(w) >= pElo(b) ? "white" : "black";
        }
        next[currentIdx] = { ...p, result: outcome, reason };
        return next;
      });
      setCountdown(null);
    },
    [currentIdx, setSchedule, setCountdown, type, byId],
  );

  // Progressive round generation for multi-round formats: Knockout, World Cup, and Swiss
  useEffect(() => {
    if (type !== "knockout" && type !== "world-cup" && type !== "swiss") return;
    const rounds = Array.from(new Set(schedule.map((p) => p.round))).sort((a, b) => a - b);
    const last = rounds[rounds.length - 1];
    const lastRoundPairs = schedule.filter((p) => p.round === last);
    // If any game in the current round is still pending, wait.
    if (lastRoundPairs.some((p) => p.result == null)) return;

    if (type === "knockout") {
      if (lastRoundPairs.length <= 1) return;
      const winners = lastRoundPairs.map((p) =>
        p.result === "white" ? p.whiteId : p.result === "black" ? p.blackId : p.whiteId,
      );
      const nextRound: Pairing[] = [];
      for (let i = 0; i + 1 < winners.length; i += 2) {
        nextRound.push({
          round: last + 1,
          whiteId: winners[i],
          blackId: winners[i + 1],
          result: null,
        });
      }
      if (winners.length % 2 === 1) {
        const bye = winners[winners.length - 1];
        nextRound.push({
          round: last + 1,
          whiteId: bye,
          blackId: bye,
          result: "white",
          reason: "Bye",
        });
      }
      if (nextRound.length > 0) {
        setSchedule((prev) => [...prev, ...nextRound]);
      }
      return;
    }

    if (type === "world-cup") {
      const matches = new Map<string, Pairing[]>();
      for (const p of lastRoundPairs) {
        const mId = p.matchId || `R${last}-M1`;
        if (!matches.has(mId)) matches.set(mId, []);
        matches.get(mId)!.push(p);
      }

      const matchWinners: string[] = [];
      const armageddonPairings: Pairing[] = [];

      for (const [mId, games] of matches.entries()) {
        const arm = games.find((g) => g.isArmageddon);
        if (arm) {
          if (arm.result != null) {
            matchWinners.push(arm.result === "white" ? arm.whiteId : arm.blackId);
          }
          continue;
        }

        const p1 = games[0].whiteId;
        const p2 = games[0].blackId;
        let s1 = 0;
        let s2 = 0;
        for (const g of games) {
          if (g.result === "white") {
            if (g.whiteId === p1) s1 += 1;
            else s2 += 1;
          } else if (g.result === "black") {
            if (g.blackId === p1) s1 += 1;
            else s2 += 1;
          } else {
            s1 += 0.5;
            s2 += 0.5;
          }
        }

        if (s1 > s2) {
          matchWinners.push(p1);
        } else if (s2 > s1) {
          matchWinners.push(p2);
        } else {
          // Tied 1-1: Schedule Armageddon sudden death tiebreak
          armageddonPairings.push({
            round: last,
            whiteId: p1,
            blackId: p2,
            matchId: mId,
            isArmageddon: true,
            result: null,
            reason: "Armageddon Tiebreak",
          });
        }
      }

      if (armageddonPairings.length > 0) {
        setSchedule((prev) => [...prev, ...armageddonPairings]);
        return;
      }

      if (matchWinners.length <= 1) return; // Tournament complete

      // Advance winners to next round of 2-game matches
      const nextRound: Pairing[] = [];
      let mIdx = 1;
      for (let i = 0; i + 1 < matchWinners.length; i += 2) {
        const w1 = matchWinners[i];
        const w2 = matchWinners[i + 1];
        const mId = `R${last + 1}-M${mIdx++}`;
        nextRound.push({
          round: last + 1,
          whiteId: w1,
          blackId: w2,
          matchId: mId,
          gameNumber: 1,
          totalGames: 2,
          result: null,
        });
        nextRound.push({
          round: last + 1,
          whiteId: w2,
          blackId: w1,
          matchId: mId,
          gameNumber: 2,
          totalGames: 2,
          result: null,
        });
      }
      if (matchWinners.length % 2 === 1) {
        const bye = matchWinners[matchWinners.length - 1];
        nextRound.push({
          round: last + 1,
          whiteId: bye,
          blackId: bye,
          matchId: `R${last + 1}-M${mIdx}`,
          gameNumber: 1,
          totalGames: 1,
          result: "white",
          reason: "Bye",
        });
      }
      if (nextRound.length > 0) {
        setSchedule((prev) => [...prev, ...nextRound]);
      }
      return;
    }

    if (type === "swiss") {
      const totalSwissRounds = Math.min(
        5,
        Math.max(3, Math.ceil(Math.log2(participants.length)) + 1),
      );
      if (last >= totalSwissRounds) return; // All Swiss rounds complete

      const playedPairs = new Set<string>();
      const whiteCounts = new Map<string, number>();
      for (const p of schedule) {
        if (p.result != null) {
          playedPairs.add(`${p.whiteId}__${p.blackId}`);
          playedPairs.add(`${p.blackId}__${p.whiteId}`);
        }
        whiteCounts.set(p.whiteId, (whiteCounts.get(p.whiteId) ?? 0) + 1);
      }

      // Sort participants by points descending, then by Elo descending
      const sorted = [...participants].sort((a, b) => {
        const ptsA = standings.find((s) => s.botId === a.id)?.points ?? 0;
        const ptsB = standings.find((s) => s.botId === b.id)?.points ?? 0;
        return ptsB - ptsA || pElo(b) - pElo(a);
      });

      const unpaired = [...sorted];
      const nextRound: Pairing[] = [];

      while (unpaired.length > 1) {
        const p1 = unpaired.shift()!;
        let candIdx = unpaired.findIndex((c) => !playedPairs.has(`${p1.id}__${c.id}`));
        if (candIdx === -1) candIdx = 0;
        const p2 = unpaired.splice(candIdx, 1)[0];
        const w1 = whiteCounts.get(p1.id) ?? 0;
        const w2 = whiteCounts.get(p2.id) ?? 0;
        const p1White = w1 <= w2;
        nextRound.push({
          round: last + 1,
          whiteId: p1White ? p1.id : p2.id,
          blackId: p1White ? p2.id : p1.id,
          result: null,
        });
      }

      if (unpaired.length === 1) {
        const bye = unpaired[0];
        nextRound.push({
          round: last + 1,
          whiteId: bye.id,
          blackId: bye.id,
          result: "white",
          reason: "Bye",
        });
      }

      if (nextRound.length > 0) {
        setSchedule((prev) => [...prev, ...nextRound]);
      }
    }
  }, [schedule, type, setSchedule, participants, standings]);

  useEffect(() => {
    if (countdown == null) return;
    if (countdown <= 0) {
      setCountdown(null);
      setCurrentIdx((i) => i + 1);
      return;
    }
    const t = setTimeout(() => setCountdown((c) => (c == null ? null : c - 1)), 1000);
    return () => clearTimeout(t);
  }, [countdown, setCountdown, setCurrentIdx]);

  const champion: Participant | undefined = useMemo(() => {
    if (!done) return undefined;
    if (type === "knockout" || type === "world-cup") {
      const rounds = Array.from(new Set(schedule.map((p) => p.round))).sort((a, b) => a - b);
      const last = rounds[rounds.length - 1];
      const lastRoundPairs = schedule.filter((p) => p.round === last);
      if (type === "knockout") {
        if (lastRoundPairs.length === 1 && lastRoundPairs[0].result) {
          const winnerId =
            lastRoundPairs[0].result === "white"
              ? lastRoundPairs[0].whiteId
              : lastRoundPairs[0].blackId;
          return byId.get(winnerId);
        }
      } else {
        // world-cup
        const finalMatches = Array.from(new Set(lastRoundPairs.map((p) => p.matchId || "final")));
        if (finalMatches.length === 1) {
          const games = lastRoundPairs.filter((p) => (p.matchId || "final") === finalMatches[0]);
          const arm = games.find((g) => g.isArmageddon && g.result != null);
          if (arm) {
            return byId.get(arm.result === "white" ? arm.whiteId : arm.blackId);
          }
          if (games.length >= 2 && games[0].result != null && games[1].result != null) {
            const p1 = games[0].whiteId;
            const p2 = games[0].blackId;
            let s1 = 0;
            let s2 = 0;
            for (const g of games) {
              if (g.result === "white") {
                if (g.whiteId === p1) s1 += 1;
                else s2 += 1;
              } else if (g.result === "black") {
                if (g.blackId === p1) s1 += 1;
                else s2 += 1;
              } else {
                s1 += 0.5;
                s2 += 0.5;
              }
            }
            return byId.get(s1 > s2 ? p1 : p2);
          }
        }
      }
      return undefined;
    }
    return byId.get(standings[0]?.botId ?? "");
  }, [done, type, schedule, standings, byId]);

  return (
    <div className="max-w-[1550px] mx-auto space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <header className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-lg bg-primary/15 grid place-items-center ring-1 ring-primary/30 shrink-0">
            <Trophy className="w-5 h-5 text-primary" />
          </div>
          <div className="min-w-0">
            <div className="text-xl font-bold leading-tight tracking-tight truncate">{name}</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {labelForType(type)} · {participants.length} players · Speed: {speed}
            </div>
          </div>
        </header>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onExit}>
            <ArrowLeft className="w-4 h-4 mr-1.5" /> Exit
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-6">
        <div className="min-w-0">
          {done ? (
            <Card className="evt-card bg-card p-10 text-center space-y-5">
              <Crown className="w-14 h-14 text-primary mx-auto" />
              <div className="text-2xl font-black tracking-tight">Tournament Complete</div>
              {champion && (
                <div className="flex flex-col items-center gap-3">
                  <ParticipantAvatar participant={champion} size={80} />
                  <div className="text-lg font-bold inline-flex items-center gap-2">
                    {pTitle(champion).title && (
                      <TitleBadge
                        title={pTitle(champion).title}
                        color={pTitle(champion).color}
                        size="md"
                      />
                    )}
                    {pName(champion)}
                    {champion.kind === "player" && (
                      <span className="text-xs uppercase tracking-wider text-primary/80">You</span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Champion · ELO {pElo(champion)}
                  </div>
                </div>
              )}
              <Button onClick={onExit} className="mt-2">
                Back to setup
              </Button>
            </Card>
          ) : current ? (
            (() => {
              const whiteP = byId.get(current.whiteId);
              const blackP = byId.get(current.blackId);
              if (!whiteP || !blackP) return null;
              const header = (
                <Card className="evt-card bg-card p-3 flex items-center justify-between text-xs">
                  <span className="font-semibold tracking-wide flex items-center gap-2">
                    <span>{labelForType(type)}</span>
                    <span>·</span>
                    <span>Round {current.round}</span>
                    {current.isArmageddon ? (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-400 uppercase tracking-wider">
                        ⚡ Armageddon Tiebreak (Draw Odds for Black)
                      </span>
                    ) : current.gameNumber ? (
                      <span>
                        · Game {current.gameNumber} of {current.totalGames ?? 2}
                      </span>
                    ) : (
                      <span>
                        · Game {currentIdx + 1} of {schedule.length}
                      </span>
                    )}
                  </span>
                  <span className="text-muted-foreground">Speed: {speed}</span>
                </Card>
              );

              const finished = current.result != null;
              const hasNext = currentIdx + 1 < schedule.length;
              const winnerP =
                current.result === "white"
                  ? whiteP
                  : current.result === "black"
                    ? blackP
                    : undefined;
              const score =
                current.result === "white" ? "1–0" : current.result === "black" ? "0–1" : "½–½";

              const banner = finished ? (
                <Card className="evt-card bg-card p-4 flex flex-wrap items-center justify-between gap-3 border-primary/40">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-primary/15 grid place-items-center ring-1 ring-primary/30 shrink-0">
                      <Crown className="w-4 h-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-bold truncate">
                        {winnerP ? `${pName(winnerP)} wins` : "Draw"}{" "}
                        <span className="font-mono text-muted-foreground">{score}</span>
                      </div>
                      <div className="text-[11px] text-muted-foreground truncate">
                        {current.reason ?? "Game over"} · Review the final position and standings.
                      </div>
                    </div>
                  </div>
                  {hasNext ? (
                    <Button onClick={() => setCurrentIdx((i) => i + 1)}>
                      <Play className="w-4 h-4 mr-1.5" /> Next Match
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground">Final game complete</span>
                  )}
                </Card>
              ) : null;

              // Player is involved → Human vs Bot match.
              if (whiteP.kind === "player" || blackP.kind === "player") {
                const playerIsWhite = whiteP.kind === "player";
                const player = (playerIsWhite ? whiteP : blackP) as Extract<
                  Participant,
                  { kind: "player" }
                >;
                const botP = (playerIsWhite ? blackP : whiteP) as Extract<
                  Participant,
                  { kind: "bot" }
                >;
                const playerColor: Color = playerIsWhite ? "w" : "b";
                return (
                  <div className="space-y-3">
                    {banner}
                    <HumanVsBotMatch
                      key={currentIdx}
                      bot={botP.bot}
                      player={player.profile}
                      playerColor={playerColor}
                      onFinished={onMatchFinished}
                      headerExtra={header}
                      showEval={showEval}
                    />
                  </div>
                );
              }
              // Bot vs Bot.
              return (
                <div className="space-y-3">
                  {banner}
                  <BotVsBotMatch
                    key={currentIdx}
                    white={(whiteP as Extract<Participant, { kind: "bot" }>).bot}
                    black={(blackP as Extract<Participant, { kind: "bot" }>).bot}
                    speed={speed}
                    hideExit
                    onFinished={onMatchFinished}
                    headerExtra={header}
                    showEval={showEval}
                  />
                </div>
              );
            })()
          ) : null}
        </div>

        <aside className="self-stretch min-w-[280px]">
          <TabbedTournamentCard
            standings={standings}
            schedule={schedule}
            participants={byId}
            currentIdx={currentIdx}
          />
        </aside>
      </div>
    </div>
  );
}

function TabbedTournamentCard({
  standings,
  schedule,
  participants,
  currentIdx,
}: {
  standings: Standing[];
  schedule: Pairing[];
  participants: Map<string, Participant>;
  currentIdx: number;
}) {
  const [activeTab, setActiveTab] = useState<"standings" | "schedule">("standings");

  return (
    <Card className="evt-card bg-card p-3.5 flex flex-col h-full min-h-[360px]">
      <div className="flex items-center justify-between mb-3 shrink-0">
        <div className="flex items-center p-0.5 rounded-lg bg-secondary/60 border border-border/50 w-full">
          <button
            type="button"
            onClick={() => setActiveTab("standings")}
            className={cn(
              "flex-1 py-1 px-2.5 rounded-md text-xs font-semibold transition-all text-center",
              activeTab === "standings"
                ? "bg-card text-foreground shadow-sm ring-1 ring-border/50"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Standings
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("schedule")}
            className={cn(
              "flex-1 py-1 px-2.5 rounded-md text-xs font-semibold transition-all text-center",
              activeTab === "schedule"
                ? "bg-card text-foreground shadow-sm ring-1 ring-border/50"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Schedule
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto scroll-thin">
        {activeTab === "standings" ? (
          <table className="w-full text-xs">
            <thead className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border/40 sticky top-0 bg-card z-10">
              <tr>
                <th className="text-left px-1.5 py-1.5 w-5">#</th>
                <th className="text-left px-1.5 py-1.5">Player</th>
                <th className="text-center px-1 py-1.5">W</th>
                <th className="text-center px-1 py-1.5">L</th>
                <th className="text-center px-1 py-1.5">D</th>
                <th className="text-right px-1.5 py-1.5">Pts</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((s, i) => {
                const p = participants.get(s.botId);
                if (!p) return null;
                const t = pTitle(p);
                return (
                  <tr
                    key={s.botId}
                    className={cn(
                      "hover:bg-secondary/30 transition-colors",
                      i % 2 === 1 && "bg-secondary/20",
                      p.kind === "player" && "bg-primary/10",
                    )}
                  >
                    <td className="px-1.5 py-1.5 font-semibold font-mono text-[11px]">{i + 1}</td>
                    <td className="px-1.5 py-1.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <ParticipantAvatar participant={p} size={18} />
                        <span className="truncate inline-flex items-center gap-1 text-[11px]">
                          {t.title && <TitleBadge title={t.title} color={t.color} size="sm" />}
                          <span className="truncate">{pName(p)}</span>
                          {p.kind === "player" && (
                            <span className="text-[9px] text-primary/80 uppercase font-semibold">
                              You
                            </span>
                          )}
                        </span>
                      </div>
                    </td>
                    <td className="text-center px-1 py-1.5 font-mono text-[11px]">{s.wins}</td>
                    <td className="text-center px-1 py-1.5 font-mono text-[11px]">{s.losses}</td>
                    <td className="text-center px-1 py-1.5 font-mono text-[11px]">{s.draws}</td>
                    <td className="text-right px-1.5 py-1.5 font-mono font-semibold text-[11px]">
                      {s.points.toFixed(1)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="space-y-1.5 pr-0.5">
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
                    "flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs transition-colors",
                    isCurrent && !done
                      ? "bg-primary/15 ring-1 ring-primary/40 font-semibold"
                      : "bg-secondary/30",
                  )}
                >
                  <span className="text-[10px] text-muted-foreground w-11 shrink-0 font-mono">
                    {p.isArmageddon
                      ? "ARM"
                      : p.gameNumber
                        ? `R${p.round}·G${p.gameNumber}`
                        : `R${p.round}·${i + 1}`}
                  </span>
                  <span
                    className={cn(
                      "flex-1 truncate text-[11px]",
                      p.result === "white" && "font-semibold text-primary",
                    )}
                  >
                    {pName(w)}
                  </span>
                  <span className="text-muted-foreground text-[10px] shrink-0">vs</span>
                  <span
                    className={cn(
                      "flex-1 truncate text-right text-[11px]",
                      p.result === "black" && "font-semibold text-primary",
                    )}
                  >
                    {pName(b)}
                  </span>
                  <span className="w-12 text-right shrink-0">
                    {done ? (
                      p.isArmageddon ? (
                        <span className="text-warning text-[10px] font-bold">
                          {p.result === "white" ? "1–0" : "0–1(odds)"}
                        </span>
                      ) : p.result === "draw" ? (
                        <span className="text-muted-foreground text-[10px]">½–½</span>
                      ) : (
                        <Check className="w-3.5 h-3.5 text-success inline" />
                      )
                    ) : isCurrent ? (
                      <span className="text-primary text-[10px] uppercase font-bold">Live</span>
                    ) : (
                      <span className="text-muted-foreground text-[10px]">—</span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Card>
  );
}

function ParticipantAvatar({
  participant,
  size = 32,
}: {
  participant: Participant;
  size?: number;
}) {
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
  const { user, isOwner } = useAuth();
  const ui = useUiSettings();
  const tiers = visibleTiers(ui);

  const atMax = max != null && selectedIds.length >= max;
  return (
    <Card className="evt-card bg-card p-4">
      <div className="flex items-center justify-between px-1 mb-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Bot Library
        </div>
        {max && <div className="text-[10px] text-muted-foreground">Max {max}</div>}
      </div>
      <Accordion type="multiple" className="w-full">
        {tiers.map((section) => {
          // Hide Personal category from unauthorized visitors
          if (section.value === "Personal") {
            const hasAccess =
              user &&
              (isOwner || bots.some((b) => b.category === "Personal" && b.createdBy === user.id));
            if (!hasAccess) return null;
          }

          const list = bots
            .filter((b) => {
              if (b.category !== section.value) return false;
              if (section.value === "Personal") {
                return isOwner || b.createdBy === user?.id;
              }
              return true;
            })
            .sort((a, b) => a.orderIndex - b.orderIndex);

          // If Personal tier has no bots for this user, hide it
          if (section.value === "Personal" && list.length === 0 && !isOwner) {
            return null;
          }

          return (
            <AccordionItem key={section.value} value={section.value} className="border-border/60">
              <AccordionTrigger className="text-xs font-semibold py-2.5 hover:no-underline">
                <span className="flex items-center gap-2">
                  {section.label}
                  <span className="text-[10px] font-normal text-muted-foreground">
                    ({list.length})
                  </span>
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
                            "flex items-center gap-2 rounded-xl p-2.5 transition-colors border text-left min-w-0",
                            isMe
                              ? "bg-primary/15 border-primary/40"
                              : "bg-secondary/30 hover:bg-secondary/60 border-transparent",
                            disabled && "opacity-40 cursor-not-allowed",
                          )}
                        >
                          <div className="w-9 h-9 rounded-lg bg-secondary grid place-items-center overflow-hidden shrink-0 ring-1 ring-border">
                            {b.avatar ? (
                              <img
                                src={b.avatar}
                                alt={b.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <User className="w-4 h-4 text-muted-foreground" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-semibold truncate flex items-center gap-1">
                              {b.title && !isImmersiveEnabled() && (
                                <TitleBadge title={b.title} color={b.titleColor} size="sm" />
                              )}
                              <span className="truncate">
                                {botDisplayIdentity(b, isImmersiveEnabled()).name}
                              </span>
                            </div>
                            <div className="text-[10px] text-muted-foreground">ELO {b.elo}</div>
                          </div>
                          <div
                            className={cn(
                              "w-4 h-4 rounded border flex items-center justify-center shrink-0",
                              isMe
                                ? "bg-primary border-primary text-primary-foreground"
                                : "border-muted-foreground/30",
                            )}
                          >
                            {isMe && <Check className="w-3 h-3" />}
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

function labelForType(t: TournamentType): string {
  switch (t) {
    case "swiss":
      return "Swiss System (FIDE Olympiad)";
    case "double-round-robin":
      return "Double Round-Robin (Candidates)";
    case "world-cup":
      return "FIDE World Cup";
    case "round-robin":
      return "Single Round-Robin";
    case "knockout":
      return "Single Knockout";
    case "championship":
      return "Championship Series";
  }
}

/* ───────── Schedule builders ───────── */

function buildInitialSchedule(type: TournamentType, ids: string[]): Pairing[] {
  if (type === "double-round-robin") {
    const out: Pairing[] = [];
    const n = ids.length;
    // Leg 1: Round 1
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const whiteFirst = (i + j) % 2 === 0;
        out.push({
          round: 1,
          whiteId: whiteFirst ? ids[i] : ids[j],
          blackId: whiteFirst ? ids[j] : ids[i],
          result: null,
          gameNumber: 1,
          totalGames: 2,
        });
      }
    }
    // Leg 2: Round 2 with colors reversed
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const whiteFirst = (i + j) % 2 === 0;
        out.push({
          round: 2,
          whiteId: whiteFirst ? ids[j] : ids[i],
          blackId: whiteFirst ? ids[i] : ids[j],
          result: null,
          gameNumber: 2,
          totalGames: 2,
        });
      }
    }
    return out;
  }

  if (type === "world-cup") {
    const shuffled = [...ids].sort(() => Math.random() - 0.5);
    const out: Pairing[] = [];
    let matchNum = 1;
    for (let i = 0; i + 1 < shuffled.length; i += 2) {
      const p1 = shuffled[i];
      const p2 = shuffled[i + 1];
      const mId = `R1-M${matchNum++}`;
      // Game 1
      out.push({
        round: 1,
        whiteId: p1,
        blackId: p2,
        result: null,
        matchId: mId,
        gameNumber: 1,
        totalGames: 2,
      });
      // Game 2 with colors reversed
      out.push({
        round: 1,
        whiteId: p2,
        blackId: p1,
        result: null,
        matchId: mId,
        gameNumber: 2,
        totalGames: 2,
      });
    }
    if (shuffled.length % 2 === 1) {
      const bye = shuffled[shuffled.length - 1];
      out.push({
        round: 1,
        whiteId: bye,
        blackId: bye,
        result: "white",
        reason: "Bye",
        matchId: `R1-M${matchNum}`,
        gameNumber: 1,
        totalGames: 1,
      });
    }
    return out;
  }

  if (type === "swiss") {
    // Round 1: Top half plays bottom half
    const half = Math.floor(ids.length / 2);
    const topHalf = ids.slice(0, half);
    const botHalf = ids.slice(half, half * 2);
    const out: Pairing[] = [];
    for (let i = 0; i < topHalf.length; i++) {
      const whiteFirst = i % 2 === 0;
      out.push({
        round: 1,
        whiteId: whiteFirst ? topHalf[i] : botHalf[i],
        blackId: whiteFirst ? botHalf[i] : topHalf[i],
        result: null,
      });
    }
    if (ids.length % 2 === 1) {
      const bye = ids[ids.length - 1];
      out.push({
        round: 1,
        whiteId: bye,
        blackId: bye,
        result: "white",
        reason: "Bye",
      });
    }
    return out;
  }

  if (type === "round-robin") {
    const out: Pairing[] = [];
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const whiteFirst = (i + j) % 2 === 0;
        out.push({
          round: 1,
          whiteId: whiteFirst ? ids[i] : ids[j],
          blackId: whiteFirst ? ids[j] : ids[i],
          result: null,
        });
      }
    }
    return out;
  }

  if (type === "championship") {
    const [a, b] = ids;
    return [
      { round: 1, whiteId: a, blackId: b, result: null, gameNumber: 1, totalGames: 4 },
      { round: 2, whiteId: b, blackId: a, result: null, gameNumber: 2, totalGames: 4 },
      { round: 3, whiteId: a, blackId: b, result: null, gameNumber: 3, totalGames: 4 },
      { round: 4, whiteId: b, blackId: a, result: null, gameNumber: 4, totalGames: 4 },
    ];
  }

  // Knockout default
  const shuffled = [...ids].sort(() => Math.random() - 0.5);
  const out: Pairing[] = [];
  for (let i = 0; i + 1 < shuffled.length; i += 2) {
    out.push({ round: 1, whiteId: shuffled[i], blackId: shuffled[i + 1], result: null });
  }
  if (shuffled.length % 2 === 1) {
    const bye = shuffled[shuffled.length - 1];
    out.push({ round: 1, whiteId: bye, blackId: bye, result: "white", reason: "Bye" });
  }
  return out;
}
