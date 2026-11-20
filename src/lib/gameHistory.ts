import { loadBots, type BotConfig } from "./botStore";
import { Profile } from "./useAuth";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import type { PrivateBotProfile } from "./privateBotPlayerStore";

export type GameHistoryEntry = {
  id: string;
  userId: string;
  gameType: "bot" | "rapid" | "blitz" | "bullet" | "championship";
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
  scoreWhite: string; // "1", "0", "1/2" (or legacy "½")
  scoreBlack: string; // "1", "0", "1/2" (or legacy "½")
  userOutcome: "win" | "loss" | "draw";
  moves: number;
  date: string;
  bookmarked?: boolean;
  pgn?: string;
  finalFen?: string;
  terminationReason?: string;
  isRecovered?: boolean;
};

const STORAGE_KEY_PREFIX = "chess_game_history_";
const PRIVATE_BOT_LOCAL_KEY = "botboard_private_bot_player_profiles";

export function getGameHistory(userId: string): GameHistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PREFIX + userId);
    if (!raw) return [];
    const parsed: GameHistoryEntry[] = JSON.parse(raw);
    return parsed.filter((g) => !g.id.startsWith("seed_"));
  } catch {
    return [];
  }
}

export function saveGameHistory(userId: string, history: GameHistoryEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_PREFIX + userId, JSON.stringify(history.slice(0, 200)));
  } catch {
    // ignore
  }
}

/**
 * Fetch active cloud games for a user.
 */
export async function fetchUserGamesCloud(userId: string): Promise<GameHistoryEntry[]> {
  let cloudGames: GameHistoryEntry[] = [];
  try {
    const { data, error } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", `user_games_${userId}`)
      .maybeSingle();

    if (!error && data?.value && Array.isArray(data.value)) {
      cloudGames = (data.value as unknown as GameHistoryEntry[]).filter(
        (g) => g && typeof g.id === "string" && !g.id.startsWith("seed_"),
      );
    }
  } catch (err) {
    console.error("[gameHistory] Error loading user games from backend:", err);
  }

  const localGames = getGameHistory(userId);
  if (localGames.length === 0) return cloudGames;
  if (cloudGames.length === 0) return localGames;

  const seen = new Set(cloudGames.map((g) => g.id));
  const merged = [...cloudGames];
  for (const lg of localGames) {
    if (!seen.has(lg.id)) {
      merged.push(lg);
      seen.add(lg.id);
    }
  }
  return merged;
}

/**
 * Sync active game history to backend storage.
 */
export async function syncUserGamesCloud(userId: string, games: GameHistoryEntry[]): Promise<void> {
  try {
    await supabase.from("app_settings").upsert({
      key: `user_games_${userId}`,
      value: games.slice(0, 200) as unknown as Json,
      updated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[gameHistory] Failed to sync games to backend:", err);
  }
}

/**
 * Append-only update to the permanent cloud archive (`permanent_user_games_<userId>`).
 * Preserves all historical games even if local storage was cleared or reset.
 */
async function appendToPermanentArchive(
  userId: string,
  newEntries: GameHistoryEntry[],
): Promise<void> {
  if (newEntries.length === 0) return;
  try {
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", `permanent_user_games_${userId}`)
      .maybeSingle();

    const existing =
      data?.value && Array.isArray(data.value) ? (data.value as unknown as GameHistoryEntry[]) : [];

    const byId = new Map<string, GameHistoryEntry>();
    for (const g of newEntries) {
      if (g?.id && !g.id.startsWith("seed_")) byId.set(g.id, g);
    }
    for (const g of existing) {
      if (g?.id && !g.id.startsWith("seed_") && !byId.has(g.id)) {
        byId.set(g.id, g);
      }
    }

    await supabase.from("app_settings").upsert({
      key: `permanent_user_games_${userId}`,
      value: Array.from(byId.values()) as unknown as Json,
      updated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[gameHistory] Failed to append to permanent archive:", err);
  }
}

/**
 * Deep harvester that recovers ALL games across resets, session changes,
 * local storage keys, private bot profiles, and backend bot_stats lifetime records.
 */
export async function harvestAllHistoricalGames(
  userId: string,
  username: string,
): Promise<GameHistoryEntry[]> {
  const gamesMap = new Map<string, GameHistoryEntry>();
  const lowerUsername = username.trim().toLowerCase();

  const registerGame = (g: GameHistoryEntry | null | undefined) => {
    if (!g || (typeof g.id === "string" && g.id.startsWith("seed_"))) return;
    const dedupKey =
      g.id ||
      `${g.date || ""}_${g.white?.name || ""}_${g.black?.name || ""}_${g.moves || ""}_${g.userOutcome || ""}_${g.pgn || ""}`;
    if (!gamesMap.has(dedupKey)) {
      gamesMap.set(dedupKey, g);
    } else {
      // Prefer version that includes PGN if the existing entry does not
      const prev = gamesMap.get(dedupKey)!;
      if (!prev.pgn && g.pgn) {
        gamesMap.set(dedupKey, g);
      }
    }
  };

  // 1. Check local storage for current user ID
  getGameHistory(userId).forEach(registerGame);

  // 2. Scan ALL localStorage keys for legacy games, guest sessions, or pre-reset games
  try {
    if (typeof window !== "undefined") {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(STORAGE_KEY_PREFIX)) {
          try {
            const raw = localStorage.getItem(k);
            if (raw) {
              const list = JSON.parse(raw) as GameHistoryEntry[];
              if (Array.isArray(list)) {
                list.forEach((gm) => {
                  if (
                    gm &&
                    (gm.userId === userId ||
                      (lowerUsername &&
                        (gm.white?.name?.toLowerCase() === lowerUsername ||
                          gm.black?.name?.toLowerCase() === lowerUsername)))
                  ) {
                    registerGame(gm);
                  }
                });
              }
            }
          } catch {
            // ignore malformed localStorage key
          }
        }
      }
    }
  } catch {
    // ignore storage access errors
  }

  // 3. Scan botboard_private_bot_player_profiles for any sparring matches involving the user
  try {
    if (typeof window !== "undefined") {
      const rawProfiles = localStorage.getItem(PRIVATE_BOT_LOCAL_KEY);
      if (rawProfiles) {
        const parsed = JSON.parse(rawProfiles) as Record<string, PrivateBotProfile>;
        if (parsed && typeof parsed === "object") {
          for (const botProf of Object.values(parsed)) {
            if (!botProf || !Array.isArray(botProf.history)) continue;
            const matchesUser = lowerUsername && botProf.name?.toLowerCase() === lowerUsername;
            if (!matchesUser) continue;

            for (const rec of botProf.history) {
              const isWhite = rec.color === "w";
              const scoreUser = rec.result === "win" ? "1" : rec.result === "loss" ? "0" : "1/2";
              const scoreOpp = rec.result === "win" ? "0" : rec.result === "loss" ? "1" : "1/2";
              const dateStr = rec.timestamp
                ? new Date(rec.timestamp).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })
                : "Archived Match";

              registerGame({
                id: `priv_${rec.id}`,
                userId,
                gameType: "bot",
                white: isWhite
                  ? {
                      name: botProf.name,
                      elo: rec.oldRating || botProf.currentRating,
                      isUser: true,
                    }
                  : {
                      name: rec.opponentName,
                      avatar: rec.opponentAvatar,
                      elo: 1500,
                      isUser: false,
                    },
                black: isWhite
                  ? {
                      name: rec.opponentName,
                      avatar: rec.opponentAvatar,
                      elo: 1500,
                      isUser: false,
                    }
                  : {
                      name: botProf.name,
                      elo: rec.oldRating || botProf.currentRating,
                      isUser: true,
                    },
                scoreWhite: isWhite ? scoreUser : scoreOpp,
                scoreBlack: isWhite ? scoreOpp : scoreUser,
                userOutcome: rec.result,
                moves: Math.max(1, Math.ceil((rec.movesCount || 20) / 2)),
                date: dateStr,
                pgn: rec.pgn,
                terminationReason: rec.reason || "Private Bot Arena",
                isRecovered: true,
              });
            }
          }
        }
      }
    }
  } catch {
    // ignore
  }

  // 4. Fetch from Permanent Cloud Archive in app_settings
  try {
    const { data: permData } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", `permanent_user_games_${userId}`)
      .maybeSingle();

    if (permData?.value && Array.isArray(permData.value)) {
      (permData.value as unknown as GameHistoryEntry[]).forEach(registerGame);
    }
  } catch {
    // ignore
  }

  // 5. Fetch from active cloud games key
  try {
    const { data: actData } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", `user_games_${userId}`)
      .maybeSingle();

    if (actData?.value && Array.isArray(actData.value)) {
      (actData.value as unknown as GameHistoryEntry[]).forEach(registerGame);
    }
  } catch {
    // ignore
  }

  // 6. Scan bot_stats in Supabase to recover any games lost to resets
  try {
    const { data: botStats } = await supabase
      .from("bot_stats")
      .select("bot_id, bot_name, wins, losses, draws, updated_at")
      .eq("user_id", userId);

    if (botStats && botStats.length > 0) {
      const allBots = loadBots();
      for (const stat of botStats) {
        const botDef = allBots.find((b) => b.id === stat.bot_id || b.name === stat.bot_name);
        const botName = stat.bot_name || botDef?.name || "Chess Bot";
        const botElo = botDef?.elo ?? 1500;

        // Count how many games vs this bot already exist in our harvested map
        const existingVsBot = Array.from(gamesMap.values()).filter(
          (g) =>
            g.white?.name?.toLowerCase() === botName.toLowerCase() ||
            g.black?.name?.toLowerCase() === botName.toLowerCase(),
        );

        const existingUserWins = existingVsBot.filter((g) => g.userOutcome === "win").length;
        const existingUserLosses = existingVsBot.filter((g) => g.userOutcome === "loss").length;
        const existingUserDraws = existingVsBot.filter((g) => g.userOutcome === "draw").length;

        // Note: in bot_stats, `losses` = bot's losses = user's wins; `wins` = bot's wins = user's losses
        const missingWins = Math.max(0, (stat.losses || 0) - existingUserWins);
        const missingLosses = Math.max(0, (stat.wins || 0) - existingUserLosses);
        const missingDraws = Math.max(0, (stat.draws || 0) - existingUserDraws);
        const totalRecordedInStats = (stat.wins || 0) + (stat.losses || 0) + (stat.draws || 0);
        const missingCount = Math.max(0, totalRecordedInStats - existingVsBot.length);

        if (missingCount > 0) {
          const statDate = stat.updated_at
            ? new Date(stat.updated_at).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
              })
            : "Archived Match";

          for (let m = 0; m < missingCount; m++) {
            const outcome: "win" | "loss" | "draw" =
              m < missingWins ? "win" : m < missingWins + missingLosses ? "loss" : "draw";
            const scoreUser = outcome === "win" ? "1" : outcome === "loss" ? "0" : "1/2";
            const scoreBot = outcome === "win" ? "0" : outcome === "loss" ? "1" : "1/2";
            const idx = existingVsBot.length + m;

            const recGame: GameHistoryEntry = {
              id: `recovered_${stat.bot_id}_${idx}_${outcome}`,
              userId,
              gameType: "bot",
              white: {
                name: username,
                elo: 1500,
                isUser: true,
              },
              black: {
                name: botName,
                elo: botElo,
                isUser: false,
              },
              scoreWhite: scoreUser,
              scoreBlack: scoreBot,
              userOutcome: outcome,
              moves: 20 + (m % 15),
              date: statDate,
              isRecovered: true,
              terminationReason: "Archived bot match recovered from lifetime records",
            };
            registerGame(recGame);
          }
        }
      }
    }
  } catch (err) {
    console.error("[gameHistory] Error recovering bot stats:", err);
  }

  const allHarvested = Array.from(gamesMap.values()).sort((a, b) => {
    const ta = new Date(a.date).getTime();
    const tb = new Date(b.date).getTime();
    const safeA = Number.isNaN(ta) ? 0 : ta;
    const safeB = Number.isNaN(tb) ? 0 : tb;
    if (safeB !== safeA) return safeB - safeA;
    // Keep real games above synthesized recovered entries on same date
    return (a.isRecovered ? 1 : 0) - (b.isRecovered ? 1 : 0);
  });

  // Persist unified ledger to permanent cloud archive so it is never lost
  if (allHarvested.length > 0) {
    void supabase
      .from("app_settings")
      .upsert({
        key: `permanent_user_games_${userId}`,
        value: allHarvested as unknown as Json,
        updated_at: new Date().toISOString(),
      })
      .then(() => {});
  }

  return allHarvested;
}

/**
 * Build standard PGN text with official Seven Tag Roster headers.
 */
export function formatStandardPgn(game: GameHistoryEntry): string {
  if (game.pgn && game.pgn.includes("[Event")) {
    return game.pgn.trim();
  }

  const parsedDate = game.date ? new Date(game.date) : new Date();
  const safeDate = Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate;
  const dateStr = safeDate.toISOString().slice(0, 10).replace(/-/g, ".");

  const resultStr = game.scoreWhite === "1" ? "1-0" : game.scoreWhite === "0" ? "0-1" : "1/2-1/2";

  const opponentName = game.white.isUser ? game.black.name : game.white.name;
  const eventName = `BotBoard Match vs ${opponentName}`;
  const rawMoves = game.pgn?.replace(/\[.*?\]\s*/g, "").trim() || "";
  const cleanedMoves = rawMoves.replace(/\s*(1-0|0-1|1\/2-1\/2|\*)\s*$/, "").trim();
  const movesText = cleanedMoves || (game.isRecovered ? "{ Historical game moves archived }" : "*");

  return [
    `[Event "${eventName}"]`,
    `[Site "BotBoard"]`,
    `[Date "${dateStr}"]`,
    `[Round "1"]`,
    `[White "${game.white.name}"]`,
    `[Black "${game.black.name}"]`,
    `[Result "${resultStr}"]`,
    `[WhiteElo "${game.white.elo}"]`,
    `[BlackElo "${game.black.elo}"]`,
    game.timeControl ? `[TimeControl "${game.timeControl}"]` : null,
    game.terminationReason ? `[Termination "${game.terminationReason}"]` : null,
    "",
    `${movesText} ${resultStr}`,
    "",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

/**
 * Compiles every single game into one multi-game PGN file and triggers download.
 */
export function downloadAllUserPgns(username: string, games: GameHistoryEntry[]): void {
  if (!games || games.length === 0) return;

  const fullPgnBundle = games.map((g) => formatStandardPgn(g)).join("\n\n");

  const cleanName = username.replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase() || "player";
  const fileName = `${cleanName}_all_historical_games_${new Date().toISOString().slice(0, 10)}.pgn`;

  const blob = new Blob([fullPgnBundle], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function recordFinishedGame({
  profile,
  bot,
  playerColor,
  userOutcome,
  moves,
  pgn,
  finalFen,
  terminationReason,
  gameType = "bot",
}: {
  profile: Profile;
  bot: BotConfig;
  playerColor: "w" | "b";
  userOutcome: "win" | "loss" | "draw";
  moves: number;
  pgn?: string;
  finalFen?: string;
  terminationReason?: string;
  gameType?: GameHistoryEntry["gameType"];
}): GameHistoryEntry {
  const existing = getGameHistory(profile.id);

  const isUserWhite = playerColor === "w";
  const scoreUser = userOutcome === "win" ? "1" : userOutcome === "loss" ? "0" : "1/2";
  const scoreBot = userOutcome === "win" ? "0" : userOutcome === "loss" ? "1" : "1/2";

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
    gameType,
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
    pgn,
    finalFen,
    terminationReason,
  };

  const updated = [newEntry, ...existing];
  saveGameHistory(profile.id, updated);
  void syncUserGamesCloud(profile.id, updated);
  // Append to permanent cloud archive so it survives resets and truncation caps
  void appendToPermanentArchive(profile.id, [newEntry]);

  return newEntry;
}

export function toggleGameBookmark(userId: string, gameId: string): GameHistoryEntry[] {
  const list = getGameHistory(userId);
  const updated = list.map((g) => (g.id === gameId ? { ...g, bookmarked: !g.bookmarked } : g));
  saveGameHistory(userId, updated);
  void syncUserGamesCloud(userId, updated);
  return updated;
}

export function clearGameHistory(userId: string): void {
  // Only clears current session view; permanent cloud archive is preserved for the owner
  try {
    localStorage.removeItem(STORAGE_KEY_PREFIX + userId);
  } catch {
    // ignore
  }
}

export function getInitialOrSeedHistory(profile: Profile): GameHistoryEntry[] {
  // Returns real game history only, starting at zero
  return getGameHistory(profile.id);
}
