import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chess, type Square, type PieceSymbol, type Color } from "chess.js";
import { Board } from "./Board";
import { PromotionDialog } from "./PromotionDialog";
import { BotRoster } from "./BotRoster";
import { OwnerPortal } from "./OwnerPortal";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Flag,
  FlipHorizontal2,
  Home,
  LogOut,
  Play,
  Settings,
  Swords,
  Trophy,
  User,
  Bell,
  ExternalLink,
  Bot,
} from "lucide-react";
import { UpdateLogButton } from "./UpdateLogButton";
import { cn } from "@/lib/utils";
import {
  chooseBotMove,
  getActiveBotId,
  incrementBotLifetime,
  loadBots,
  refreshFromCloud,
  subscribeBots,
  pickOpeningForBot,
  pickThinkingDelayMs,
  type BotConfig,
} from "@/lib/botStore";
import type { OpeningDef } from "@/lib/openingLibrary";
import { useAuth } from "@/lib/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { BathroomBreak } from "./BathroomBreak";
import { ProfilePage } from "./ProfilePage";
import { SettingsPage } from "./SettingsPage";
import { FeedbackPage } from "./FeedbackPage";
import { botDisplayIdentity, isImmersiveEnabled, useImmersive } from "@/lib/immersive";
import { BotChatBubble } from "./BotChatBubble";
import { UpdatesPopup } from "./UpdatesPopup";
import { getTitleColor, refreshTitleColors, subscribeTitleColors } from "@/lib/botStore";
import { MessageCircle } from "lucide-react";
import { playMoveResultSound } from "@/lib/sounds";
import { GameModesHub } from "./GameModesHub";

type ColorChoice = "white" | "black" | "random";
type BotStats = { wins: number; losses: number; draws: number };
type AppMode = "home" | "hub" | "match" | "profile" | "settings" | "modes";
type SidebarKey = "home" | "play" | "modes" | "profile" | "updates" | "settings";

const EMPTY_STATS: BotStats = { wins: 0, losses: 0, draws: 0 };

/** Display identity helper honouring the Immersive Bot Names setting. */
function botDisplay(bot: BotConfig) {
  return botDisplayIdentity(bot, isImmersiveEnabled());
}

export function TitleBadge({
  title,
  color,
  size = "md",
}: {
  title?: string | null;
  color?: string | null;
  size?: "sm" | "md" | "lg";
}) {
  if (!title) return null;
  const resolved = getTitleColor(title, color) ?? "#dc2626";
  const px = size === "lg" ? "px-2 py-0.5 text-xs" : size === "sm" ? "px-1.5 py-[1px] text-[10px]" : "px-1.5 py-0.5 text-[11px]";
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-[3px] font-black uppercase tracking-wide text-white leading-none shrink-0",
        px,
      )}
      style={{ backgroundColor: resolved }}
    >
      {title}
    </span>
  );
}

function PlayerIdentity({
  username,
  elo,
  title,
  titleColor,
  icon,
  size = "md",
}: {
  username: string;
  elo: number;
  title?: string | null;
  titleColor?: string | null;
  icon?: string | null;
  size?: "sm" | "md" | "lg";
}) {
  const cls = size === "lg" ? "text-2xl" : size === "sm" ? "text-sm" : "text-base";
  const badgeSize = size === "lg" ? "md" : "sm";
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold tracking-tight max-w-full min-w-0", cls)}>
      <TitleBadge title={title} color={titleColor} size={badgeSize} />
      {icon && <span className="text-[0.9em] leading-none shrink-0">{icon}</span>}
      <span className="text-foreground truncate min-w-0">{username}</span>
      <span className="text-muted-foreground/70 font-normal text-[0.85em] shrink-0">({elo})</span>
    </span>
  );
}

function MiniProfileCard({ profile }: { profile: { username: string; avatar_url: string | null; elo_rating: number; title_badge?: string | null; profile_icon?: string | null; wins: number; losses: number; draws: number } }) {
  return (
    <Card className="bg-card p-3 flex items-center gap-3">
      <div className="w-10 h-10 rounded-md bg-secondary grid place-items-center overflow-hidden shrink-0 ring-1 ring-border">
        {profile.avatar_url ? (
          <img src={profile.avatar_url} alt={profile.username} className="w-full h-full object-cover" />
        ) : (
          <User className="w-4 h-4 text-muted-foreground" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <PlayerIdentity
          username={profile.username}
          elo={profile.elo_rating}
          title={profile.title_badge}
          icon={profile.profile_icon}
          size="sm"
        />
        <div className="text-[11px] text-muted-foreground mt-0.5">
          {profile.wins}W · {profile.losses}L · {profile.draws}D
        </div>
      </div>
    </Card>
  );
}

export function ChessApp() {
  const { profile, refreshProfile, signOut, user } = useAuth();
  const gameRef = useRef(new Chess());
  const [, setTick] = useState(0);
  const force = useCallback(() => setTick((t) => t + 1), []);
  const recordedRef = useRef(false);

  const [flipped, setFlipped] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [uciHistory, setUciHistory] = useState<string[]>([]);
  const [lastMove, setLastMove] = useState<{ from: Square; to: Square } | null>(null);
  const [pending, setPending] = useState(false);
  const [promotion, setPromotion] = useState<{ from: Square; to: Square } | null>(null);
  const [activeBot, setActiveBotState] = useState<BotConfig | null>(null);
  const [immersive] = useImmersive();
  const activeBotName = activeBot ? botDisplayIdentity(activeBot, immersive).name : null;

  const [colorChoice, setColorChoice] = useState<ColorChoice>("white");
  const [playerColor, setPlayerColor] = useState<Color>("w");
  const [botStats, setBotStats] = useState<BotStats>(EMPTY_STATS);
  const [resultModal, setResultModal] = useState<{ open: boolean; title: string; detail: string }>({
    open: false, title: "", detail: "",
  });

  const game = gameRef.current;

  const [bathroomOpen, setBathroomOpen] = useState(false);
  
  const [resignedFlag, setResignedFlag] = useState(false);
  const [matchActive, setMatchActive] = useState(false);

  // Navigation modes
  const [mode, setMode] = useState<AppMode>("home");
  const [sidebar, setSidebar] = useState<SidebarKey>("home");
  const [vsOverlay, setVsOverlay] = useState(false);

  useEffect(() => {
    const refresh = () => {
      const id = getActiveBotId();
      setActiveBotState(id ? loadBots().find((b) => b.id === id) ?? null : null);
    };
    refresh();
    const unsub = subscribeBots(refresh);
    refreshFromCloud();
    return unsub;
  }, []);

  const loadBotStats = useCallback(async (bot: BotConfig | null) => {
    if (!user || !bot) { setBotStats(EMPTY_STATS); return; }
    const { data, error } = await supabase
      .from("bot_stats")
      .select("wins,losses,draws")
      .eq("user_id", user.id)
      .eq("bot_id", bot.id)
      .maybeSingle();
    if (error) { setBotStats(EMPTY_STATS); return; }
    setBotStats(data ?? EMPTY_STATS);
  }, [user]);

  useEffect(() => { loadBotStats(activeBot); }, [activeBot, loadBotStats]);

  // Opening chosen for the current match (from bot's repertoire).
  const currentOpeningRef = useRef<OpeningDef | null>(null);

  const requestBotMoveRef = useRef<() => void>(() => {});

  const requestBotMove = useCallback(
    async () => {
      if (game.isGameOver()) { setPending(false); return; }
      const startedAt = Date.now();
      try {
        const result = await chooseBotMove(game, activeBot, {
          openingLine: currentOpeningRef.current?.line ?? null,
        });
        if (!result) { setPending(false); return; }
        const { move: pick } = result;
        // Per-bot thinking delay (min..max ms). Cosmetic pacing only.
        const targetMs = pickThinkingDelayMs(activeBot);
        const elapsed = Date.now() - startedAt;
        if (elapsed < targetMs) await new Promise((r) => setTimeout(r, targetMs - elapsed));
        const m = game.move({
          from: pick.from as Square,
          to: pick.to as Square,
          promotion: pick.promotion as "q" | "r" | "b" | "n" | undefined,
        });
        if (!m) throw new Error(`Illegal engine move ${pick.from}${pick.to}`);
        playMoveResultSound(m);
        setHistory((h) => [...h, m.san]);
        setUciHistory((h) => [...h, pick.from + pick.to + (pick.promotion ?? "")]);
        setLastMove({ from: pick.from as Square, to: pick.to as Square });
        force();
      } catch {
        /* swallow */
      } finally {
        setPending(false);
      }
    },
    [game, force, activeBot],
  );

  useEffect(() => { requestBotMoveRef.current = requestBotMove; }, [requestBotMove]);

  const beginMatch = useCallback(() => {
    gameRef.current = new Chess();
    setHistory([]);
    setUciHistory([]);
    setLastMove(null);
    setPromotion(null);
    recordedRef.current = false;
    setResignedFlag(false);

    let color: Color = "w";
    if (colorChoice === "white") color = "w";
    else if (colorChoice === "black") color = "b";
    else color = Math.random() < 0.5 ? "w" : "b";
    setPlayerColor(color);
    setFlipped(color === "b");
    // Pick this game's opening from the bot's repertoire for its color.
    const botColor: "w" | "b" = color === "w" ? "b" : "w";
    currentOpeningRef.current = pickOpeningForBot(activeBot, botColor);
    setMatchActive(true);
    setMode("match");
    force();

    if (color === "b") {
      setPending(true);
      setTimeout(() => requestBotMoveRef.current(), 250);
    } else {
      setPending(false);
    }
  }, [colorChoice, force, activeBot]);

  const triggerPlay = useCallback(() => {
    if (!activeBot) return;
    setVsOverlay(true);
  }, [activeBot]);

  // VS overlay auto-advance after 1.2s
  useEffect(() => {
    if (!vsOverlay) return;
    const t = setTimeout(() => {
      setVsOverlay(false);
      beginMatch();
    }, 1200);
    return () => clearTimeout(t);
  }, [vsOverlay, beginMatch]);

  const skipOverlay = useCallback(() => {
    if (!vsOverlay) return;
    setVsOverlay(false);
    beginMatch();
  }, [vsOverlay, beginMatch]);

  const finishMove = useCallback(
    (from: Square, to: Square, promo?: PieceSymbol) => {
      const move = game.move({ from, to, promotion: promo as "q" | "r" | "b" | "n" | undefined });
      if (!move) return false;
      playMoveResultSound(move);
      const uci = from + to + (promo ?? "");
      setHistory((h) => [...h, move.san]);
      setUciHistory((h) => [...h, uci]);
      setLastMove({ from, to });
      force();
      setPending(true);
      setTimeout(() => requestBotMoveRef.current(), 250);
      return true;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [game, uciHistory],
  );

  const handleAttemptMove = useCallback(
    (from: Square, to: Square) => {
      if (pending) return false;
      if (game.turn() !== playerColor) return false;
      const piece = game.get(from);
      if (!piece || piece.color !== playerColor) return false;
      const isPromotion =
        piece.type === "p" &&
        ((piece.color === "w" && to[1] === "8") || (piece.color === "b" && to[1] === "1"));
      const legal = (game.moves({ square: from, verbose: true }) as Array<{ to: string }>).some(
        (m) => m.to === to,
      );
      if (!legal) return false;
      if (isPromotion) {
        setPromotion({ from, to });
        return true;
      }
      return finishMove(from, to);
    },
    [game, pending, finishMove, playerColor],
  );

  const gameStatusText = useMemo(() => {
    if (game.isCheckmate()) return `Checkmate — ${game.turn() === "w" ? "Black" : "White"} wins`;
    if (game.isStalemate()) return "Stalemate";
    if (game.isDraw()) return "Draw";
    if (game.inCheck()) return `${game.turn() === "w" ? "White" : "Black"} is in check`;
    return `${game.turn() === "w" ? "White" : "Black"} to move`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history.length, game]);

  const resignMatch = useCallback(() => {
    if (recordedRef.current || game.isGameOver()) return;
    if (history.length === 0) return;
    setPending(false);
    setResignedFlag(true);
  }, [game, history.length]);

  useEffect(() => {
    if (!user || !profile || recordedRef.current) return;
    const over = game.isGameOver() || resignedFlag;
    if (!over) return;
    recordedRef.current = true;

    let userField: "wins" | "losses" | "draws" = "draws";
    let botField: "wins" | "losses" | "draws" = "draws";
    let title = "Draw";
    let detail = "The game ended in a draw.";

    if (resignedFlag) {
      userField = "losses"; botField = "wins";
      title = "Defeat";
      detail = `You resigned — ${activeBotName ?? "the bot"} wins.`;
    } else if (game.isCheckmate()) {
      const loser = game.turn();
      if (loser === playerColor) {
        userField = "losses"; botField = "wins";
        title = "Defeat";
        detail = `${activeBotName ?? "Bot"} delivered checkmate.`;
      } else {
        userField = "wins"; botField = "losses";
        title = "Victory";
        detail = `You checkmated ${activeBotName ?? "the bot"}!`;
      }
    } else if (game.isStalemate()) {
      detail = "Stalemate — no legal moves.";
    }

    const profUpdate = {
      wins: profile.wins,
      losses: profile.losses,
      draws: profile.draws,
      elo_rating: profile.elo_rating,
    };
    profUpdate[userField] = profUpdate[userField] + 1;
    supabase.from("profiles").update(profUpdate).eq("id", user.id).then(({ error }) => {
      if (!error) refreshProfile();
    });

    if (activeBot) {
      const next: BotStats = {
        wins: botStats.wins + (botField === "wins" ? 1 : 0),
        losses: botStats.losses + (botField === "losses" ? 1 : 0),
        draws: botStats.draws + (botField === "draws" ? 1 : 0),
      };
      setBotStats(next);
      supabase.from("bot_stats").upsert({
        user_id: user.id,
        bot_id: activeBot.id,
        bot_name: activeBot.name,
        ...next,
      }, { onConflict: "user_id,bot_id" }).then(() => {});
      if (botField === "wins") incrementBotLifetime(activeBot.id, 1, 0);
      else if (botField === "losses") incrementBotLifetime(activeBot.id, 0, 1);
    }

    setResultModal({ open: true, title, detail });
    setMatchActive(false);
  }, [history.length, game, user, profile, refreshProfile, activeBot, playerColor, botStats, resignedFlag]);

  const moveRows = useMemo(() => {
    const rows: Array<{ n: number; w: string; b?: string }> = [];
    for (let i = 0; i < history.length; i += 2) {
      rows.push({ n: i / 2 + 1, w: history[i], b: history[i + 1] });
    }
    return rows;
  }, [history]);

  const navItems: Array<{ key: SidebarKey; label: string; icon: typeof Home; onClick?: () => void }> = [
    { key: "home", label: "Home", icon: Home, onClick: () => { setSidebar("home"); setMode("home"); } },
    { key: "play", label: "Play Bots", icon: Swords, onClick: () => { setSidebar("play"); if (mode !== "match") setMode("hub"); } },
    { key: "modes", label: "Game Modes", icon: Bot, onClick: () => { setSidebar("modes"); setMode("modes"); } },
    { key: "profile", label: "Profile", icon: User, onClick: () => { setSidebar("profile"); setMode("profile"); } },
    { key: "updates", label: "Updates", icon: Bell },
    { key: "settings", label: "Settings", icon: Settings, onClick: () => { setSidebar("settings"); setMode("settings"); } },
  ];

  return (
    <div className="min-h-screen w-full flex overflow-x-hidden">
      {/* Sidebar */}
      <aside className="w-16 md:w-56 shrink-0 border-r border-border bg-card/40 flex flex-col">
        <div className="px-3 md:px-4 py-4 flex items-center gap-2 border-b border-border">
          <div className="w-8 h-8 rounded-md bg-primary/15 grid place-items-center ring-1 ring-primary/30">
            <span className="text-primary text-base font-black">♞</span>
          </div>
          <div className="hidden md:block">
            <div className="text-sm font-bold leading-tight">BotBoard</div>
            <div className="text-[10px] text-muted-foreground">Chess Arena</div>
          </div>
        </div>
        <nav className="flex-1 py-3 space-y-0.5 px-2">
          {navItems.map((item, idx) => {
            const Icon = item.icon;
            const active =
              item.key === "home" ? mode === "home" :
              item.key === "play" ? mode === "hub" || mode === "match" :
              item.key === "modes" ? mode === "modes" :
              item.key === "profile" ? mode === "profile" :
              item.key === "settings" ? mode === "settings" :
              false;
            const content = (
              <button
                key={idx}
                onClick={item.onClick}
                className={cn(
                  "w-full flex items-center gap-3 px-2 md:px-3 py-2 rounded-md text-left text-sm transition-colors",
                  active ? "bg-primary/15 text-primary font-semibold" : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground",
                )}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="hidden md:inline">{item.label}</span>
              </button>
            );
            if (item.label === "Updates") {
              return (
                <div key={idx} className="px-0">
                  <div className="md:hidden grid place-items-center py-1"><UpdateLogButton /></div>
                  <div className="hidden md:block"><UpdateLogButton /></div>
                </div>
              );
            }
            return content;
          })}
        </nav>
        <div className="p-2 border-t border-border space-y-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setBathroomOpen(true)}
            className="w-full justify-start text-xs"
          >
            🚽 <span className="hidden md:inline ml-1">Bathroom</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => signOut()}
            className="w-full justify-start text-xs text-muted-foreground"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Sign out</span>
          </Button>
        </div>
      </aside>

      {/* Main content area */}
      <div className="flex-1 min-w-0 flex flex-col">
        <main className="flex-1 px-4 md:px-8 py-6">
          {mode === "home" && profile && (
            <HomeView
              profile={profile}
              onPlay={() => { setSidebar("play"); setMode("hub"); }}
            />
          )}

          {mode === "hub" && (
            <HubView
              profile={profile}
              activeBot={activeBot}
              colorChoice={colorChoice}
              setColorChoice={setColorChoice}
              onPlay={triggerPlay}
              flipped={flipped}
            />
          )}

          {mode === "match" && (
            <MatchView
              profile={profile}
              activeBot={activeBot}
              game={game}
              flipped={flipped}
              pending={pending}
              matchActive={matchActive}
              resignedFlag={resignedFlag}
              gameStatusText={gameStatusText}
              bathroomOpen={bathroomOpen}
              lastMove={lastMove}
              handleAttemptMove={handleAttemptMove}
              moveRows={moveRows}
              onResign={resignMatch}
              onFlip={() => setFlipped((f) => !f)}
              botStats={botStats}
            />
          )}
          {mode === "profile" && profile && <ProfilePage />}
          {mode === "settings" && <SettingsPage />}
          {mode === "modes" && <GameModesHub />}
        </main>

        {/* Owner Portal — always at the bottom */}
        <div className="border-t border-border">
          <OwnerPortal />
        </div>
      </div>

      <PromotionDialog
        open={!!promotion}
        color={playerColor}
        onSelect={(p) => {
          if (promotion) {
            finishMove(promotion.from, promotion.to, p);
            setPromotion(null);
          }
        }}
      />

      {/* VS Overlay */}
      {vsOverlay && activeBot && profile && (
        <div
          className="fixed inset-0 z-[80] bg-background/90 backdrop-blur-md grid place-items-center animate-in fade-in duration-200 cursor-pointer"
          onClick={skipOverlay}
        >
          <div className="flex items-center gap-8 md:gap-16 px-6">
            <VsCard
              name={profile.username}
              avatar={profile.avatar_url}
              elo={profile.elo_rating}
              title={profile.title_badge}
              side="left"
            />
            <div className="text-5xl md:text-7xl font-black text-primary animate-pulse drop-shadow-[0_0_20px_hsl(var(--primary)/0.6)]">
              VS
            </div>
            <VsCard
              name={activeBotName ?? activeBot.name}
              avatar={activeBot.avatar}
              elo={activeBot.elo}
              title={botDisplayIdentity(activeBot, immersive).title}
              titleColor={botDisplayIdentity(activeBot, immersive).titleColor}
              subtitle={activeBot.category}
              side="right"
            />
          </div>
          <div className="absolute bottom-8 text-xs text-muted-foreground">Click anywhere to skip</div>
        </div>
      )}

      <Dialog open={resultModal.open} onOpenChange={(v) => setResultModal((r) => ({ ...r, open: v }))}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <Trophy className={cn("w-5 h-5",
                resultModal.title === "Victory" && "text-success",
                resultModal.title === "Defeat" && "text-destructive",
                resultModal.title === "Draw" && "text-primary",
              )} />
              {resultModal.title}
            </DialogTitle>
            <DialogDescription>{resultModal.detail}</DialogDescription>
          </DialogHeader>
          {activeBot && (
            <div className="rounded-md bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
              <div className="font-semibold text-foreground mb-1">{activeBotName ?? activeBot.name} — lifetime record</div>
              <span className="text-success">W {botStats.wins}</span>
              {" · "}<span className="text-destructive">L {botStats.losses}</span>
              {" · "}<span>D {botStats.draws}</span>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => { setResultModal((r) => ({ ...r, open: false })); setMode("hub"); }}
            >
              Back to Hub
            </Button>
            <Button
              onClick={() => { setResultModal((r) => ({ ...r, open: false })); triggerPlay(); }}
              className="bg-success text-primary-foreground hover:bg-success/90"
            >
              <Play className="w-4 h-4 mr-1" /> Play again
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BathroomBreak open={bathroomOpen} onClose={() => setBathroomOpen(false)} />
      
      <UpdatesPopup />
    </div>
  );
}

/* ───────── Sub-views ───────── */

function HomeView({
  profile,
  onPlay,
}: {
  profile: NonNullable<ReturnType<typeof useAuth>["profile"]>;
  onPlay: () => void;
}) {
  return (
    <div className="max-w-2xl mx-auto pt-12 md:pt-20 space-y-8">
      <div className="flex items-center gap-5">
        <div className="w-20 h-20 rounded-md bg-secondary grid place-items-center overflow-hidden ring-1 ring-border shrink-0">
          {profile.avatar_url ? (
            <img src={profile.avatar_url} alt={profile.username} className="w-full h-full object-cover" />
          ) : (
            <User className="w-8 h-8 text-muted-foreground" />
          )}
        </div>
        <div className="min-w-0">
          <PlayerIdentity
            username={profile.username}
            elo={profile.elo_rating}
            title={profile.title_badge}
            icon={profile.profile_icon}
            size="lg"
          />
          <div className="text-xs text-muted-foreground mt-2">
            {profile.wins} wins · {profile.losses} losses · {profile.draws} draws
          </div>
        </div>
      </div>

      <div className="pt-4">
        <Button
          onClick={onPlay}
          className="bg-success text-primary-foreground hover:bg-success/90 font-bold h-12 px-8 text-base"
        >
          <Swords className="w-5 h-5 mr-2" /> Play Bots
        </Button>
      </div>

      <div className="text-xs text-muted-foreground border-t border-border pt-6">
        Welcome back. Choose <span className="text-foreground">Play Bots</span> from the sidebar to enter the hub.
      </div>
    </div>
  );
}

function HubView({
  profile,
  activeBot,
  colorChoice,
  setColorChoice,
  onPlay,
  flipped,
}: {
  profile: ReturnType<typeof useAuth>["profile"];
  activeBot: BotConfig | null;
  colorChoice: ColorChoice;
  setColorChoice: (c: ColorChoice) => void;
  onPlay: () => void;
  flipped: boolean;
}) {
  const idleGame = useMemo(() => new Chess(), []);
  return (
    <div className="max-w-[1500px] mx-auto grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)_380px] gap-6 lg:gap-8">
      {/* Left: compact player */}
      <div className="space-y-4 min-w-0">
        {profile && <MiniProfileCard profile={profile} />}
        <Card className="bg-card p-4 space-y-3">
          <Label className="text-xs text-muted-foreground px-1">Play as</Label>
          <div className="grid grid-cols-3 gap-1.5">
            {([
              { v: "white" as const, label: "⚪" },
              { v: "black" as const, label: "⚫" },
              { v: "random" as const, label: "🔀" },
            ]).map((o) => (
              <button
                key={o.v}
                type="button"
                onClick={() => setColorChoice(o.v)}
                className={cn(
                  "text-sm py-2 rounded-md border transition-colors",
                  colorChoice === o.v
                    ? "bg-primary/15 border-primary/50 text-primary"
                    : "bg-secondary/40 border-border/60 text-muted-foreground hover:bg-secondary",
                )}
                title={o.v}
              >
                {o.label}
              </button>
            ))}
          </div>
          {activeBot ? (
            <Button
              onClick={onPlay}
              className="w-full bg-success text-primary-foreground hover:bg-success/90 font-bold h-11"
            >
              <Play className="w-4 h-4 mr-2" /> Play {botDisplay(activeBot).name}
            </Button>
          ) : (
            <div className="text-[11px] text-muted-foreground text-center py-2 border border-dashed border-border/60 rounded-md">
              Select a bot from the library →
            </div>
          )}
        </Card>
        <a
          href="https://sites.google.com/view/chess-bot-library"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 rounded-lg border border-border/60 bg-card px-4 py-3 text-sm font-medium text-foreground transition-colors hover:bg-secondary/60 hover:text-primary"
        >
          <span>Bot Library / Info Page</span>
          <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
        </a>
      </div>

      {/* Center: idle board */}
      <Card className="p-5 md:p-6 bg-card min-w-0">
        <div className="text-sm text-muted-foreground mb-4">Idle board · select a bot to play</div>
        <div className="mx-auto w-full max-w-[min(60vh,520px)]">
          <Board
            game={idleGame}
            flipped={flipped}
            disabled
            lastMove={null}
            onAttemptMove={() => false}
          />
        </div>
      </Card>

      {/* Right: bot library */}
      <div className="min-w-0">
        <BotRoster />
      </div>
    </div>
  );
}

function MatchView({
  profile,
  activeBot,
  game,
  flipped,
  pending,
  matchActive,
  resignedFlag,
  gameStatusText,
  bathroomOpen,
  lastMove,
  handleAttemptMove,
  moveRows,
  onResign,
  onFlip,
  botStats,
}: {
  profile: ReturnType<typeof useAuth>["profile"];
  activeBot: BotConfig | null;
  game: Chess;
  flipped: boolean;
  pending: boolean;
  matchActive: boolean;
  resignedFlag: boolean;
  gameStatusText: string;
  bathroomOpen: boolean;
  lastMove: { from: Square; to: Square } | null;
  handleAttemptMove: (from: Square, to: Square) => boolean;
  moveRows: Array<{ n: number; w: string; b?: string }>;
  onResign: () => void;
  onFlip: () => void;
  botStats: BotStats;
}) {
  return (
    <div className="max-w-[1500px] mx-auto grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-6 lg:gap-8">
      <section className="space-y-4 min-w-0">
        {/* Top: Bot */}
        {activeBot && (
          <div className="relative">
            <BotChatBubble active={matchActive && !game.isGameOver() && !resignedFlag} lines={activeBot.dialogueLines} />
            <Card className="bg-card p-3 flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-secondary grid place-items-center overflow-hidden shrink-0 ring-1 ring-primary/40">
                {activeBot.avatar ? (
                  <img src={activeBot.avatar} alt={activeBot.name} className="w-full h-full object-cover" />
                ) : (
                  <User className="w-5 h-5 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold truncate inline-flex items-center gap-2">
                  <TitleBadge title={botDisplay(activeBot).title} color={botDisplay(activeBot).titleColor} size="sm" />
                  <span className="truncate">{botDisplay(activeBot).name}</span>
                  <span className="text-muted-foreground/70 font-normal">({activeBot.elo})</span>
                </div>
                <div className="text-[11px] text-muted-foreground truncate">{activeBot.category}</div>
              </div>
              <div className="text-[11px] text-muted-foreground text-right shrink-0">
                <span className="text-success">{botStats.wins}W</span> · <span className="text-destructive">{botStats.losses}L</span> · {botStats.draws}D
              </div>
            </Card>
          </div>
        )}

        {/* Board */}
        <Card className="p-5 md:p-6 bg-card min-w-0">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm font-medium truncate">{gameStatusText}</div>
            <div className="flex items-center gap-2 shrink-0">
              {pending && <div className="text-xs text-muted-foreground">Bot thinking…</div>}
              <Button variant="ghost" size="sm" onClick={onFlip}>
                <FlipHorizontal2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
          <div className="mx-auto w-full max-w-[min(65vh,560px)]">
            <Board
              game={game}
              flipped={flipped}
              disabled={pending || game.isGameOver() || bathroomOpen || resignedFlag}
              lastMove={lastMove}
              onAttemptMove={handleAttemptMove}
            />
          </div>
        </Card>

        {/* Bottom: Player */}
        {profile && <MiniProfileCard profile={profile} />}
      </section>

      {/* Right: Moves + Resign */}
      <aside className="flex flex-col gap-3">
        <Card className="bg-card p-3 flex-1 min-h-[260px]">
          <div className="text-sm font-semibold mb-2 px-1">Moves</div>
          <div className="max-h-[480px] overflow-auto scroll-thin rounded-md">
            {moveRows.length === 0 ? (
              <div className="text-xs text-muted-foreground px-2 py-4">No moves yet.</div>
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {moveRows.map((r) => (
                    <tr key={r.n} className="odd:bg-secondary/30">
                      <td className="px-2 py-1 text-muted-foreground w-8 text-xs">{r.n}.</td>
                      <td className="px-2 py-1 font-mono">{r.w}</td>
                      <td className="px-2 py-1 font-mono text-muted-foreground">{r.b ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Card>
        <Button
          onClick={onResign}
          variant="destructive"
          disabled={game.isGameOver() || resignedFlag || moveRows.length === 0}
          className="w-full font-bold"
        >
          <Flag className="w-4 h-4 mr-2" /> Resign
        </Button>
      </aside>
    </div>
  );
}

function VsCard({
  name,
  avatar,
  elo,
  title,
  titleColor,
  subtitle,
  side,
}: {
  name: string;
  avatar?: string | null;
  elo: number;
  title?: string | null;
  titleColor?: string | null;
  subtitle?: string;
  side: "left" | "right";
}) {
  return (
    <div className={cn("flex flex-col items-center gap-3", side === "right" ? "text-right" : "text-left")}>
      <div className="w-24 h-24 md:w-32 md:h-32 rounded-md bg-secondary grid place-items-center overflow-hidden ring-2 ring-primary/40 shadow-[0_0_30px_hsl(var(--primary)/0.3)]">
        {avatar ? (
          <img src={avatar} alt={name} className="w-full h-full object-cover" />
        ) : (
          <User className="w-10 h-10 text-muted-foreground" />
        )}
      </div>
      <div className="text-center flex flex-col items-center gap-1">
        <TitleBadge title={title} color={titleColor} size="md" />
        <div className="text-base md:text-xl font-bold">{name}</div>
        <div className="text-xs text-muted-foreground">({elo})</div>
        {subtitle && <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">{subtitle}</div>}
      </div>
    </div>
  );
}
