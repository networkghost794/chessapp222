import { Chess } from "chess.js";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { chooseBotMove, loadBots, type BotConfig } from "@/lib/botStore";

export type StageType = "qualification" | "candidates" | "match" | "completed";
export type QualFormat = "round_robin" | "double_round_robin" | "swiss" | "knockout";

export type MatchStatus = "upcoming" | "live" | "completed" | "postponed" | "cancelled";

export interface ScheduledGame {
  id: string;
  gameNumber: number;
  stage: StageType;
  whiteBotId: string;
  blackBotId: string;
  result?: "1-0" | "0-1" | "1/2-1/2" | "*";
  status: MatchStatus;
  scheduledTime?: string;
  pgn?: string;
  moveHistory?: string[];
  eco?: string;
  openingName?: string;
  round?: number;
}

export interface StandingRow {
  botId: string;
  botName: string;
  avatarUrl?: string;
  rating: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  points: number;
  qualified?: boolean;
}

export interface ChampionshipCycle {
  id: string;
  name: string; // e.g. "BotBoard World Championship 2026"
  season: string; // e.g. "Spring 2026"
  createdAt: string;
  stage: StageType;
  isPaused: boolean;

  // Reigning Champion going into this cycle
  reigningChampionId: string;

  // Stage 1: Qualification
  qualification: {
    format: QualFormat;
    botIds: string[];
    qualifySlots: number; // default 8
    games: ScheduledGame[];
    standings: StandingRow[];
    isCompleted: boolean;
  };

  // Stage 2: Candidates
  candidates: {
    botIds: string[]; // typically 8 bots
    games: ScheduledGame[];
    standings: StandingRow[];
    winnerBotId?: string;
    isCompleted: boolean;
  };

  // Stage 3: Championship Match
  match: {
    championId: string;
    challengerId: string;
    totalGames: number; // default 14
    championScore: number;
    challengerScore: number;
    targetScore: number; // e.g. 7.5 to clinch
    games: ScheduledGame[];
    currentGameIndex: number;
    tiebreaksRequired: boolean;
    tiebreakGames?: ScheduledGame[];
    winnerId?: string;
    isCompleted: boolean;
  };
}

export interface HallOfFameRecord {
  cycleId: string;
  cycleName: string;
  year: string;
  championId: string;
  championName: string;
  championAvatar?: string;
  challengerId: string;
  challengerName: string;
  challengerAvatar?: string;
  finalScore: string; // e.g. "7.5 - 5.5"
  gamesPlayed: number;
  dateConcluded: string;
  defensesCount: number;
}

export interface ReigningChampion {
  botId: string;
  botName: string;
  rating: number;
  avatarUrl?: string;
  reignSince: string;
  defensesCount: number;
  titlesWon: number;
}

const STORAGE_KEY_CYCLE = "championship_active_cycle";
const STORAGE_KEY_HALL = "championship_hall_of_fame";
const STORAGE_KEY_CHAMP = "championship_reigning";

// Default / Initial State
const DEFAULT_REIGNING_CHAMPION: ReigningChampion = {
  botId: "the-grandmaster",
  botName: "The Grandmaster",
  rating: 3200,
  avatarUrl: "/avatars/grandmaster.png",
  reignSince: "2026-01-01",
  defensesCount: 2,
  titlesWon: 3,
};

let activeCycleCache: ChampionshipCycle | null = null;
let hallCache: HallOfFameRecord[] = [];
let reigningCache: ReigningChampion = DEFAULT_REIGNING_CHAMPION;
let fetchPromise: Promise<{
  activeCycle: ChampionshipCycle | null;
  hall: HallOfFameRecord[];
  reigning: ReigningChampion;
}> | null = null;

// Listeners
const listeners = new Set<() => void>();
function notify() {
  listeners.forEach((fn) => fn());
}

export function subscribeChampionship(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export async function fetchChampionshipData() {
  if (fetchPromise) return fetchPromise;
  fetchPromise = (async () => {
    try {
      const { data } = await supabase
        .from("app_settings")
        .select("key, value")
        .in("key", [STORAGE_KEY_CYCLE, STORAGE_KEY_HALL, STORAGE_KEY_CHAMP]);

      if (data) {
        data.forEach((row) => {
          if (row.key === STORAGE_KEY_CYCLE) {
            activeCycleCache = (row.value as unknown as ChampionshipCycle) ?? null;
          } else if (row.key === STORAGE_KEY_HALL && Array.isArray(row.value)) {
            hallCache = row.value as unknown as HallOfFameRecord[];
          } else if (row.key === STORAGE_KEY_CHAMP && row.value) {
            reigningCache = row.value as unknown as ReigningChampion;
          }
        });
      }
    } catch (err) {
      console.error("Failed to load championship data from cloud:", err);
    } finally {
      fetchPromise = null;
    }
    notify();
    return { activeCycle: activeCycleCache, hall: hallCache, reigning: reigningCache };
  })();
  return fetchPromise;
}

export async function saveActiveCycle(cycle: ChampionshipCycle | null) {
  activeCycleCache = cycle;
  notify();
  try {
    await supabase.from("app_settings").upsert({
      key: STORAGE_KEY_CYCLE,
      value: cycle as unknown as Json,
      updated_at: new Date().toISOString(),
    });
  } catch (e) {
    console.error("Failed to persist cycle:", e);
  }
}

export async function saveReigningChampion(champ: ReigningChampion) {
  reigningCache = champ;
  notify();
  try {
    await supabase.from("app_settings").upsert({
      key: STORAGE_KEY_CHAMP,
      value: champ as unknown as Json,
      updated_at: new Date().toISOString(),
    });
  } catch (e) {
    console.error("Failed to save reigning champion:", e);
  }
}

export async function saveHallOfFame(hall: HallOfFameRecord[]) {
  hallCache = hall;
  notify();
  try {
    await supabase.from("app_settings").upsert({
      key: STORAGE_KEY_HALL,
      value: hall as unknown as Json,
      updated_at: new Date().toISOString(),
    });
  } catch (e) {
    console.error("Failed to save hall of fame:", e);
  }
}

export function getActiveCycle(): ChampionshipCycle | null {
  return activeCycleCache;
}

export function getHallOfFame(): HallOfFameRecord[] {
  return hallCache;
}

export function getReigningChampion(): ReigningChampion {
  return reigningCache;
}

/** Generate a single round-robin pairings list (balanced colors) */
export function generateSingleRoundRobin(botIds: string[], stage: StageType): ScheduledGame[] {
  const games: ScheduledGame[] = [];
  let idCount = 1;
  for (let i = 0; i < botIds.length; i++) {
    for (let j = i + 1; j < botIds.length; j++) {
      const flip = (i + j) % 2 === 1;
      games.push({
        id: `game-${stage}-${idCount}`,
        gameNumber: idCount++,
        stage,
        whiteBotId: flip ? botIds[j] : botIds[i],
        blackBotId: flip ? botIds[i] : botIds[j],
        status: "upcoming",
      });
    }
  }
  return games;
}

/** Generate a double round-robin pairings list */
export function generateDoubleRoundRobin(botIds: string[], stage: StageType): ScheduledGame[] {
  const games: ScheduledGame[] = [];
  let idCount = 1;

  for (let i = 0; i < botIds.length; i++) {
    for (let j = 0; j < botIds.length; j++) {
      if (i === j) continue;
      games.push({
        id: `game-${stage}-${idCount}`,
        gameNumber: idCount++,
        stage,
        whiteBotId: botIds[i],
        blackBotId: botIds[j],
        status: "upcoming",
      });
    }
  }
  return games;
}

/** Generate initial pairings for Qualification stage based on selected format */
export function generateQualificationGames(
  botIds: string[],
  format: QualFormat,
  stage: StageType = "qualification",
): ScheduledGame[] {
  if (format === "double_round_robin") {
    return generateDoubleRoundRobin(botIds, stage);
  }
  if (format === "round_robin") {
    return generateSingleRoundRobin(botIds, stage);
  }
  const bots = loadBots();
  const sorted = [...botIds].sort((a, b) => {
    const ba = bots.find((x) => x.id === a)?.elo ?? 1500;
    const bb = bots.find((x) => x.id === b)?.elo ?? 1500;
    return bb - ba;
  });

  if (format === "knockout") {
    const games: ScheduledGame[] = [];
    const count = Math.floor(sorted.length / 2);
    for (let i = 0; i < count; i++) {
      const high = sorted[i];
      const low = sorted[sorted.length - 1 - i];
      games.push({
        id: `game-${stage}-r1-${i + 1}`,
        gameNumber: i + 1,
        round: 1,
        stage,
        whiteBotId: i % 2 === 0 ? high : low,
        blackBotId: i % 2 === 0 ? low : high,
        status: "upcoming",
      });
    }
    return games;
  }

  // Swiss: seed top half vs bottom half across initial 3 rounds (can be supplemented or played directly)
  const games: ScheduledGame[] = [];
  const rounds = Math.min(5, Math.max(2, sorted.length - 1));
  let idCount = 1;
  for (let r = 0; r < rounds; r++) {
    const rotated = [...sorted];
    if (r > 0 && rotated.length > 2) {
      const fixed = rotated[0];
      const rest = rotated.slice(1);
      for (let k = 0; k < r; k++) {
        rest.unshift(rest.pop()!);
      }
      rotated.splice(0, rotated.length, fixed, ...rest);
    }
    const half = Math.floor(rotated.length / 2);
    for (let i = 0; i < half; i++) {
      const a = rotated[i];
      const b = rotated[rotated.length - 1 - i];
      const flip = (r + i) % 2 === 1;
      games.push({
        id: `game-${stage}-${idCount}`,
        gameNumber: idCount++,
        round: r + 1,
        stage,
        whiteBotId: flip ? b : a,
        blackBotId: flip ? a : b,
        status: "upcoming",
      });
    }
  }
  return games;
}

/** Generate 14-game Championship match pairings */
export function generateChampionshipMatchGames(
  champId: string,
  challengerId: string,
  totalGames: number = 14,
): ScheduledGame[] {
  const games: ScheduledGame[] = [];
  for (let i = 1; i <= totalGames; i++) {
    // Alternates colors every game
    const champIsWhite = i % 2 !== 0;
    games.push({
      id: `match-game-${i}`,
      gameNumber: i,
      stage: "match",
      whiteBotId: champIsWhite ? champId : challengerId,
      blackBotId: champIsWhite ? challengerId : champId,
      status: "upcoming",
    });
  }
  return games;
}

/** Recalculate standings from games */
export function calculateStandings(
  botIds: string[],
  games: ScheduledGame[],
  qualifySlots?: number,
): StandingRow[] {
  const bots = loadBots();
  const map: Record<string, StandingRow> = {};

  botIds.forEach((id) => {
    const b = bots.find((x) => x.id === id);
    map[id] = {
      botId: id,
      botName: b?.name || id,
      avatarUrl: b?.avatar,
      rating: b?.elo ?? 1500,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      points: 0,
    };
  });

  games.forEach((g) => {
    if (g.status !== "completed" || !g.result || g.result === "*") return;
    const white = map[g.whiteBotId];
    const black = map[g.blackBotId];
    if (!white || !black) return;

    white.played += 1;
    black.played += 1;

    if (g.result === "1-0") {
      white.wins += 1;
      white.points += 1;
      black.losses += 1;
    } else if (g.result === "0-1") {
      black.wins += 1;
      black.points += 1;
      white.losses += 1;
    } else if (g.result === "1/2-1/2") {
      white.draws += 1;
      white.points += 0.5;
      black.draws += 1;
      black.points += 0.5;
    }
  });

  const sorted = Object.values(map).sort(
    (a, b) => b.points - a.points || b.wins - a.wins || b.rating - a.rating,
  );
  if (qualifySlots && qualifySlots > 0) {
    return sorted.map((row, idx) => ({ ...row, qualified: idx < qualifySlots }));
  }
  return sorted;
}

/** Recompute Championship match scores from its completed games */
export function calculateMatchScore(
  championId: string,
  challengerId: string,
  games: ScheduledGame[],
): { championScore: number; challengerScore: number } {
  let championScore = 0;
  let challengerScore = 0;
  for (const g of games) {
    if (g.status !== "completed" || !g.result || g.result === "*") continue;
    if (g.result === "1-0") {
      if (g.whiteBotId === championId) championScore += 1;
      else if (g.whiteBotId === challengerId) challengerScore += 1;
    } else if (g.result === "0-1") {
      if (g.blackBotId === championId) championScore += 1;
      else if (g.blackBotId === challengerId) challengerScore += 1;
    } else if (g.result === "1/2-1/2") {
      if (g.whiteBotId === championId || g.blackBotId === championId) championScore += 0.5;
      if (g.whiteBotId === challengerId || g.blackBotId === challengerId) challengerScore += 0.5;
    }
  }
  return { championScore, challengerScore };
}

/** Play an automated bot-vs-bot game for a ScheduledGame using the bot engine */
export async function playChampionshipBotGame(
  whiteBot: BotConfig | null,
  blackBot: BotConfig | null,
  options?: {
    moveDelayMs?: number;
    maxPlies?: number;
    signal?: AbortSignal;
    onMove?: (moveHistory: string[], fen: string) => void;
  },
): Promise<{
  result: "1-0" | "0-1" | "1/2-1/2";
  moveHistory: string[];
  pgn: string;
}> {
  const chess = new Chess();
  const moveHistory: string[] = [];
  const maxPlies = options?.maxPlies ?? 220;
  const delayMs = options?.moveDelayMs ?? 120;

  while (!chess.isGameOver() && moveHistory.length < maxPlies) {
    if (options?.signal?.aborted) break;
    const activeBot = chess.turn() === "w" ? whiteBot : blackBot;
    const picked = await chooseBotMove(chess, activeBot);
    if (!picked) break;
    const m = chess.move({
      from: picked.move.from,
      to: picked.move.to,
      promotion: picked.move.promotion as "q" | "r" | "b" | "n" | undefined,
    });
    if (!m) break;
    moveHistory.push(m.san);
    options?.onMove?.([...moveHistory], chess.fen());
    if (delayMs > 0) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  let result: "1-0" | "0-1" | "1/2-1/2" = "1/2-1/2";
  if (chess.isCheckmate()) {
    result = chess.turn() === "w" ? "0-1" : "1-0";
  }

  return {
    result,
    moveHistory,
    pgn: chess.pgn(),
  };
}
