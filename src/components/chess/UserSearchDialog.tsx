import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, User, Copy, Check, Sparkles, Swords, X, Users } from "lucide-react";
import { TitleBadge } from "./ChessApp";
import { supabase } from "@/integrations/supabase/client";
import type { Profile } from "@/lib/useAuth";
import { toast } from "sonner";

const COUNTRIES: Record<string, { flag: string; name: string }> = {
  CA: { flag: "🇨🇦", name: "Canada" },
  US: { flag: "🇺🇸", name: "United States" },
  FR: { flag: "🇫🇷", name: "France" },
  GB: { flag: "🇬🇧", name: "United Kingdom" },
  IN: { flag: "🇮🇳", name: "India" },
  NO: { flag: "🇳🇴", name: "Norway" },
  BR: { flag: "🇧🇷", name: "Brazil" },
  MX: { flag: "🇲🇽", name: "Mexico" },
  DE: { flag: "🇩🇪", name: "Germany" },
  ES: { flag: "🇪🇸", name: "Spain" },
};

export function UserSearchDialog({
  open,
  onOpenChange,
  onSelectUser,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectUser?: (user: Profile) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null);
  const [copiedId, setCopiedId] = useState(false);

  // Keyboard shortcut (⌘K or /) listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenChange(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onOpenChange]);

  // Query real users from Supabase profiles table
  useEffect(() => {
    if (!open) return;

    setLoading(true);
    const trimmed = query.trim();

    const timer = setTimeout(async () => {
      try {
        let req = supabase.from("profiles").select("*");

        if (trimmed) {
          req = req.or(
            `username.ilike.%${trimmed}%,status_text.ilike.%${trimmed}%,title_badge.ilike.%${trimmed}%`,
          );
        } else {
          req = req.order("elo_rating", { ascending: false }).limit(20);
        }

        const { data, error } = await req;

        if (error) {
          console.error("User search error:", error.message);
          setResults([]);
        } else {
          setResults((data as Profile[]) ?? []);
        }
      } catch (err) {
        console.error("User search exception:", err);
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [query, open]);

  const handleCopyLink = (p: Profile) => {
    navigator.clipboard.writeText(
      `${window.location.origin}/?user=${encodeURIComponent(p.username)}`,
    );
    setCopiedId(true);
    toast.success(`Copied profile link for ${p.username}`);
    setTimeout(() => setCopiedId(false), 2000);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[620px] p-0 overflow-hidden bg-card border-border shadow-2xl">
          <DialogHeader className="p-4 pb-2 border-b border-border/60 flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-md bg-primary/15 grid place-items-center text-primary ring-1 ring-primary/30">
                <Users className="w-4 h-4" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold">Search Users</DialogTitle>
                <div className="text-[11px] text-muted-foreground">
                  Find registered players by username or title.
                </div>
              </div>
            </div>
          </DialogHeader>

          {/* Search bar input */}
          <div className="p-4 pb-3 border-b border-border/40 bg-secondary/20">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Type a username or title..."
                className="pl-9 pr-9 h-10 bg-card border-border/70 focus:ring-primary/40 text-sm"
                autoFocus
              />
              {query && (
                <button
                  onClick={() => setQuery("")}
                  className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* User Results List */}
          <div className="max-h-[380px] overflow-y-auto p-3 space-y-2">
            {loading ? (
              <div className="py-8 text-center text-xs text-muted-foreground space-y-2">
                <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
                <div>Loading real users...</div>
              </div>
            ) : results.length === 0 ? (
              <div className="py-10 text-center space-y-2">
                <User className="w-8 h-8 mx-auto text-muted-foreground/50" />
                <div className="text-sm font-semibold">No users found</div>
                <div className="text-xs text-muted-foreground max-w-xs mx-auto">
                  {query
                    ? `No registered user matches "${query}".`
                    : "No registered user accounts found yet."}
                </div>
              </div>
            ) : (
              results.map((p) => {
                const total = p.wins + p.losses + p.draws;
                const winRate = total ? Math.round((p.wins / total) * 100) : 0;
                const countryInfo = p.country ? COUNTRIES[p.country] : null;

                return (
                  <div
                    key={p.id}
                    onClick={() => setSelectedProfile(p)}
                    className="p-3 rounded-lg border border-border/50 bg-card/60 hover:bg-secondary/40 hover:border-primary/40 transition-all cursor-pointer flex items-center justify-between gap-3 group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-secondary grid place-items-center overflow-hidden shrink-0 ring-1 ring-border group-hover:ring-primary/50 transition-all">
                        {p.avatar_url ? (
                          <img
                            src={p.avatar_url}
                            alt={p.username}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <User className="w-5 h-5 text-muted-foreground" />
                        )}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {p.title_badge && <TitleBadge title={p.title_badge} size="sm" />}
                          <span className="text-sm font-bold text-foreground truncate group-hover:text-primary transition-colors">
                            {p.username}
                          </span>
                          {countryInfo && (
                            <span className="text-xs" title={countryInfo.name}>
                              {countryInfo.flag}
                            </span>
                          )}
                          <span className="text-[11px] font-mono font-medium text-muted-foreground">
                            ({p.elo_rating} ELO)
                          </span>
                        </div>

                        {p.status_text && (
                          <p className="text-xs text-muted-foreground truncate max-w-[320px] mt-0.5">
                            "{p.status_text}"
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <div className="text-right hidden sm:block">
                        <div className="text-xs font-semibold text-foreground">
                          {p.wins}W · {p.losses}L
                        </div>
                        <div className="text-[10px] text-muted-foreground">{winRate}% win rate</div>
                      </div>
                      <Button
                        variant="secondary"
                        size="sm"
                        className="h-8 px-2.5 text-xs font-semibold group-hover:bg-primary group-hover:text-primary-foreground transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedProfile(p);
                        }}
                      >
                        View
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Selected Profile Preview Modal */}
      {selectedProfile && (
        <Dialog open={!!selectedProfile} onOpenChange={(o) => !o && setSelectedProfile(null)}>
          <DialogContent className="sm:max-w-[480px] p-6 bg-card border-border shadow-2xl">
            <DialogHeader className="space-y-1">
              <div className="flex items-center justify-between">
                <Badge variant="outline" className="text-[10px] uppercase font-mono tracking-wider">
                  Player Profile
                </Badge>
                {selectedProfile.country && (
                  <span className="text-sm">
                    {COUNTRIES[selectedProfile.country]?.flag}{" "}
                    {COUNTRIES[selectedProfile.country]?.name}
                  </span>
                )}
              </div>
            </DialogHeader>

            <div className="flex flex-col items-center text-center space-y-3 pt-2">
              <div className="w-20 h-20 rounded-full bg-secondary grid place-items-center overflow-hidden ring-2 ring-primary/40 shadow-lg">
                {selectedProfile.avatar_url ? (
                  <img
                    src={selectedProfile.avatar_url}
                    alt={selectedProfile.username}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <User className="w-10 h-10 text-muted-foreground" />
                )}
              </div>

              <div>
                <div className="flex items-center justify-center gap-1.5">
                  {selectedProfile.title_badge && (
                    <TitleBadge title={selectedProfile.title_badge} size="md" />
                  )}
                  <h3 className="text-xl font-bold text-foreground">{selectedProfile.username}</h3>
                </div>
                {selectedProfile.status_text && (
                  <p className="text-xs text-muted-foreground italic mt-1 max-w-sm mx-auto">
                    "{selectedProfile.status_text}"
                  </p>
                )}
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-3 gap-3 w-full pt-3 border-t border-border/60">
                <div className="p-2.5 rounded-lg bg-secondary/30 text-center">
                  <div className="text-[10px] font-semibold text-muted-foreground uppercase">
                    Rating
                  </div>
                  <div className="text-base font-bold text-primary font-mono mt-0.5">
                    {selectedProfile.elo_rating}
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-secondary/30 text-center">
                  <div className="text-[10px] font-semibold text-muted-foreground uppercase">
                    Record
                  </div>
                  <div className="text-xs font-bold text-foreground mt-0.5">
                    {selectedProfile.wins}W / {selectedProfile.losses}L
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-secondary/30 text-center">
                  <div className="text-[10px] font-semibold text-muted-foreground uppercase">
                    Win Rate
                  </div>
                  <div className="text-base font-bold text-success mt-0.5">
                    {selectedProfile.wins + selectedProfile.losses + selectedProfile.draws > 0
                      ? Math.round(
                          (selectedProfile.wins /
                            (selectedProfile.wins +
                              selectedProfile.losses +
                              selectedProfile.draws)) *
                            100,
                        )
                      : 0}
                    %
                  </div>
                </div>
              </div>

              {selectedProfile.verified_federation && (
                <div className="flex items-center gap-1.5 text-xs text-success bg-success/10 px-3 py-1 rounded-full border border-success/30">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Verified Federation ({selectedProfile.verified_federation})</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 pt-4 border-t border-border/60">
              <Button
                variant="outline"
                className="flex-1 text-xs"
                onClick={() => handleCopyLink(selectedProfile)}
              >
                {copiedId ? (
                  <Check className="w-3.5 h-3.5 mr-1.5 text-success" />
                ) : (
                  <Copy className="w-3.5 h-3.5 mr-1.5" />
                )}
                {copiedId ? "Copied Link" : "Share Profile"}
              </Button>

              <Button
                className="flex-1 text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={() => {
                  if (onSelectUser) onSelectUser(selectedProfile);
                  setSelectedProfile(null);
                  onOpenChange(false);
                  toast.success(`Selected profile: ${selectedProfile.username}`);
                }}
              >
                <Swords className="w-3.5 h-3.5 mr-1.5" /> Select Player
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
