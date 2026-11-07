// Perspective evaluation layer — used ONLY by the "Play Through Their Eyes"
// game mode. It estimates how a player of a given rating would likely judge
// each legal move, rather than finding the objectively best engine move.
//
// Fully self-contained: it does not touch the bot engine pipeline.

import { Chess } from "chess.js";
import { analyseTopMoves } from "./stockfishEngine";

export type MoveVerdict = "purple" | "green" | "yellow" | "red";

export type PerspectiveResult = {
  /** keyed by `${from}${to}` */
  byMove: Record<string, MoveVerdict>;
  /** keyed by destination square, best verdict wins */
  bySquare: Record<string, MoveVerdict>;
};

export const PERSPECTIVE_RATINGS = [
  200, 400, 600, 800, 1000, 1200, 1400, 1600, 1800, 2000, 2200, 2500, 2700, 2880, 3500,
] as const;

/** 3500 is the explicit "engine best play" perspective. */
export const STOCKFISH_RATING = 3500;

export function labelForRating(rating: number): string {
  return rating === STOCKFISH_RATING ? "3500 Stockfish" : String(rating);
}

export function titleForRating(rating: number): string | null {
  if (rating >= STOCKFISH_RATING) return "SF";
  if (rating >= 2500) return "GM";
  if (rating >= 2400) return "IM";
  if (rating >= 2300) return "FM";
  if (rating >= 2200) return "CM";
  return null;
}

function depthForRating(rating: number): number {
  if (rating <= 600) return 6;
  if (rating <= 1200) return 8;
  if (rating <= 1800) return 10;
  if (rating <= 2200) return 12;
  if (rating <= 2500) return 14;
  if (rating <= 2700) return 16;
  if (rating < STOCKFISH_RATING) return 18;
  return 20;
}

/** Wall-clock budget per perspective search — keeps the mode interactive. */
function movetimeForRating(rating: number): number {
  if (rating <= 1200) return 500;
  if (rating <= 2200) return 900;
  if (rating <= 2700) return 1500;
  return 1900;
}

/** Deterministic 32-bit string hash — same position+rating ⇒ same perception. */
function hash32(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministic gaussian noise seeded by a string key. */
function gauss(sd: number, seed: string): number {
  if (sd <= 0) return 0;
  const a = (hash32(seed + "|a") + 1) / 4294967297;
  const b = hash32(seed + "|b") / 4294967296;
  return Math.sqrt(-2 * Math.log(a)) * Math.cos(2 * Math.PI * b) * sd;
}

/** Cache of completed/in-flight evaluations, keyed by `fen|rating`. */
const cache = new Map<string, Promise<PerspectiveResult>>();
const CACHE_LIMIT = 400;

function scoreOf(cp: number | null, mate: number | null): number {
  if (mate != null) return mate > 0 ? 100000 - mate * 100 : -100000 - mate * 100;
  return cp ?? 0;
}

/**
 * Evaluate every legal move from the given FEN through the lens of `rating`.
 */
export function evaluatePerspective(fen: string, rating: number): Promise<PerspectiveResult> {
  const key = `${fen}|${rating}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const p = computePerspective(fen, rating).catch((e) => {
    cache.delete(key);
    throw e;
  });
  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
  cache.set(key, p);
  return p;
}

async function computePerspective(fen: string, rating: number): Promise<PerspectiveResult> {
  const chess = new Chess(fen);
  const legal = chess.moves({ verbose: true }) as Array<{
    from: string;
    to: string;
    promotion?: string;
  }>;
  const empty: PerspectiveResult = { byMove: {}, bySquare: {} };
  if (legal.length === 0) return empty;

  const strong = rating >= 2500;
  const lines = await analyseTopMoves(fen, {
    // Strong perspectives see the whole position; weak ones only need a pool.
    multipv: Math.min(legal.length, strong ? 40 : 24),
    depth: depthForRating(rating),
    movetime: movetimeForRating(rating),
  });
  if (!lines.length) return empty;

  // Raw engine score per uci prefix (from+to).
  const raw = new Map<string, number>();
  for (const l of lines) {
    if (!l.uci) continue;
    const key = l.uci.slice(0, 4);
    const s = scoreOf(l.cp, l.mate);
    if (!raw.has(key) || s > (raw.get(key) as number)) raw.set(key, s);
  }
  if (raw.size === 0) return empty;

  const engineBestKey = [...raw.entries()].sort((a, b) => b[1] - a[1])[0][0];

  // Human perception noise: weaker perspectives misjudge far more, elite
  // perspectives are nearly engine-accurate. Quadratic falloff so 2700/2880
  // behave like genuine super-GM play instead of ~2000.
  // 3500 = Stockfish mode: no human noise at all, pure engine judgement.
  const isEngine = rating >= STOCKFISH_RATING;
  const t = Math.max(0, Math.min(1, (2950 - rating) / 2750));
  const noiseSd = isEngine ? 0 : 240 * t * t;
  const perceived = new Map<string, number>();
  const worst = Math.min(...raw.values());
  for (const mv of legal) {
    const key = `${mv.from}${mv.to}`;
    const base = raw.has(key) ? (raw.get(key) as number) : worst - 120;
    perceived.set(key, base + gauss(noiseSd, `${fen}|${rating}|${key}`));
  }

  const sorted = [...perceived.entries()].sort((a, b) => b[1] - a[1]);
  const best = sorted[0][1];

  // Stronger perspectives are stricter: they only bless moves that really are
  // close to best. Beginners hand out approval far more loosely.
  const s = 1 - t; // 0 = weakest, 1 = strongest human perspective
  const bestTol = isEngine ? 2 : 30 - 25 * s;
  const greenTol = isEngine ? 15 : 90 - 72 * s;
  const yellowTol = isEngine ? 60 : 320 - 240 * s;
  const maxGreens = isEngine ? 3 : Math.max(2, Math.round(8 - 5 * s));

  const byMove: Record<string, MoveVerdict> = {};
  let greens = 0;
  for (const [key, score] of sorted) {
    const loss = best - score;
    let verdict: MoveVerdict;
    if (loss <= bestTol) {
      verdict = "purple";
    } else if (loss <= greenTol && greens < maxGreens) {
      verdict = "green";
      greens++;
    } else if (loss <= yellowTol) {
      verdict = "yellow";
    } else {
      verdict = "red";
    }
    byMove[key] = verdict;
  }

  // Engine and elite perspectives must crown the true engine-best move.
  if ((isEngine || rating >= 2700) && raw.has(engineBestKey)) {
    for (const key of Object.keys(byMove)) {
      if (byMove[key] === "purple" && key !== engineBestKey) byMove[key] = "green";
    }
    byMove[engineBestKey] = "purple";
  }

  const rank: Record<MoveVerdict, number> = { purple: 4, green: 3, yellow: 2, red: 1 };
  const bySquare: Record<string, MoveVerdict> = {};
  for (const [key, verdict] of Object.entries(byMove)) {
    const to = key.slice(2, 4);
    const cur = bySquare[to];
    if (!cur || rank[verdict] > rank[cur]) bySquare[to] = verdict;
  }

  return { byMove, bySquare };
}
