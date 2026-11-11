export type CloudEvalResult = {
  uci: string;
  depth: number;
  cp?: number;
  mate?: number;
};

/**
 * Queries the free Lichess Cloud Evaluation API for positions evaluated
 * by high-end server clusters running Stockfish Depth 40-60+ (3800+ Elo).
 * Silently returns null if the position is not cached or if network fails.
 */
export async function queryCloudEngine(fen: string): Promise<CloudEvalResult | null> {
  try {
    const encodedFen = encodeURIComponent(fen);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);

    const res = await fetch(`https://lichess.org/api/cloud-eval?fen=${encodedFen}&multiPv=1`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    clearTimeout(timeout);

    // If position not cached on Lichess (404) or rate-limited, safely fall back
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    if (!data || !data.pvs || !data.pvs[0] || !data.pvs[0].moves) return null;

    const topPv = data.pvs[0];
    const firstMoveUci = topPv.moves.split(" ")[0];
    if (!firstMoveUci) return null;

    return {
      uci: firstMoveUci,
      depth: data.depth || 50,
      cp: topPv.cp,
      mate: topPv.mate,
    };
  } catch {
    return null;
  }
}

/**
 * Queries the free Syzygy 7-Piece Endgame Tablebase API (tablebase.lichess.ovh).
 * Solves any position with <= 7 pieces with 100% mathematical perfection (4000+ Elo).
 * Returns the best move immediately, or null if pieces > 7 or offline.
 */
export async function queryTablebase(fen: string): Promise<string | null> {
  try {
    // Quick count of pieces on board before calling API
    const positionPart = fen.split(" ")[0];
    const pieceCount = (positionPart.match(/[pnbrqkPNBRQK]/g) || []).length;
    if (pieceCount > 7) return null;

    const encodedFen = encodeURIComponent(fen);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1800);

    const res = await fetch(`https://tablebase.lichess.ovh/standard?fen=${encodedFen}`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    clearTimeout(timeout);

    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    if (!data || !data.moves || data.moves.length === 0) return null;

    // Pick the top winning or drawing move from tablebase
    const best = data.moves[0];
    return best && best.uci ? best.uci : null;
  } catch {
    return null;
  }
}
