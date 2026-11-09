import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type Profile } from "@/lib/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  BadgeCheck,
  Bot,
  Crown,
  Pencil,
  Swords,
  Trophy,
  User,
  Target,
  Flag,
  Clock,
  Heart,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TitleBadge } from "./ChessApp";
import { EventHat } from "./EventDecor";
import {
  getInitialOrSeedHistory,
  toggleGameBookmark,
  clearGameHistory,
  type GameHistoryEntry,
} from "@/lib/gameHistory";

type BotRow = {
  bot_id: string;
  bot_name: string;
  wins: number;
  losses: number;
  draws: number;
  updated_at: string;
};

const COUNTRIES: Record<string, string> = {
  CA: "🇨🇦",
  US: "🇺🇸",
  FR: "🇫🇷",
  GB: "🇬🇧",
  IN: "🇮🇳",
  NO: "🇳🇴",
  BR: "🇧🇷",
  MX: "🇲🇽",
  DE: "🇩🇪",
  ES: "🇪🇸",
};

export function HomeDashboard({
  profile,
  onPlay,
  onEditProfile,
}: {
  profile: Profile;
  onPlay: () => void;
  onEditProfile: () => void;
}) {
  const { refreshProfile, isOwner } = useAuth();
  const [rows, setRows] = useState<BotRow[]>([]);
  const [games, setGames] = useState<GameHistoryEntry[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState(profile.status_text ?? "");

  useEffect(() => {
    supabase
      .from("bot_stats")
      .select("bot_id,bot_name,wins,losses,draws,updated_at")
      .eq("user_id", profile.id)
      .order("updated_at", { ascending: false })
      .then(({ data }) => setRows((data as BotRow[]) ?? []));

    setGames(getInitialOrSeedHistory(profile));
  }, [profile]);

  const handleToggleBookmark = (gameId: string) => {
    const updated = toggleGameBookmark(profile.id, gameId);
    setGames(updated);
  };

  const handleClearHistory = () => {
    clearGameHistory(profile.id);
    setGames([]);
  };

  const saveStatus = async () => {
    await supabase
      .from("profiles")
      .update({ status_text: status.trim().slice(0, 120) || null })
      .eq("id", profile.id);
    await refreshProfile();
    setEditing(false);
  };
  const saveCountry = async (c: string) => {
    await supabase
      .from("profiles")
      .update({ country: c || null })
      .eq("id", profile.id);
    await refreshProfile();
  };

  const total = profile.wins + profile.losses + profile.draws;
  const winRate = total ? Math.round((profile.wins / total) * 100) : 0;
  // r.losses represents the times the bot lost to the user (i.e. user's wins)
  const beaten = rows.filter((r) => r.losses > 0).length;
  const joined = profile.created_at
    ? new Date(profile.created_at).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;
  const isCreator = (profile.title_badge ?? "").includes("CRTR") || isOwner;

  const stats = [
    { label: "Bot Rating", value: profile.elo_rating, icon: Target, tone: "text-success" },
    { label: "Wins", value: profile.wins, icon: Trophy, tone: "text-[color:var(--sim-ok)]" },
    { label: "Win Rate", value: `${winRate}%`, icon: Swords, tone: "text-primary" },
    { label: "Bots Beaten", value: beaten, icon: Bot, tone: "text-[color:var(--sim-bad)]" },
  ];

  return (
    <div className="max-w-[1100px] mx-auto space-y-5">
      {/* Banner */}
      <section className="rounded-lg bg-card border border-border/60">
        <div className="p-5 md:p-6 flex flex-col sm:flex-row gap-5">
          <div className="evt-avatar relative shrink-0">
            <div className="w-28 h-28 md:w-36 md:h-36 rounded-md bg-secondary grid place-items-center overflow-hidden ring-1 ring-border">
              {profile.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt={profile.username}
                  className="w-full h-full object-cover"
                />
              ) : (
                <User className="w-12 h-12 text-muted-foreground" />
              )}
            </div>
            <EventHat />
          </div>
          <div className="flex-1 min-w-0 flex flex-col">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2 flex-wrap min-w-0">
                <TitleBadge title={profile.title_badge} size="lg" />
                <h1 className="text-2xl font-extrabold tracking-tight truncate">
                  {profile.username}
                </h1>
                {profile.country && (
                  <span className="text-xl leading-none">
                    {COUNTRIES[profile.country] ?? profile.country}
                  </span>
                )}
                {profile.verified_federation && (
                  <span
                    title={`Verified ${profile.verified_federation} rating`}
                    className="text-success"
                  >
                    <BadgeCheck className="w-5 h-5" />
                  </span>
                )}
              </div>
              <Button size="sm" variant="secondary" onClick={onEditProfile}>
                Edit Profile
              </Button>
            </div>
            <div className="mt-2 text-sm text-muted-foreground">
              {editing ? (
                <div className="flex gap-2 max-w-md">
                  <Input
                    autoFocus
                    value={status}
                    maxLength={120}
                    onChange={(e) => setStatus(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && saveStatus()}
                    className="h-8"
                  />
                  <Button size="sm" onClick={saveStatus}>
                    Save
                  </Button>
                </div>
              ) : (
                <button
                  onClick={() => setEditing(true)}
                  className="inline-flex items-center gap-1.5 hover:text-foreground"
                >
                  {profile.status_text || "Enter a status here"} <Pencil className="w-3 h-3" />
                </button>
              )}
            </div>
            <div className="mt-auto pt-4 flex flex-wrap gap-x-5 gap-y-1 text-sm">
              {joined && (
                <span>
                  <b className="text-foreground">{joined}</b>{" "}
                  <span className="text-muted-foreground">Joined</span>
                </span>
              )}
              <span>
                <b className="text-foreground">{total}</b>{" "}
                <span className="text-muted-foreground">Games</span>
              </span>
              <span>
                <b className="text-foreground">{rows.length}</b>{" "}
                <span className="text-muted-foreground">Bots faced</span>
              </span>
              <span className="font-semibold text-success">Online now</span>
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] gap-5">
        <div className="space-y-5 min-w-0">
          {/* Stat tiles */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {stats.map((s) => {
              const Icon = s.icon;
              return (
                <div
                  key={s.label}
                  className="evt-card evt-gift relative rounded-lg bg-card border border-border/60 p-4 flex items-center gap-3"
                >
                  <Icon className={cn("w-8 h-8 shrink-0", s.tone)} />
                  <div className="min-w-0">
                    <div className="text-[11px] text-muted-foreground">{s.label}</div>
                    <div className="text-2xl font-extrabold leading-tight">{s.value}</div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Play CTA */}
          <section className="evt-card evt-hearth rounded-lg bg-card border border-border/60 p-5 flex items-center justify-between gap-4">
            <div>
              <div className="font-bold">Ready for a game?</div>
              <div className="text-sm text-muted-foreground">Pick a bot and test your skills.</div>
            </div>
            <Button
              onClick={onPlay}
              className="evt-play bg-success text-primary-foreground hover:bg-success/90 font-bold h-11 px-6"
            >
              <Swords className="w-4 h-4 mr-2" /> Play Bots
            </Button>
          </section>

          {/* Game History matching reference screenshot */}
          <section className="rounded-lg bg-card border border-border/60 overflow-hidden shadow-xs">
            <div className="px-5 py-3.5 font-bold border-b border-border/60 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-base font-extrabold tracking-tight">Game History</span>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="text-xs text-muted-foreground font-medium">
                  {games.length} {games.length === 1 ? "game" : "games"} recorded
                </span>
                {games.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearHistory}
                    className="text-[11px] text-muted-foreground hover:text-destructive transition-colors font-medium underline"
                  >
                    Clear History
                  </button>
                )}
              </div>
            </div>

            {games.length === 0 ? (
              <div className="px-5 py-8 text-sm text-muted-foreground text-center">
                No games yet — completed matches against bots will appear here.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-secondary/40 text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
                    <tr>
                      <th className="text-left py-2 pl-4 md:pl-5">Players</th>
                      <th className="text-center py-2 px-3">Result</th>
                      <th className="text-center py-2 px-3">Moves</th>
                      <th className="text-right py-2 px-3">Date</th>
                      <th className="py-2 pr-4 md:pr-5 w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {(showAll ? games : games.slice(0, 10)).map((g) => (
                      <tr key={g.id} className="hover:bg-secondary/25 transition-colors group">
                        {/* Players Column */}
                        <td className="py-2.5 pl-4 md:pl-5 min-w-[240px]">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-md bg-secondary flex flex-col items-center justify-center shrink-0 ring-1 ring-border/50 text-muted-foreground">
                              {g.gameType === "bot" ? (
                                <Bot className="w-4 h-4 text-primary" />
                              ) : (
                                <>
                                  <Clock className="w-3.5 h-3.5 text-emerald-500" />
                                  <span className="text-[9px] font-mono leading-none mt-0.5">
                                    {g.timeControl ?? "15+10"}
                                  </span>
                                </>
                              )}
                            </div>

                            <div className="space-y-1 min-w-0 flex-1">
                              {/* White Player */}
                              <div className="flex items-center gap-1.5 min-w-0">
                                <div className="w-5 h-5 rounded-sm bg-secondary overflow-hidden shrink-0 ring-1 ring-border grid place-items-center">
                                  {g.white.avatar ? (
                                    <img
                                      src={g.white.avatar}
                                      alt=""
                                      className="w-full h-full object-cover"
                                    />
                                  ) : (
                                    <User className="w-3 h-3 text-muted-foreground" />
                                  )}
                                </div>
                                <span
                                  className="w-2.5 h-2.5 rounded-[2px] bg-white border border-zinc-400 shrink-0 shadow-xs"
                                  title="White"
                                />
                                {g.white.title && (
                                  <TitleBadge
                                    title={g.white.title}
                                    color={g.white.titleColor}
                                    size="sm"
                                  />
                                )}
                                <span
                                  className={cn(
                                    "text-xs truncate font-medium",
                                    g.white.isUser
                                      ? "font-bold text-foreground"
                                      : "text-muted-foreground",
                                  )}
                                >
                                  {g.white.name}
                                </span>
                                <span className="text-[11px] text-muted-foreground/80 font-mono shrink-0">
                                  ({g.white.elo})
                                </span>
                                {g.white.country && (
                                  <span className="text-xs shrink-0">
                                    {COUNTRIES[g.white.country] ?? g.white.country}
                                  </span>
                                )}
                                {g.white.isUser && (
                                  <span className="text-xs shrink-0 text-amber-400">👑</span>
                                )}
                              </div>

                              {/* Black Player */}
                              <div className="flex items-center gap-1.5 min-w-0">
                                <div className="w-5 h-5 rounded-sm bg-secondary overflow-hidden shrink-0 ring-1 ring-border grid place-items-center">
                                  {g.black.avatar ? (
                                    <img
                                      src={g.black.avatar}
                                      alt=""
                                      className="w-full h-full object-cover"
                                    />
                                  ) : (
                                    <User className="w-3 h-3 text-muted-foreground" />
                                  )}
                                </div>
                                <span
                                  className="w-2.5 h-2.5 rounded-[2px] bg-zinc-800 border border-zinc-600 shrink-0 shadow-xs"
                                  title="Black"
                                />
                                {g.black.title && (
                                  <TitleBadge
                                    title={g.black.title}
                                    color={g.black.titleColor}
                                    size="sm"
                                  />
                                )}
                                <span
                                  className={cn(
                                    "text-xs truncate font-medium",
                                    g.black.isUser
                                      ? "font-bold text-foreground"
                                      : "text-muted-foreground",
                                  )}
                                >
                                  {g.black.name}
                                </span>
                                <span className="text-[11px] text-muted-foreground/80 font-mono shrink-0">
                                  ({g.black.elo})
                                </span>
                                {g.black.country && (
                                  <span className="text-xs shrink-0">
                                    {COUNTRIES[g.black.country] ?? g.black.country}
                                  </span>
                                )}
                                {!g.black.isUser && (
                                  <span className="text-[10px] text-muted-foreground shrink-0">
                                    ♟️
                                  </span>
                                )}
                                {g.black.isUser && (
                                  <span className="text-xs shrink-0 text-amber-400">👑</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Result Column */}
                        <td className="py-2.5 px-3 text-center font-mono">
                          <div className="flex items-center justify-center gap-1.5">
                            <div className="flex flex-col items-center leading-tight font-bold text-xs">
                              <span
                                className={
                                  g.scoreWhite === "1" ? "text-foreground" : "text-muted-foreground"
                                }
                              >
                                {g.scoreWhite}
                              </span>
                              <span
                                className={
                                  g.scoreBlack === "1" ? "text-foreground" : "text-muted-foreground"
                                }
                              >
                                {g.scoreBlack}
                              </span>
                            </div>
                            {g.userOutcome === "win" ? (
                              <span
                                className="w-4 h-4 rounded-[3px] bg-emerald-600 text-white font-bold text-[10px] grid place-items-center shadow-xs"
                                title="Victory"
                              >
                                +
                              </span>
                            ) : g.userOutcome === "loss" ? (
                              <span
                                className="w-4 h-4 rounded-[3px] bg-rose-600 text-white font-bold text-[10px] grid place-items-center shadow-xs"
                                title="Defeat"
                              >
                                −
                              </span>
                            ) : (
                              <span
                                className="w-4 h-4 rounded-[3px] bg-zinc-600 text-white font-bold text-[10px] grid place-items-center shadow-xs"
                                title="Draw"
                              >
                                =
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Moves Column */}
                        <td className="py-2.5 px-3 text-center font-mono text-xs text-muted-foreground">
                          {g.moves}
                        </td>

                        {/* Date Column */}
                        <td className="py-2.5 px-3 text-right font-medium text-xs text-muted-foreground whitespace-nowrap">
                          {g.date}
                        </td>

                        {/* Bookmark Heart Column */}
                        <td className="py-2.5 pr-4 md:pr-5 text-right">
                          <button
                            type="button"
                            onClick={() => handleToggleBookmark(g.id)}
                            className="p-1 rounded text-muted-foreground hover:text-rose-500 transition-colors"
                            title={g.bookmarked ? "Bookmarked" : "Bookmark game"}
                          >
                            <Heart
                              className={cn(
                                "w-4 h-4 transition-transform",
                                g.bookmarked
                                  ? "fill-rose-500 text-rose-500"
                                  : "hover:scale-110 opacity-60 hover:opacity-100",
                              )}
                            />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {games.length > 5 && (
              <div className="p-2.5 bg-secondary/20 border-t border-border/40 text-center">
                <button
                  type="button"
                  onClick={() => setShowAll((prev) => !prev)}
                  className="text-xs text-muted-foreground hover:text-foreground font-semibold inline-flex items-center gap-1 transition-colors"
                >
                  {showAll ? "Show Recent Games" : "View All Games"}{" "}
                  <ChevronRight
                    className={cn("w-3.5 h-3.5 transition-transform", showAll && "rotate-90")}
                  />
                </button>
              </div>
            )}
          </section>
        </div>

        {/* Sidebar */}
        <aside className="space-y-5">
          <section className="rounded-lg bg-card border border-border/60 divide-y divide-border/60">
            {isCreator && (
              <div className="p-4 flex items-center gap-3">
                <Crown className="w-7 h-7 text-[color:var(--sim-ok)]" />
                <div>
                  <div className="font-bold">Creator</div>
                  <div className="text-xs text-muted-foreground">Founder of this arena</div>
                </div>
              </div>
            )}
            <div className="p-4 flex items-center gap-3">
              <BadgeCheck
                className={cn(
                  "w-7 h-7",
                  profile.verified_federation ? "text-success" : "text-muted-foreground",
                )}
              />
              <div>
                <div className="font-bold">
                  {profile.verified_federation
                    ? `Verified ${profile.verified_federation}`
                    : "Not verified"}
                </div>
                <div className="text-xs text-muted-foreground">
                  {profile.verified_federation
                    ? "Official rating linked"
                    : "Request it in Settings"}
                </div>
              </div>
            </div>
            <div className="p-4 flex items-center gap-3">
              <Trophy className="w-7 h-7 text-primary" />
              <div>
                <div className="font-bold">
                  {profile.wins}W · {profile.losses}L · {profile.draws}D
                </div>
                <div className="text-xs text-muted-foreground">Lifetime record</div>
              </div>
            </div>
          </section>
          <section className="rounded-lg bg-card border border-border/60 p-4">
            <div className="flex items-center gap-2 font-bold text-sm mb-2">
              <Flag className="w-4 h-4" /> Country
            </div>
            <select
              value={profile.country ?? ""}
              onChange={(e) => saveCountry(e.target.value)}
              className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">None</option>
              {Object.entries(COUNTRIES).map(([k, f]) => (
                <option key={k} value={k}>
                  {f} {k}
                </option>
              ))}
            </select>
          </section>
        </aside>
      </div>
    </div>
  );
}
