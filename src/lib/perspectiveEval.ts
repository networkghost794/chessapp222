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
  200, 400, 600, 800, 1000, 1200, 1400, 1600, 1800, 2000, 2200, 2500,
] as const;

export function titleForRating(rating: number): string | null {
  if (rating >= 2500) return "GM";
  if (rating >= 2400) return "IM";
  if (rating >= 2300) return "FM";
  if (rating >= 2200) return "CM";
  return null;
}

function depthForRating(rating: number): number {
  if (rating <= 600) return 6;
  if (rating <= 1200) return 8;
  if (rating <= 1800) return 9;
  return 11;
}

/** Deterministic-ish pseudo noise so the same position stays stable per call. */
function gauss(sd: number): number {
  if (sd <= 0) return 0;
  const u = Math.max(1e-9, Math.random());
  const v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) * sd;
}

function scoreOf(cp: number | null, mate: number | null): number {
  if (mate != null) return mate > 0 ? 100000 - mate * 100 : -100000 - mate * 100;
  return cp ?? 0;
}

/**
 * Evaluate every legal move from the given FEN through the lens of `rating`.
 */
export async function evaluatePerspective(fen: string, rating: number): Promise<PerspectiveResult> {
  const chess = new Chess(fen);
  const legal = chess.moves({ verbose: true }) as Array<{
    from: string;
    to: string;
    promotion?: string;
  }>;
  const empty: PerspectiveResult = { byMove: {}, bySquare: {} };
  if (legal.length === 0) return empty;

  const lines = await analyseTopMoves(fen, {
    multipv: Math.min(legal.length, 40),
    depth: depthForRating(rating),
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

  // Human perception noise: weaker perspectives misjudge more.
  const noiseSd = Math.max(0, (2500 - rating) / 11);
  const perceived = new Map<string, number>();
  const worst = Math.min(...raw.values());
  for (const mv of legal) {
    const key = `${mv.from}${mv.to}`;
    const base = raw.has(key) ? (raw.get(key) as number) : worst - 120;
    perceived.set(key, base + gauss(noiseSd));
  }

  const sorted = [...perceived.entries()].sort((a, b) => b[1] - a[1]);
  const best = sorted[0][1];

  // Tolerance widens with strength — a master recognises many playable ideas,
  // a beginner only spots one or two.
  const bestTol = 8; // ties with the top move stay purple
  const greenTol = 15 + rating * 0.05;
  const yellowTol = 60 + rating * 0.14;
  const maxGreens = Math.max(1, Math.min(8, Math.round(1 + rating / 400)));

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

  const rank: Record<MoveVerdict, number> = { purple: 4, green: 3, yellow: 2, red: 1 };
  const bySquare: Record<string, MoveVerdict> = {};
  for (const [key, verdict] of Object.entries(byMove)) {
    const to = key.slice(2, 4);
    const cur = bySquare[to];
    if (!cur || rank[verdict] > rank[cur]) bySquare[to] = verdict;
  }

  return { byMove, bySquare };
}
