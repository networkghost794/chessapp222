import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type Profile } from "@/lib/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BadgeCheck, Bot, Crown, Pencil, Swords, Trophy, User, Target, Flag } from "lucide-react";
import { cn } from "@/lib/utils";
import { TitleBadge } from "./ChessApp";
import { EventHat } from "./EventDecor";

type BotRow = { bot_id: string; bot_name: string; wins: number; losses: number; draws: number; updated_at: string };

const COUNTRIES: Record<string, string> = { CA: "🇨🇦", US: "🇺🇸", FR: "🇫🇷", GB: "🇬🇧", IN: "🇮🇳", NO: "🇳🇴", BR: "🇧🇷", MX: "🇲🇽", DE: "🇩🇪", ES: "🇪🇸" };

export function HomeDashboard({ profile, onPlay, onEditProfile }: { profile: Profile; onPlay: () => void; onEditProfile: () => void }) {
  const { refreshProfile, isOwner } = useAuth();
  const [rows, setRows] = useState<BotRow[]>([]);
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState(profile.status_text ?? "");

  useEffect(() => {
    supabase.from("bot_stats").select("bot_id,bot_name,wins,losses,draws,updated_at")
      .eq("user_id", profile.id).order("updated_at", { ascending: false })
      .then(({ data }) => setRows((data as BotRow[]) ?? []));
  }, [profile.id]);

  const saveStatus = async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await supabase.from("profiles").update({ status_text: status.trim().slice(0, 120) || null } as any).eq("id", profile.id);
    await refreshProfile();
    setEditing(false);
  };
  const saveCountry = async (c: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await supabase.from("profiles").update({ country: c || null } as any).eq("id", profile.id);
    await refreshProfile();
  };

  const total = profile.wins + profile.losses + profile.draws;
  const winRate = total ? Math.round((profile.wins / total) * 100) : 0;
  const beaten = rows.filter((r) => r.wins > 0).length;
  const joined = profile.created_at ? new Date(profile.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : null;
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
              {profile.avatar_url
                ? <img src={profile.avatar_url} alt={profile.username} className="w-full h-full object-cover" />
                : <User className="w-12 h-12 text-muted-foreground" />}
            </div>
            <EventHat />
          </div>
          <div className="flex-1 min-w-0 flex flex-col">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2 flex-wrap min-w-0">
                <TitleBadge title={profile.title_badge} size="lg" />
                <h1 className="text-2xl font-extrabold tracking-tight truncate">{profile.username}</h1>
                {profile.country && <span className="text-xl leading-none">{COUNTRIES[profile.country] ?? profile.country}</span>}
                {profile.verified_federation && (
                  <span title={`Verified ${profile.verified_federation} rating`} className="text-success"><BadgeCheck className="w-5 h-5" /></span>
                )}
              </div>
              <Button size="sm" variant="secondary" onClick={onEditProfile}>Edit Profile</Button>
            </div>
            <div className="mt-2 text-sm text-muted-foreground">
              {editing ? (
                <div className="flex gap-2 max-w-md">
                  <Input autoFocus value={status} maxLength={120} onChange={(e) => setStatus(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && saveStatus()} className="h-8" />
                  <Button size="sm" onClick={saveStatus}>Save</Button>
                </div>
              ) : (
                <button onClick={() => setEditing(true)} className="inline-flex items-center gap-1.5 hover:text-foreground">
                  {profile.status_text || "Enter a status here"} <Pencil className="w-3 h-3" />
                </button>
              )}
            </div>
            <div className="mt-auto pt-4 flex flex-wrap gap-x-5 gap-y-1 text-sm">
              {joined && <span><b className="text-foreground">{joined}</b> <span className="text-muted-foreground">Joined</span></span>}
              <span><b className="text-foreground">{total}</b> <span className="text-muted-foreground">Games</span></span>
              <span><b className="text-foreground">{rows.length}</b> <span className="text-muted-foreground">Bots faced</span></span>
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
                <div key={s.label} className="evt-card evt-gift relative rounded-lg bg-card border border-border/60 p-4 flex items-center gap-3">
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
            <Button onClick={onPlay} className="evt-play bg-success text-primary-foreground hover:bg-success/90 font-bold h-11 px-6">
              <Swords className="w-4 h-4 mr-2" /> Play Bots
            </Button>
          </section>

          {/* Bot history */}
          <section className="rounded-lg bg-card border border-border/60 overflow-hidden">
            <div className="px-5 py-4 font-bold border-b border-border/60">
              Bot History <span className="text-muted-foreground font-semibold">({rows.length})</span>
            </div>
            {rows.length === 0 ? (
              <div className="px-5 py-8 text-sm text-muted-foreground text-center">No games yet — your record against each bot will show here.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-secondary/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="text-left font-semibold px-5 py-2">Bot</th>
                    <th className="font-semibold px-2 py-2">W</th>
                    <th className="font-semibold px-2 py-2">L</th>
                    <th className="font-semibold px-2 py-2">D</th>
                    <th className="text-right font-semibold px-5 py-2 hidden sm:table-cell">Last played</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 12).map((r) => (
                    <tr key={r.bot_id} className="border-t border-border/40">
                      <td className="px-5 py-2.5 font-medium truncate max-w-[200px]">{r.bot_name}</td>
                      <td className="text-center text-success font-semibold">{r.wins}</td>
                      <td className="text-center text-destructive font-semibold">{r.losses}</td>
                      <td className="text-center text-muted-foreground">{r.draws}</td>
                      <td className="text-right px-5 text-muted-foreground hidden sm:table-cell">
                        {new Date(r.updated_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>

        {/* Sidebar */}
        <aside className="space-y-5">
          <section className="rounded-lg bg-card border border-border/60 divide-y divide-border/60">
            {isCreator && (
              <div className="p-4 flex items-center gap-3">
                <Crown className="w-7 h-7 text-[color:var(--sim-ok)]" />
                <div><div className="font-bold">Creator</div><div className="text-xs text-muted-foreground">Founder of this arena</div></div>
              </div>
            )}
            <div className="p-4 flex items-center gap-3">
              <BadgeCheck className={cn("w-7 h-7", profile.verified_federation ? "text-success" : "text-muted-foreground")} />
              <div>
                <div className="font-bold">{profile.verified_federation ? `Verified ${profile.verified_federation}` : "Not verified"}</div>
                <div className="text-xs text-muted-foreground">
                  {profile.verified_federation ? "Official rating linked" : "Request it in Settings"}
                </div>
              </div>
            </div>
            <div className="p-4 flex items-center gap-3">
              <Trophy className="w-7 h-7 text-primary" />
              <div><div className="font-bold">{profile.wins}W · {profile.losses}L · {profile.draws}D</div><div className="text-xs text-muted-foreground">Lifetime record</div></div>
            </div>
          </section>
          <section className="rounded-lg bg-card border border-border/60 p-4">
            <div className="flex items-center gap-2 font-bold text-sm mb-2"><Flag className="w-4 h-4" /> Country</div>
            <select value={profile.country ?? ""} onChange={(e) => saveCountry(e.target.value)}
              className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm">
              <option value="">None</option>
              {Object.entries(COUNTRIES).map(([k, f]) => <option key={k} value={k}>{f} {k}</option>)}
            </select>
          </section>
        </aside>
      </div>
    </div>
  );
}
