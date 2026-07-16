// Dedicated Stockfish worker used ONLY for evaluation bar (Bot vs Bot).
// Kept separate from `stockfishEngine.ts` so it never competes with a
// bot's in-flight `analyseTopMoves` call.

let workerRef: Worker | null = null;
const listeners = new Set<(line: string) => void>();

const STOCKFISH_CDN =
  "https://cdn.jsdelivr.net/npm/stockfish.js@10.0.2/stockfish.js";

function ensureWorker(): Worker {
  if (workerRef) return workerRef;
  const stub = `try { importScripts(${JSON.stringify(STOCKFISH_CDN)}); }
    catch (e) { self.postMessage('SF_LOAD_ERROR:' + (e && e.message ? e.message : e)); }`;
  const blob = new Blob([stub], { type: "text/javascript" });
  const w = new Worker(URL.createObjectURL(blob));
  w.onmessage = (ev) => {
    const line = typeof ev.data === "string" ? ev.data : String(ev.data);
    listeners.forEach((fn) => fn(line));
  };
  workerRef = w;
  w.postMessage("uci");
  w.postMessage("isready");
  w.postMessage("setoption name UCI_LimitStrength value false");
  return w;
}

function send(cmd: string) {
  ensureWorker().postMessage(cmd);
}

function onLine(fn: (line: string) => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export type PositionEval = {
  /** Centipawns from side-to-move perspective, positive = better for STM. */
  cp: number | null;
  /** Mate in N (positive = STM mates, negative = STM is mated). */
  mate: number | null;
  /** Side-to-move ("w" | "b"). Used by UI to display sign correctly. */
  turn: "w" | "b";
};

let busy = false;
let queued: { fen: string; resolve: (v: PositionEval | null) => void } | null = null;

async function runEval(fen: string, depth = 12): Promise<PositionEval | null> {
  ensureWorker();
  return new Promise((resolve) => {
    let cp: number | null = null;
    let mate: number | null = null;
    const turn = (fen.split(" ")[1] === "b" ? "b" : "w") as "w" | "b";
    const off = onLine((line) => {
      if (line.startsWith("info") && line.includes(" depth ")) {
        const cpm = /score cp (-?\d+)/.exec(line);
        const mm = /score mate (-?\d+)/.exec(line);
        if (cpm) { cp = Number(cpm[1]); mate = null; }
        if (mm) { mate = Number(mm[1]); cp = null; }
      }
      if (line.startsWith("bestmove")) {
        off();
        resolve({ cp, mate, turn });
      }
    });
    send("ucinewgame");
    send("setoption name MultiPV value 1");
    send(`position fen ${fen}`);
    send(`go depth ${depth}`);
  });
}

/**
 * Evaluate a position for the eval-bar. If a call is already in flight,
 * the new request replaces any previously queued (never-shown) request
 * so we only ever show the latest board state.
 */
export function evaluatePosition(fen: string, depth = 12): Promise<PositionEval | null> {
  if (busy) {
    return new Promise((resolve) => {
      if (queued) queued.resolve(null);
      queued = { fen, resolve };
    });
  }
  busy = true;
  return runEval(fen, depth).then((res) => {
    busy = false;
    if (queued) {
      const q = queued;
      queued = null;
      // Run queued as a follow-up (fire and forget the outer resolver).
      void evaluatePosition(q.fen, depth).then(q.resolve);
    }
    return res;
  });
}
