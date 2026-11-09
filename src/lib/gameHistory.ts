import { BotConfig } from "./botStore";
import { Profile } from "./useAuth";

export type GameHistoryEntry = {
  id: string;
  userId: string;
  gameType: "bot" | "rapid" | "blitz";
  timeControl?: string;
  white: {
    name: string;
    avatar?: string | null;
    elo: number;
    title?: string | null;
    titleColor?: string | null;
    country?: string | null;
    isUser: boolean;
  };
  black: {
    name: string;
    avatar?: string | null;
    elo: number;
    title?: string | null;
    titleColor?: string | null;
    country?: string | null;
    isUser: boolean;
  };
  scoreWhite: string; // "1", "0", "½"
  scoreBlack: string; // "1", "0", "½"
  userOutcome: "win" | "loss" | "draw";
  moves: number;
  date: string;
  bookmarked?: boolean;
};

const STORAGE_KEY_PREFIX = "chess_game_history_";

export function getGameHistory(userId: string): GameHistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PREFIX + userId);
    if (!raw) return [];
    const parsed: GameHistoryEntry[] = JSON.parse(raw);
    // Exclude any legacy seed entries so game history restarts cleanly at zero
    return parsed.filter((g) => !g.id.startsWith("seed_"));
  } catch {
    return [];
  }
}

export function saveGameHistory(userId: string, history: GameHistoryEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_PREFIX + userId, JSON.stringify(history.slice(0, 50)));
  } catch {
    // ignore
  }
}

export function clearGameHistory(userId: string): void {
  try {
    localStorage.removeItem(STORAGE_KEY_PREFIX + userId);
  } catch {
    // ignore
  }
}

export function recordFinishedGame({
  profile,
  bot,
  playerColor,
  userOutcome,
  moves,
}: {
  profile: Profile;
  bot: BotConfig;
  playerColor: "w" | "b";
  userOutcome: "win" | "loss" | "draw";
  moves: number;
}): GameHistoryEntry {
  const existing = getGameHistory(profile.id);

  const isUserWhite = playerColor === "w";
  const scoreUser = userOutcome === "win" ? "1" : userOutcome === "loss" ? "0" : "½";
  const scoreBot = userOutcome === "win" ? "0" : userOutcome === "loss" ? "1" : "½";

  const userSide = {
    name: profile.username,
    avatar: profile.avatar_url,
    elo: profile.elo_rating,
    title: profile.title_badge,
    country: profile.country,
    isUser: true,
  };

  const botSide = {
    name: bot.name,
    avatar: bot.avatar,
    elo: bot.elo,
    title: bot.title,
    titleColor: bot.titleColor,
    country: bot.country,
    isUser: false,
  };

  const newEntry: GameHistoryEntry = {
    id: "game_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7),
    userId: profile.id,
    gameType: "bot",
    timeControl: undefined,
    white: isUserWhite ? userSide : botSide,
    black: isUserWhite ? botSide : userSide,
    scoreWhite: isUserWhite ? scoreUser : scoreBot,
    scoreBlack: isUserWhite ? scoreBot : scoreUser,
    userOutcome,
    moves: Math.max(1, moves),
    date: new Date().toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    }),
    bookmarked: false,
  };

  const updated = [newEntry, ...existing];
  saveGameHistory(profile.id, updated);
  return newEntry;
}

export function toggleGameBookmark(userId: string, gameId: string): GameHistoryEntry[] {
  const list = getGameHistory(userId);
  const updated = list.map((g) => (g.id === gameId ? { ...g, bookmarked: !g.bookmarked } : g));
  saveGameHistory(userId, updated);
  return updated;
}

export function getInitialOrSeedHistory(profile: Profile): GameHistoryEntry[] {
  // Returns real game history only, starting at zero
  return getGameHistory(profile.id);
}
