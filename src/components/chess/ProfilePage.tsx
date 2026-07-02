import { useAuth } from "@/lib/useAuth";
import { User } from "lucide-react";
import { Card } from "@/components/ui/card";
import { TitleBadge } from "./ChessApp";

export function ProfilePage() {
  const { profile } = useAuth();
  if (!profile) return null;

  const totalGames = profile.wins + profile.losses + profile.draws;
  const winRate = totalGames > 0 ? Math.round((profile.wins / totalGames) * 100) : 0;

  return (
    <div className="max-w-xl mx-auto pt-12 md:pt-20">
      <Card className="bg-card p-8 space-y-6">
        <div className="flex items-center gap-6">
          <div className="w-24 h-24 rounded-lg bg-secondary grid place-items-center overflow-hidden shrink-0 ring-1 ring-border">
            {profile.avatar_url ? (
              <img src={profile.avatar_url} alt={profile.username} className="w-full h-full object-cover" />
            ) : (
              <User className="w-10 h-10 text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0">
            {profile.title_badge && (
              <div className="mb-2">
                <TitleBadge title={profile.title_badge} size="lg" />
              </div>
            )}
            <div className="text-2xl font-bold tracking-tight truncate">{profile.username}</div>
            <div className="text-sm text-muted-foreground/70">({profile.elo_rating} Elo)</div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 pt-4 border-t border-border">
          <div className="text-center">
            <div className="text-xl font-bold">{profile.wins}</div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider">Wins</div>
          </div>
          <div className="text-center">
            <div className="text-xl font-bold">{profile.losses}</div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider">Losses</div>
          </div>
          <div className="text-center">
            <div className="text-xl font-bold">{profile.draws}</div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider">Draws</div>
          </div>
        </div>

        {totalGames > 0 && (
          <div className="text-center pt-2">
            <div className="text-xs text-muted-foreground">
              Win rate: <span className="text-foreground font-semibold">{winRate}%</span> across {totalGames} games
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
