// Self-contained Stockfish engine wrapped in a Web Worker.
// Loads stockfish.js v10 (asm.js, single-file) from a CDN via importScripts
// inside a Blob worker — no external HTTP fetches per move, no server dependency.

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
  // initial handshake
  w.postMessage("uci");
  w.postMessage("isready");
  return w;
}

function send(cmd: string) { ensureWorker().postMessage(cmd); }

function onLine(fn: (line: string) => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export type TopMove = { uci: string; cp: number | null; mate: number | null };

/**
 * Ask Stockfish for the top-K legal moves from a given FEN, applying a
 * skill level approximated from Elo. Returns moves ordered best→worst.
 */
export function analyseTopMoves(
  fen: string,
  opts: { multipv: number; depth: number; elo?: number; movetime?: number },
): Promise<TopMove[]> {
  ensureWorker();
  return new Promise((resolve) => {
    const collected = new Map<number, TopMove>();
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      off();
      clearTimeout(guard);
      const arr = Array.from(collected.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([, v]) => v);
      resolve(arr);
    };
    // Hard safety net: never let a search hang the UI.
    const guard = setTimeout(() => {
      send("stop");
      setTimeout(finish, 120);
    }, (opts.movetime ?? 4000) + 1500);
    const off = onLine((line) => {
      if (line.startsWith("info") && line.includes(" multipv ")) {
        const mpv = Number(/ multipv (\d+)/.exec(line)?.[1] ?? 0);
        const pv = / pv ([a-h1-8nbrq ]+?)(?: |$)/.exec(line)?.[1];
        const cp = /score cp (-?\d+)/.exec(line);
        const mate = /score mate (-?\d+)/.exec(line);
        if (mpv && pv) {
          const uci = pv.split(/\s+/)[0];
          collected.set(mpv, {
            uci,
            cp: cp ? Number(cp[1]) : null,
            mate: mate ? Number(mate[1]) : null,
          });
        }
      }
      if (line.startsWith("bestmove")) {
        finish();
      }
    });

    // Configure skill from Elo (Stockfish "UCI_LimitStrength" + "UCI_Elo")
    send("ucinewgame");
    if (opts.elo && opts.elo > 0) {
      send("setoption name UCI_LimitStrength value true");
      send(`setoption name UCI_Elo value ${Math.max(1320, Math.min(3190, opts.elo))}`);
    } else {
      send("setoption name UCI_LimitStrength value false");
    }
    send(`setoption name MultiPV value ${Math.max(1, opts.multipv)}`);
    send(`position fen ${fen}`);
    const goDepth = `go depth ${Math.max(1, Math.min(20, opts.depth))}`;
    send(opts.movetime ? `${goDepth} movetime ${Math.max(50, opts.movetime)}` : goDepth);
  });
}

export function quitEngine() {
  if (workerRef) {
    workerRef.postMessage("quit");
    workerRef.terminate();
    workerRef = null;
  }
}
