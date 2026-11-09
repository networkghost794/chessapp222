import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chess, type Square, type PieceSymbol, type Color } from "chess.js";
import { Board } from "./Board";
import { PromotionDialog } from "./PromotionDialog";
import { GameOverModal } from "./GameOverModal";
import { PlayBotsPanel } from "./PlayBotsPanel";
import { Link } from "@tanstack/react-router";
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
  pickThinkingDelayMs,
  type BotConfig,
} from "@/lib/botStore";
import { useAuth } from "@/lib/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { BathroomBreak } from "./BathroomBreak";
import { ProfilePage } from "./ProfilePage";
import { HomeDashboard } from "./HomeDashboard";
import { useUiSettings, label, useEventTheme } from "@/lib/appSettings";
import { SettingsPage } from "./SettingsPage";
import { FeedbackPage } from "./FeedbackPage";
import { botDisplayIdentity, isImmersiveEnabled, useImmersive } from "@/lib/immersive";
import { BotChatBubble } from "./BotChatBubble";
import { UpdatesPopup } from "./UpdatesPopup";
import { getTitleColor, refreshTitleColors, subscribeTitleColors } from "@/lib/botStore";
import { MessageCircle } from "lucide-react";
import { playMoveResultSound } from "@/lib/sounds";
import { GameModesHub } from "./GameModesHub";
import { EventDecor } from "./EventDecor";
import { BoardScaleControl } from "./BoardScaleControl";
import { initSettingsEffects } from "@/lib/settings";
import { recordFinishedGame } from "@/lib/gameHistory";

type ColorChoice = "white" | "black" | "random";
type BotStats = { wins: number; losses: number; draws: number };
type AppMode = "home" | "hub" | "match" | "profile" | "settings" | "modes";
type SidebarKey = "home" | "play" | "modes" | "profile" | "updates" | "settings";

const EMPTY_STATS: BotStats = { wins: 0, losses: 0, draws: 0 };

/** Display identity helper honouring the Immersive Bot Names setting. */
function botDisplay(bot: BotConfig) {
  return botDisplayIdentity(bot, isImmersiveEnabled());
}

const TITLE_NAMES: Record<string, string> = {
  GM: "Grandmaster",
  IM: "International Master",
  FM: "FIDE Master",
  CM: "Candidate Master",
  NM: "National Master",
  WGM: "Woman Grandmaster",
  WIM: "Woman International Master",
  WFM: "Woman FIDE Master",
  WCM: "Woman Candidate Master",
  CRTR: "Creator & Founder",
  SF: "Stockfish Engine",
};

/** Chess.com-style title chip (cc-user-title-component). */
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
  const clean = title.replace(/[^\p{L}\p{N}]/gu, "").toUpperCase() || title;
  const isCreator = clean === "CRTR";
  const custom = isCreator
    ? color && color !== "#a78bfa" && color !== "#a7322f"
      ? color
      : undefined
    : getTitleColor(clean, color);
  const isOfficialRed =
    !custom || custom === "#a7322f" || custom === "var(--title-red)" || custom === "#a78bfa";
  const px =
    size === "lg"
      ? "px-[0.4em] text-[15px]"
      : size === "sm"
        ? "px-[0.35em] text-[11px]"
        : "px-[0.35em] text-[13px]";
  return (
    <span
      title={TITLE_NAMES[clean] ?? clean}
      className={cn(
        "inline-flex items-center justify-center rounded-[3px] font-extrabold leading-[1.45] tracking-[0.01em] shrink-0 select-none text-white cursor-default",
        px,
        isCreator
          ? "bg-[image:var(--title-creator)] shadow-[0_0_8px_-2px_var(--title-creator-glow)]"
          : isOfficialRed
            ? "bg-[color:var(--title-red)]"
            : "",
      )}
      style={!isCreator && !isOfficialRed && custom ? { backgroundColor: custom } : undefined}
    >
      {clean}
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
    <span
      className={cn(
        "inline-flex items-center gap-2 font-semibold tracking-tight max-w-full min-w-0",
        cls,
      )}
    >
      <TitleBadge title={title} color={titleColor} size={badgeSize} />
      {icon && <span className="text-[0.9em] leading-none shrink-0">{icon}</span>}
      <span className="text-foreground truncate min-w-0">{username}</span>
      <span className="text-muted-foreground/70 font-normal text-[0.85em] shrink-0">({elo})</span>
    </span>
  );
}

function MiniProfileCard({
  profile,
}: {
  profile: {
    username: string;
    avatar_url: string | null;
    elo_rating: number;
    title_badge?: string | null;
    profile_icon?: string | null;
    wins: number;
    losses: number;
    draws: number;
  };
}) {
  return (
    <Card className="bg-card/90 py-1.5 px-3 flex items-center gap-2.5 rounded-lg border border-border/60">
      <div className="w-8 h-8 rounded-full bg-secondary grid place-items-center overflow-hidden shrink-0 ring-1 ring-border">
        {profile.avatar_url ? (
          <img
            src={profile.avatar_url}
            alt={profile.username}
            className="w-full h-full object-cover"
          />
        ) : (
          <User className="w-4 h-4 text-muted-foreground" />
        )}
      </div>
      <div className="min-w-0 flex-1 flex items-center gap-2">
        <PlayerIdentity
          username={profile.username}
          elo={profile.elo_rating}
          title={profile.title_badge}
          icon={profile.profile_icon}
          size="sm"
        />
        <div className="text-[10px] text-muted-foreground/70 hidden sm:inline shrink-0 font-mono">
          · {profile.wins}W {profile.losses}L {profile.draws}D
        </div>
      </div>
    </Card>
  );
}

export function ChessApp() {
  const { profile, refreshProfile, signOut, user, isOwner } = useAuth();
  const gameRef = useRef(new Chess());
  const [, setTick] = useState(0);
  const force = useCallback(() => setTick((t) => t + 1), []);
  const recordedRef = useRef(false);

  // Apply persisted appearance/board preferences and follow OS theme changes.
  useEffect(() => initSettingsEffects(), []);

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
  const [settingsInitialTab, setSettingsInitialTab] = useState<"board" | "gameplay" | "account">(
    "board",
  );
  const [botStats, setBotStats] = useState<BotStats>(EMPTY_STATS);
  const [resultModal, setResultModal] = useState<{
    open: boolean;
    title: string;
    detail: string;
    reason: string;
  }>({
    open: false,
    title: "",
    detail: "",
    reason: "",
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
      setActiveBotState(id ? (loadBots().find((b) => b.id === id) ?? null) : null);
    };
    refresh();
    const unsub = subscribeBots(refresh);
    refreshFromCloud();
    return unsub;
  }, []);

  const loadBotStats = useCallback(
    async (bot: BotConfig | null) => {
      if (!user || !bot) {
        setBotStats(EMPTY_STATS);
        return;
      }
      const { data, error } = await supabase
        .from("bot_stats")
        .select("wins,losses,draws")
        .eq("user_id", user.id)
        .eq("bot_id", bot.id)
        .maybeSingle();
      if (error) {
        setBotStats(EMPTY_STATS);
        return;
      }
      setBotStats(data ?? EMPTY_STATS);
    },
    [user],
  );

  useEffect(() => {
    loadBotStats(activeBot);
  }, [activeBot, loadBotStats]);

  const requestBotMoveRef = useRef<() => void>(() => {});

  const requestBotMove = useCallback(async () => {
    if (game.isGameOver()) {
      setPending(false);
      return;
    }
    const startedAt = Date.now();
    try {
      const result = await chooseBotMove(game, activeBot, {});
      if (!result) {
        setPending(false);
        return;
      }
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
  }, [game, force, activeBot]);

  useEffect(() => {
    requestBotMoveRef.current = requestBotMove;
  }, [requestBotMove]);

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
    let reason = "Agreement";
    if (game.isStalemate()) reason = "Stalemate";
    else if (game.isThreefoldRepetition()) reason = "Repetition";
    else if (game.isInsufficientMaterial()) reason = "Insufficient Material";
    else if (game.isDraw()) reason = "50-Move Rule";
    if (resignedFlag) reason = "Resignation";
    else if (game.isCheckmate()) reason = "Checkmate";

    if (resignedFlag) {
      userField = "losses";
      botField = "wins";
      title = "Defeat";
      detail = `You resigned — ${activeBotName ?? "the bot"} wins.`;
    } else if (game.isCheckmate()) {
      const loser = game.turn();
      if (loser === playerColor) {
        userField = "losses";
        botField = "wins";
        title = "Defeat";
        detail = `${activeBotName ?? "Bot"} delivered checkmate.`;
      } else {
        userField = "wins";
        botField = "losses";
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
    supabase
      .from("profiles")
      .update(profUpdate)
      .eq("id", user.id)
      .then(({ error }) => {
        if (!error) refreshProfile();
      });

    if (activeBot) {
      const next: BotStats = {
        wins: botStats.wins + (botField === "wins" ? 1 : 0),
        losses: botStats.losses + (botField === "losses" ? 1 : 0),
        draws: botStats.draws + (botField === "draws" ? 1 : 0),
      };
      setBotStats(next);
      supabase
        .from("bot_stats")
        .upsert(
          {
            user_id: user.id,
            bot_id: activeBot.id,
            bot_name: activeBot.name,
            ...next,
          },
          { onConflict: "user_id,bot_id" },
        )
        .then(() => {});
      if (botField === "wins") incrementBotLifetime(activeBot.id, 1, 0);
      else if (botField === "losses") incrementBotLifetime(activeBot.id, 0, 1);

      if (profile) {
        recordFinishedGame({
          profile,
          bot: activeBot,
          playerColor,
          userOutcome: userField === "wins" ? "win" : userField === "losses" ? "loss" : "draw",
          moves: Math.max(1, Math.ceil(history.length / 2)),
        });
      }
    }

    setResultModal({ open: true, title, detail, reason });
    setMatchActive(false);
  }, [
    history.length,
    game,
    user,
    profile,
    refreshProfile,
    activeBot,
    playerColor,
    botStats,
    resignedFlag,
  ]);

  const moveRows = useMemo(() => {
    const rows: Array<{ n: number; w: string; b?: string }> = [];
    for (let i = 0; i < history.length; i += 2) {
      rows.push({ n: i / 2 + 1, w: history[i], b: history[i + 1] });
    }
    return rows;
  }, [history]);

  const ui = useUiSettings();
  useEventTheme();
  const navItems: Array<{
    key: SidebarKey;
    label: string;
    icon: typeof Home;
    onClick?: () => void;
  }> = [
    {
      key: "home",
      label: label(ui, "nav.home"),
      icon: Home,
      onClick: () => {
        setSidebar("home");
        setMode("home");
      },
    },
    {
      key: "play",
      label: label(ui, "nav.playBots"),
      icon: Swords,
      onClick: () => {
        setSidebar("play");
        if (mode !== "match") setMode("hub");
      },
    },
    {
      key: "modes",
      label: label(ui, "nav.gameModes"),
      icon: Bot,
      onClick: () => {
        setSidebar("modes");
        setMode("modes");
      },
    },
    { key: "updates", label: label(ui, "nav.updates"), icon: Bell },
    {
      key: "settings",
      label: label(ui, "nav.settings"),
      icon: Settings,
      onClick: () => {
        setSettingsInitialTab("board");
        setSidebar("settings");
        setMode("settings");
      },
    },
  ];

  return (
    <div className="min-h-screen w-full flex overflow-x-hidden">
      <EventDecor />
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
              item.key === "home"
                ? mode === "home"
                : item.key === "play"
                  ? mode === "hub" || mode === "match"
                  : item.key === "modes"
                    ? mode === "modes"
                    : item.key === "profile"
                      ? mode === "profile"
                      : item.key === "settings"
                        ? mode === "settings"
                        : false;
            const content = (
              <button
                key={idx}
                onClick={item.onClick}
                className={cn(
                  "w-full flex items-center gap-3 px-2 md:px-3 py-2 rounded-md text-left text-sm transition-colors",
                  active
                    ? "bg-primary/15 text-primary font-semibold"
                    : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground",
                )}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="hidden md:inline">{item.label}</span>
              </button>
            );
            if (item.key === "updates") {
              return (
                <div key={idx} className="px-0">
                  <div className="md:hidden grid place-items-center py-1">
                    <UpdateLogButton />
                  </div>
                  <div className="hidden md:block">
                    <UpdateLogButton />
                  </div>
                </div>
              );
            }
            return content;
          })}
        </nav>
        <div className="p-2 border-t border-border space-y-1">
          {isOwner && (
            <Link
              to="/studio"
              className="w-full flex items-center gap-2 px-2 md:px-3 py-2 rounded-md text-xs font-semibold text-warning bg-warning/10 ring-1 ring-warning/30 hover:bg-warning/20"
            >
              ⚡ <span className="hidden md:inline">Studio Mode</span>
            </Link>
          )}
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
        <main className="flex-1 px-3 md:px-6 py-3 md:py-4">
          {mode === "home" && profile && (
            <HomeDashboard
              profile={profile}
              onPlay={() => {
                setSidebar("play");
                setMode("hub");
              }}
              onEditProfile={() => {
                setSettingsInitialTab("account");
                setSidebar("settings");
                setMode("settings");
              }}
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
          {mode === "settings" && <SettingsPage initialTab={settingsInitialTab} />}
          {mode === "modes" && <GameModesHub />}
        </main>
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
          <div className="absolute bottom-8 text-xs text-muted-foreground">
            Click anywhere to skip
          </div>
        </div>
      )}

      <GameOverModal
        open={resultModal.open}
        outcome={
          resultModal.title === "Victory" ? "win" : resultModal.title === "Defeat" ? "loss" : "draw"
        }
        opponentName={activeBotName ?? activeBot?.name ?? "Opponent"}
        opponentAvatar={activeBot?.avatar ?? null}
        reason={resultModal.reason || "Game Over"}
        lines={undefined}
        onClose={() => setResultModal((r) => ({ ...r, open: false }))}
        onRematch={() => {
          setResultModal((r) => ({ ...r, open: false }));
          triggerPlay();
        }}
        onNewGame={() => {
          setResultModal((r) => ({ ...r, open: false }));
          setMode("hub");
        }}
      />

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
            <img
              src={profile.avatar_url}
              alt={profile.username}
              className="w-full h-full object-cover"
            />
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
        Welcome back. Choose <span className="text-foreground">Play Bots</span> from the sidebar to
        enter the hub.
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
  const [immersive] = useImmersive();
  const ident = activeBot ? botDisplayIdentity(activeBot, immersive) : null;
  return (
    <div className="max-w-[1400px] mx-auto grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_420px] gap-6">
      {/* Left: board preview */}
      <div className="min-w-0 mx-auto w-full max-w-[calc(min(78vh,760px)*var(--board-scale,1))]">
        <div className="flex items-center gap-2 mb-2 h-10">
          <div className="w-9 h-9 rounded-sm bg-secondary overflow-hidden grid place-items-center">
            {activeBot?.avatar ? (
              <img src={activeBot.avatar} alt="" className="w-full h-full object-cover" />
            ) : (
              <Bot className="w-4 h-4 text-muted-foreground" />
            )}
          </div>
          <span className="text-sm font-bold inline-flex items-center gap-1.5">
            {ident?.title && <TitleBadge title={ident.title} color={ident.titleColor} size="sm" />}
            {ident?.name ?? "Opponent"}
            {activeBot && (
              <span className="font-normal text-muted-foreground">({activeBot.elo})</span>
            )}
            {activeBot?.country && !immersive && <span>{activeBot.country}</span>}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <BoardScaleControl />
          </div>
        </div>
        <Board
          game={idleGame}
          flipped={flipped}
          disabled
          lastMove={null}
          onAttemptMove={() => false}
        />
        <div className="flex items-center gap-2 mt-2 h-10">
          <div className="w-9 h-9 rounded-sm bg-secondary overflow-hidden grid place-items-center">
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <User className="w-4 h-4 text-muted-foreground" />
            )}
          </div>
          <span className="text-sm font-bold inline-flex items-center gap-1.5">
            {profile?.title_badge && <TitleBadge title={profile.title_badge} size="sm" />}
            {profile?.username ?? "You"}
            {profile && (
              <span className="font-normal text-muted-foreground">({profile.elo_rating})</span>
            )}
          </span>
          <a
            href="https://sites.google.com/view/chess-bot-library"
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1"
          >
            Bot Library <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>

      {/* Right: Play Bots panel */}
      <div className="min-w-0">
        <PlayBotsPanel colorChoice={colorChoice} setColorChoice={setColorChoice} onPlay={onPlay} />
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
  const movesContainerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (movesContainerRef.current) {
      movesContainerRef.current.scrollTop = movesContainerRef.current.scrollHeight;
    }
  }, [moveRows.length]);

  const botInfo = activeBot ? botDisplay(activeBot) : null;

  return (
    <div className="max-w-[1400px] mx-auto grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] gap-4 lg:gap-6 items-start">
      {/* Left Column: Board + Opponent & Player bars */}
      <section className="space-y-1.5 min-w-0">
        {/* Top: Opponent Bar */}
        {activeBot && (
          <div className="bg-card/90 py-1 px-2.5 flex items-center justify-between rounded-lg border border-border/60">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded bg-secondary grid place-items-center overflow-hidden shrink-0 ring-1 ring-border">
                {activeBot.avatar ? (
                  <img
                    src={activeBot.avatar}
                    alt={activeBot.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Bot className="w-4 h-4 text-muted-foreground" />
                )}
              </div>
              <div className="flex items-center gap-1.5 min-w-0">
                <TitleBadge title={botInfo?.title} color={botInfo?.titleColor} size="sm" />
                <span className="text-xs font-semibold truncate">{botInfo?.name}</span>
                <span className="text-[11px] text-muted-foreground font-mono">
                  ({activeBot.elo})
                </span>
                {activeBot.country && <span className="text-xs shrink-0">{activeBot.country}</span>}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {pending && (
                <span className="text-[10px] text-primary animate-pulse font-medium">
                  Thinking…
                </span>
              )}
              <BoardScaleControl />
            </div>
          </div>
        )}

        {/* Board Card */}
        <Card className="p-2 sm:p-3 bg-card min-w-0">
          <div className="flex items-center justify-between mb-1.5 px-0.5">
            <div className="text-xs font-medium truncate text-muted-foreground">
              {gameStatusText}
            </div>
          </div>
          <div className="mx-auto w-full max-w-[calc(min(74vh,640px)*var(--board-scale,1))]">
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

      {/* Right Column: Play Bots Sidebar */}
      <aside className="flex flex-col h-[calc(min(76vh,640px)+80px)] lg:h-[calc(min(80vh,700px))] self-stretch bg-card border border-border/70 rounded-xl p-3 sm:p-4 gap-3 shadow-sm overflow-hidden">
        {/* Top Header: Play Bots */}
        <div className="flex items-center justify-between pb-2 border-b border-border/50">
          <div className="flex items-center gap-2 font-bold text-sm tracking-tight text-foreground">
            <Bot className="w-4 h-4 text-primary" />
            <span>Play Bots</span>
          </div>
          {activeBot && (
            <span className="text-[10px] text-muted-foreground font-mono">
              <span className="text-success font-semibold">{botStats.wins}W</span> ·{" "}
              <span className="text-destructive font-semibold">{botStats.losses}L</span> ·{" "}
              {botStats.draws}D
            </span>
          )}
        </div>

        {/* Bot Dialogue Row: Bot Portrait + Crisp White Bubble matching reference */}
        {activeBot && (
          <div className="flex items-center gap-3 py-1">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl bg-secondary overflow-hidden shrink-0 ring-1 ring-border/80 shadow-sm">
              {activeBot.avatar ? (
                <img
                  src={activeBot.avatar}
                  alt={activeBot.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full grid place-items-center bg-muted">
                  <Bot className="w-7 h-7 text-muted-foreground" />
                </div>
              )}
            </div>
            <BotChatBubble
              active={matchActive && !game.isGameOver() && !resignedFlag}
              lines={activeBot.dialogueLines}
              defaultText={activeBot.quote || activeBot.dialogueLines?.[0] || "Let's play chess!"}
              inline
            />
          </div>
        )}

        {/* Move History / Starting Position Header */}
        <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t border-border/40">
          <span className="font-semibold text-foreground/85 text-[11px] uppercase tracking-wide">
            Move History
          </span>
          {moveRows.length > 0 && (
            <span className="text-[10px] font-mono">
              {moveRows.length} {moveRows.length === 1 ? "turn" : "turns"}
            </span>
          )}
        </div>

        {/* Move list table with auto-scroll */}
        <div
          ref={movesContainerRef}
          className="flex-1 min-h-[140px] overflow-y-auto scroll-thin rounded-lg border border-border/40 bg-background/50 p-1"
        >
          {moveRows.length === 0 ? (
            <div className="text-xs text-muted-foreground/80 px-3 py-6 text-center italic">
              Starting Position. Moves will be recorded here.
            </div>
          ) : (
            <table className="w-full text-xs sm:text-sm">
              <tbody>
                {moveRows.map((r) => (
                  <tr
                    key={r.n}
                    className="odd:bg-secondary/40 hover:bg-secondary/60 rounded transition-colors"
                  >
                    <td className="px-2.5 py-1 text-muted-foreground w-10 text-xs font-mono font-medium">
                      {r.n}.
                    </td>
                    <td className="px-2 py-1 font-mono font-medium">{r.w}</td>
                    <td className="px-2 py-1 font-mono text-muted-foreground">{r.b ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Bottom Action Bar: Red Resign + Flip Board (strictly NO undo or hint button) */}
        <div className="pt-2 border-t border-border/50 flex items-center gap-2">
          <Button
            onClick={onResign}
            variant="destructive"
            disabled={game.isGameOver() || resignedFlag || moveRows.length === 0}
            className="flex-1 font-bold h-10 text-xs shadow-sm bg-red-600 hover:bg-red-700 text-white"
          >
            <Flag className="w-4 h-4 mr-1.5" /> Resign
          </Button>
          <Button
            onClick={onFlip}
            variant="outline"
            size="sm"
            className="h-10 px-3 text-xs shrink-0 font-medium border-border/70 hover:bg-secondary"
            title="Flip Board"
            aria-label="Flip Board"
          >
            <FlipHorizontal2 className="w-4 h-4 mr-1.5" /> Flip
          </Button>
        </div>
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
    <div
      className={cn(
        "flex flex-col items-center gap-3",
        side === "right" ? "text-right" : "text-left",
      )}
    >
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
        {subtitle && (
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">
            {subtitle}
          </div>
        )}
      </div>
    </div>
  );
}
