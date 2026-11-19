import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { glicko2 } from "./glicko2";
import type { BotConfig } from "./botStore";

export interface PrivateGameRecord {
  id: string;
  timestamp: number;
  botId: string;
  opponentBotId: string;
  opponentName: string;
  opponentAvatar?: string | null;
  color: "w" | "b";
  result: "win" | "loss" | "draw";
  reason?: string;
  oldRating: number;
  newRating: number;
  delta: number;
  movesCount: number;
  pgn: string;
}

export interface PrivateBotProfile {
  botId: string;
  name: string;
  avatar: string;
  title?: string | null;
  titleColor?: string | null;
  country?: string | null;
  publicRating: number;
  currentRating: number;
  peakRating: number;
  rd: number;
  volatility: number;
  gamesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  history: PrivateGameRecord[];
}

const SETTING_KEY = "private_bot_player_profiles";
const LOCAL_STORAGE_KEY = "botboard_private_bot_player_profiles";

function makeInitialProfile(b: BotConfig): PrivateBotProfile {
  return {
    botId: b.id,
    name: b.name,
    avatar: b.avatar || "",
    title: b.title ?? null,
    titleColor: b.titleColor ?? null,
    country: b.country ?? null,
    publicRating: b.elo,
    currentRating: b.elo,
    peakRating: b.elo,
    rd: 200,
    volatility: 0.06,
    gamesPlayed: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    history: [],
  };
}

export async function fetchPrivateBotProfiles(
  allBots: BotConfig[],
): Promise<Record<string, PrivateBotProfile>> {
  let savedProfiles: Record<string, PrivateBotProfile> = {};

  try {
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", SETTING_KEY)
      .maybeSingle();

    if (data?.value && typeof data.value === "object" && !Array.isArray(data.value)) {
      savedProfiles = data.value as unknown as Record<string, PrivateBotProfile>;
    } else if (typeof window !== "undefined") {
      const cached = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (cached) savedProfiles = JSON.parse(cached) as Record<string, PrivateBotProfile>;
    }
  } catch {
    if (typeof window !== "undefined") {
      try {
        const cached = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (cached) savedProfiles = JSON.parse(cached) as Record<string, PrivateBotProfile>;
      } catch {
        // ignore storage parse failure
      }
    }
  }

  // Initialize profiles for any newly created bots & sync display metadata
  const merged: Record<string, PrivateBotProfile> = { ...savedProfiles };
  for (const b of allBots) {
    if (!merged[b.id]) {
      merged[b.id] = makeInitialProfile(b);
    } else {
      merged[b.id] = {
        ...merged[b.id],
        name: b.name,
        avatar: b.avatar || "",
        title: b.title ?? null,
        titleColor: b.titleColor ?? null,
        country: b.country ?? null,
        publicRating: b.elo,
      };
    }
  }

  return merged;
}

export async function savePrivateBotProfiles(
  profiles: Record<string, PrivateBotProfile>,
): Promise<void> {
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(profiles));
    } catch {
      // ignore storage quota errors
    }
  }
  try {
    await supabase.from("app_settings").upsert({
      key: SETTING_KEY,
      value: profiles as unknown as Json,
      updated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[privateBotPlayerStore] Save error:", err);
  }
}

export async function resetPrivateBotProfiles(
  allBots: BotConfig[],
): Promise<Record<string, PrivateBotProfile>> {
  const fresh: Record<string, PrivateBotProfile> = {};
  for (const b of allBots) {
    fresh[b.id] = makeInitialProfile(b);
  }
  await savePrivateBotProfiles(fresh);
  return fresh;
}

export function recordPrivateGame(
  profiles: Record<string, PrivateBotProfile>,
  userBotId: string,
  oppBotId: string,
  userColor: "w" | "b",
  result: "win" | "loss" | "draw",
  movesCount: number,
  pgn: string,
  reason?: string,
): {
  updatedProfiles: Record<string, PrivateBotProfile>;
  userOldRating: number;
  userNewRating: number;
  userDelta: number;
  oppOldRating: number;
  oppNewRating: number;
  oppDelta: number;
} {
  const userProfile = profiles[userBotId];
  const oppProfile = profiles[oppBotId];
  if (!userProfile || !oppProfile) {
    return {
      updatedProfiles: profiles,
      userOldRating: 1500,
      userNewRating: 1500,
      userDelta: 0,
      oppOldRating: 1500,
      oppNewRating: 1500,
      oppDelta: 0,
    };
  }

  const scoreUser = result === "win" ? 1 : result === "loss" ? 0 : 0.5;
  const scoreOpp = 1 - scoreUser;

  const newUserGlicko = glicko2(
    [{ oppRating: oppProfile.currentRating, oppRd: oppProfile.rd, score: scoreUser }],
    {
      rating: userProfile.currentRating,
      rd: userProfile.rd,
      volatility: userProfile.volatility,
    },
  );

  const newOppGlicko = glicko2(
    [{ oppRating: userProfile.currentRating, oppRd: userProfile.rd, score: scoreOpp }],
    {
      rating: oppProfile.currentRating,
      rd: oppProfile.rd,
      volatility: oppProfile.volatility,
    },
  );

  const userDelta = newUserGlicko.rating - userProfile.currentRating;
  const oppDelta = newOppGlicko.rating - oppProfile.currentRating;
  const timestamp = Date.now();
  const gameIdBase = `${timestamp}_${Math.random().toString(36).slice(2, 7)}`;

  const updated: Record<string, PrivateBotProfile> = {
    ...profiles,
    [userBotId]: {
      ...userProfile,
      currentRating: newUserGlicko.rating,
      peakRating: Math.max(userProfile.peakRating, newUserGlicko.rating),
      rd: newUserGlicko.rd,
      volatility: newUserGlicko.volatility,
      gamesPlayed: userProfile.gamesPlayed + 1,
      wins: userProfile.wins + (result === "win" ? 1 : 0),
      losses: userProfile.losses + (result === "loss" ? 1 : 0),
      draws: userProfile.draws + (result === "draw" ? 1 : 0),
      history: [
        {
          id: `${gameIdBase}_u`,
          timestamp,
          botId: userBotId,
          opponentBotId: oppBotId,
          opponentName: oppProfile.name,
          opponentAvatar: oppProfile.avatar,
          color: userColor,
          result,
          reason,
          oldRating: userProfile.currentRating,
          newRating: newUserGlicko.rating,
          delta: userDelta,
          movesCount,
          pgn,
        },
        ...userProfile.history.slice(0, 49),
      ],
    },
    [oppBotId]: {
      ...oppProfile,
      currentRating: newOppGlicko.rating,
      peakRating: Math.max(oppProfile.peakRating, newOppGlicko.rating),
      rd: newOppGlicko.rd,
      volatility: newOppGlicko.volatility,
      gamesPlayed: oppProfile.gamesPlayed + 1,
      wins: oppProfile.wins + (result === "loss" ? 1 : 0),
      losses: oppProfile.losses + (result === "win" ? 1 : 0),
      draws: oppProfile.draws + (result === "draw" ? 1 : 0),
      history: [
        {
          id: `${gameIdBase}_o`,
          timestamp,
          botId: oppBotId,
          opponentBotId: userBotId,
          opponentName: userProfile.name,
          opponentAvatar: userProfile.avatar,
          color: userColor === "w" ? "b" : "w",
          result: result === "win" ? "loss" : result === "loss" ? "win" : "draw",
          reason,
          oldRating: oppProfile.currentRating,
          newRating: newOppGlicko.rating,
          delta: oppDelta,
          movesCount,
          pgn,
        },
        ...oppProfile.history.slice(0, 49),
      ],
    },
  };

  void savePrivateBotProfiles(updated);

  return {
    updatedProfiles: updated,
    userOldRating: userProfile.currentRating,
    userNewRating: newUserGlicko.rating,
    userDelta,
    oppOldRating: oppProfile.currentRating,
    oppNewRating: newOppGlicko.rating,
    oppDelta,
  };
}
