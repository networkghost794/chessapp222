import { useCallback, useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Search,
  User,
  Copy,
  Check,
  Sparkles,
  Swords,
  X,
  Users,
  Download,
  FileText,
  ShieldCheck,
  History,
  Bot,
  RefreshCw,
} from "lucide-react";
import { TitleBadge } from "./ChessApp";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type Profile } from "@/lib/useAuth";
import {
  harvestAllHistoricalGames,
  downloadAllUserPgns,
  formatStandardPgn,
  type GameHistoryEntry,
} from "@/lib/gameHistory";
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
  const { isOwner } = useAuth();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null);
  const [copiedId, setCopiedId] = useState(false);

  const [activeTab, setActiveTab] = useState<"overview" | "games">("overview");
  const [userGames, setUserGames] = useState<GameHistoryEntry[]>([]);
  const [loadingGames, setLoadingGames] = useState(false);
  const [copiedPgnId, setCopiedPgnId] = useState<string | null>(null);

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
          req = req.order("elo_rating", { ascending: false }).limit(25);
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

  // Deep harvest all current and pre-reset historical games
  const loadUserGames = useCallback(async (prof: Profile, showToast = false) => {
    setLoadingGames(true);
    try {
      const allGames = await harvestAllHistoricalGames(prof.id, prof.username);
      setUserGames(allGames);
      if (showToast) {
        toast.success(
          `Deep scan complete: found ${allGames.length} game${allGames.length === 1 ? "" : "s"} for ${prof.username}`,
        );
      }
    } catch (err) {
      console.error("Error harvesting user games:", err);
      if (showToast) toast.error("Deep scan failed while reading historical games");
    } finally {
      setLoadingGames(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedProfile || !isOwner) {
      setUserGames([]);
      return;
    }
    void loadUserGames(selectedProfile);
  }, [selectedProfile, isOwner, loadUserGames]);

  const handleCopyLink = (p: Profile) => {
    navigator.clipboard.writeText(
      `${window.location.origin}/?user=${encodeURIComponent(p.username)}`,
    );
    setCopiedId(true);
    toast.success(`Copied profile link for ${p.username}`);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const handleDownloadAllPgns = () => {
    if (!selectedProfile) return;
    if (userGames.length === 0) {
      toast.error(`No games found for ${selectedProfile.username}`);
      return;
    }

    downloadAllUserPgns(selectedProfile.username, userGames);
    toast.success(
      `Downloaded all ${userGames.length} games (including pre-reset games) for ${selectedProfile.username}!`,
    );
  };

  const handleCopyIndividualPgn = (game: GameHistoryEntry) => {
    const formatted = formatStandardPgn(game);
    navigator.clipboard.writeText(formatted);
    setCopiedPgnId(game.id);
    toast.success("Game PGN copied to clipboard!");
    setTimeout(() => setCopiedPgnId(null), 2000);
  };

  const handleDownloadIndividualPgn = (game: GameHistoryEntry) => {
    if (!selectedProfile) return;
    const formatted = formatStandardPgn(game);
    const opponent = game.white.isUser ? game.black.name : game.white.name;
    const cleanOpp = opponent.replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase();
    const fileName = `${selectedProfile.username}_vs_${cleanOpp}_${game.id}.pgn`;

    const blob = new Blob([formatted], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`Downloaded PGN: ${fileName}`);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[640px] p-0 overflow-hidden bg-card border-border shadow-2xl">
          <DialogHeader className="p-4 pb-2 border-b border-border/60 flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-md bg-primary/15 grid place-items-center text-primary ring-1 ring-primary/30">
                <Users className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <DialogTitle className="text-base font-bold">Search Users</DialogTitle>
                  {isOwner && (
                    <Badge
                      variant="secondary"
                      className="text-[10px] bg-primary/10 text-primary border-primary/30"
                    >
                      👑 Owner View
                    </Badge>
                  )}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  Find players by username or title.{" "}
                  {isOwner
                    ? "Inspect any profile and download every game ever played."
                    : "Click any player to view their profile."}
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

          {/* Results List */}
          <div className="max-h-[400px] overflow-y-auto p-3 space-y-2">
            {loading ? (
              <div className="py-8 text-center text-xs text-muted-foreground space-y-2">
                <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
                <div>Searching users...</div>
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
                    onClick={() => {
                      setSelectedProfile(p);
                      setActiveTab("overview");
                    }}
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
                          setActiveTab("overview");
                        }}
                      >
                        {isOwner ? "Inspect" : "View"}
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Profile & Historical Games Dialog */}
      {selectedProfile && (
        <Dialog open={!!selectedProfile} onOpenChange={(o) => !o && setSelectedProfile(null)}>
          <DialogContent className="sm:max-w-[620px] max-h-[85vh] p-0 overflow-hidden bg-card border-border shadow-2xl flex flex-col">
            <DialogHeader className="p-4 pb-3 border-b border-border/60 flex flex-row items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px] uppercase font-mono tracking-wider">
                  Player Profile
                </Badge>
                {isOwner && (
                  <Badge className="text-[10px] bg-amber-500/15 text-amber-500 border border-amber-500/30 font-semibold flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3" /> Owner Tools
                  </Badge>
                )}
              </div>
              {selectedProfile.country && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  {COUNTRIES[selectedProfile.country]?.flag}{" "}
                  {COUNTRIES[selectedProfile.country]?.name}
                </span>
              )}
            </DialogHeader>

            {/* Owner Tab Switcher */}
            {isOwner && (
              <div className="px-4 py-2 border-b border-border/40 bg-secondary/15 shrink-0 flex items-center justify-between gap-2">
                <Tabs
                  value={activeTab}
                  onValueChange={(v) => setActiveTab(v === "games" ? "games" : "overview")}
                  className="w-full"
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <TabsList className="grid grid-cols-2 w-full max-w-xs h-9 bg-secondary/40">
                      <TabsTrigger value="overview" className="text-xs">
                        Profile Overview
                      </TabsTrigger>
                      <TabsTrigger value="games" className="text-xs flex items-center gap-1.5">
                        <History className="w-3.5 h-3.5" />
                        All Games ({userGames.length})
                      </TabsTrigger>
                    </TabsList>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => selectedProfile && void loadUserGames(selectedProfile, true)}
                      disabled={loadingGames}
                      className="h-8 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
                      title="Deep scan local storage & backend to recover reset games"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${loadingGames ? "animate-spin" : ""}`} />
                      <span>🔄 Deep Scan & Recover Reset Games</span>
                    </Button>
                  </div>
                </Tabs>
              </div>
            )}

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-5">
              {(!isOwner || activeTab === "overview") && (
                <div className="flex flex-col items-center text-center space-y-4">
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
                      <h3 className="text-xl font-bold text-foreground">
                        {selectedProfile.username}
                      </h3>
                    </div>
                    {selectedProfile.status_text && (
                      <p className="text-xs text-muted-foreground italic mt-1 max-w-sm mx-auto">
                        "{selectedProfile.status_text}"
                      </p>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-3 w-full pt-2 border-t border-border/60">
                    <div className="p-3 rounded-lg bg-secondary/30 text-center">
                      <div className="text-[10px] font-semibold text-muted-foreground uppercase">
                        Rating
                      </div>
                      <div className="text-base font-bold text-primary font-mono mt-0.5">
                        {selectedProfile.elo_rating}
                      </div>
                    </div>

                    <div className="p-3 rounded-lg bg-secondary/30 text-center">
                      <div className="text-[10px] font-semibold text-muted-foreground uppercase">
                        Record
                      </div>
                      <div className="text-xs font-bold text-foreground mt-0.5">
                        {selectedProfile.wins}W / {selectedProfile.losses}L /{" "}
                        {selectedProfile.draws}D
                      </div>
                    </div>

                    <div className="p-3 rounded-lg bg-secondary/30 text-center">
                      <div className="text-[10px] font-semibold text-muted-foreground uppercase">
                        Win Rate
                      </div>
                      <div className="text-base font-bold text-emerald-500 mt-0.5">
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
                    <div className="flex items-center gap-1.5 text-xs text-emerald-500 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/30">
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Verified Federation ({selectedProfile.verified_federation})</span>
                    </div>
                  )}

                  {/* Owner quick callout */}
                  {isOwner && (
                    <div className="w-full mt-3 p-3 rounded-lg bg-primary/5 border border-primary/20 flex flex-wrap items-center justify-between gap-3 text-left">
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-foreground flex items-center gap-1.5">
                          <Bot className="w-4 h-4 text-primary" />
                          Complete Historical PGN Archive
                        </div>
                        <div className="text-[11px] text-muted-foreground truncate">
                          {loadingGames
                            ? "Scanning across resets & archives..."
                            : userGames.length > 0
                              ? `${userGames.length} game${userGames.length === 1 ? "" : "s"} recovered across all resets`
                              : "No historical games found yet"}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        onClick={handleDownloadAllPgns}
                        disabled={userGames.length === 0 || loadingGames}
                        className="h-8 text-xs font-semibold shrink-0 bg-primary text-primary-foreground gap-1.5"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Download All PGNs (.pgn) ({userGames.length})
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {/* Owner Games & PGN Explorer Tab */}
              {isOwner && activeTab === "games" && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg bg-secondary/30 border border-border/60">
                    <div>
                      <div className="text-xs font-bold text-foreground">
                        All Games for {selectedProfile.username} ({userGames.length} Total)
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        Includes active matches, bot sparring, and recovered pre-reset games.
                      </div>
                    </div>

                    <Button
                      size="sm"
                      onClick={handleDownloadAllPgns}
                      disabled={userGames.length === 0 || loadingGames}
                      className="h-8 text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90 shrink-0 gap-1.5 shadow-sm"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Download All PGNs (.pgn) ({userGames.length})
                    </Button>
                  </div>

                  {loadingGames ? (
                    <div className="py-12 text-center text-xs text-muted-foreground space-y-2">
                      <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
                      <div>Harvesting all historical matches and pre-reset games...</div>
                    </div>
                  ) : userGames.length === 0 ? (
                    <div className="py-12 text-center space-y-2 border border-dashed border-border/70 rounded-lg">
                      <FileText className="w-8 h-8 mx-auto text-muted-foreground/40" />
                      <div className="text-sm font-semibold">No Games Recorded</div>
                      <div className="text-xs text-muted-foreground max-w-sm mx-auto">
                        No matches were found in active storage or historical archives. Click "Deep
                        Scan & Recover Reset Games" above to re-check all databases.
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {userGames.map((game, idx) => {
                        const isUserWhite = game.white.isUser;
                        const opponent = isUserWhite ? game.black : game.white;
                        const isWin = game.userOutcome === "win";
                        const isLoss = game.userOutcome === "loss";
                        const resultBadge = isWin
                          ? "bg-emerald-500/15 text-emerald-500 border-emerald-500/30"
                          : isLoss
                            ? "bg-red-500/15 text-red-500 border-red-500/30"
                            : "bg-amber-500/15 text-amber-500 border-amber-500/30";

                        return (
                          <div
                            key={game.id || idx}
                            className="p-3 rounded-lg border border-border/50 bg-card/60 hover:bg-secondary/20 transition-all flex items-center justify-between gap-3"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase shrink-0 ${resultBadge}`}
                              >
                                {game.userOutcome}
                              </span>

                              <div className="min-w-0">
                                <div className="text-xs font-bold text-foreground flex items-center gap-1.5 flex-wrap">
                                  <span>vs {opponent.name}</span>
                                  <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4">
                                    {opponent.elo} ELO
                                  </Badge>
                                  {game.isRecovered && (
                                    <Badge className="text-[8px] bg-amber-500/10 text-amber-500 border-amber-500/20 px-1 py-0 h-3.5">
                                      Recovered History
                                    </Badge>
                                  )}
                                  <span className="text-[10px] font-normal text-muted-foreground">
                                    as {isUserWhite ? "White ⚪" : "Black ⚫"}
                                  </span>
                                </div>
                                <div className="text-[11px] text-muted-foreground flex items-center gap-2 mt-0.5 flex-wrap">
                                  <span>{game.moves} moves</span>
                                  <span>•</span>
                                  <span>{game.date}</span>
                                  {game.terminationReason && (
                                    <>
                                      <span>•</span>
                                      <span>{game.terminationReason}</span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 text-[11px]"
                                onClick={() => handleCopyIndividualPgn(game)}
                                title="Copy PGN to clipboard"
                              >
                                {copiedPgnId === game.id ? (
                                  <Check className="w-3 h-3 text-emerald-500" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                                <span className="ml-1 hidden sm:inline">PGN</span>
                              </Button>

                              <Button
                                variant="secondary"
                                size="sm"
                                className="h-7 px-2 text-[11px]"
                                onClick={() => handleDownloadIndividualPgn(game)}
                                title="Download .pgn file"
                              >
                                <Download className="w-3 h-3" />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Bottom Actions */}
            <div className="flex items-center gap-2 p-4 border-t border-border/60 bg-card shrink-0">
              <Button
                variant="outline"
                className="flex-1 text-xs"
                onClick={() => handleCopyLink(selectedProfile)}
              >
                {copiedId ? (
                  <Check className="w-3.5 h-3.5 mr-1.5 text-emerald-500" />
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
                  toast.success(`Selected player: ${selectedProfile.username}`);
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
