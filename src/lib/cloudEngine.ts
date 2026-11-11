export type CloudEvalResult = {
  uci: string;
  depth: number;
  cp?: number;
  mate?: number;
};

/**
 * Queries the free Lichess Cloud Evaluation API for positions evaluated
 * by high-end server clusters running Stockfish Depth 40-60+ (3800+ Elo).
 * Returns null if the position is not in the cloud cache or if the network fails.
 */
export async function queryCloudEngine(fen: string): Promise<CloudEvalResult | null> {
  try {
    const encodedFen = encodeURIComponent(fen);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);

    const res = await fetch(`https://lichess.org/api/cloud-eval?fen=${encodedFen}&multiPv=1`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    clearTimeout(timeout);

    if (!res.ok) return null;
    const data = await res.json();
    if (!data || !data.pvs || !data.pvs[0] || !data.pvs[0].moves) return null;

    const topPv = data.pvs[0];
    const firstMoveUci = topPv.moves.split(" ")[0];
    if (!firstMoveUci) return null;

    return {
      uci: firstMoveUci,
      depth: data.depth || 40,
      cp: topPv.cp,
      mate: topPv.mate,
    };
  } catch {
    // Network offline or timeout - fallback safely to local WASM Stockfish
    return null;
  }
}
