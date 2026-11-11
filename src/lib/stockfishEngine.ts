// Self-contained Stockfish engine wrapped in a Web Worker.
// Loads Stockfish 18 NNUE (WebAssembly) from /engine; falls back to v10 asm.js.

let workerRef: Worker | null = null;
let configuredHashMb = 0;
const listeners = new Set<(line: string) => void>();

const STOCKFISH_CDN = "https://cdn.jsdelivr.net/npm/stockfish.js@10.0.2/stockfish.js";
export const MODERN_ENGINE_URL = "/engine/stockfish-18-lite-single.js";
export const ENGINE_VERSION = "Stockfish 18 NNUE (WASM)";

function legacyWorker(): Worker {
  const stub = `try { importScripts(${JSON.stringify(STOCKFISH_CDN)}); }
    catch (e) { self.postMessage('SF_LOAD_ERROR:' + (e && e.message ? e.message : e)); }`;
  return new Worker(URL.createObjectURL(new Blob([stub], { type: "text/javascript" })));
}

function ensureWorker(): Worker {
  if (workerRef) return workerRef;
  const attach = (w: Worker) => {
    w.onmessage = (ev) => {
      const line = typeof ev.data === "string" ? ev.data : String(ev.data);
      listeners.forEach((fn) => fn(line));
    };
  };
  let w: Worker;
  try {
    // Modern Stockfish 18 NNUE (WebAssembly, single-threaded) served from /engine.
    w = new Worker(MODERN_ENGINE_URL);
    w.onerror = () => {
      // Fallback to the legacy engine if WASM fails to load in this browser.
      console.warn("[stockfish] Stockfish 18 failed to load, falling back to v10");
      const fb = legacyWorker();
      attach(fb);
      workerRef = fb;
      fb.postMessage("uci");
      fb.postMessage("isready");
    };
  } catch {
    w = legacyWorker();
  }
  attach(w);
  workerRef = w;
  // initial handshake
  w.postMessage("uci");
  w.postMessage("isready");
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

export type TopMove = { uci: string; cp: number | null; mate: number | null };

/**
 * Ask Stockfish for the top-K legal moves from a given FEN, applying a
 * skill level approximated from Elo. Returns moves ordered best→worst.
 */
export function analyseTopMoves(
  fen: string,
  opts: {
    multipv: number;
    depth: number;
    elo?: number;
    movetime?: number;
    skill?: number;
    timeoutMs?: number;
  },
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
    const guard = setTimeout(
      () => {
        send("stop");
        setTimeout(finish, 120);
      },
      (opts.timeoutMs ?? opts.movetime ?? 4000) + 1500,
    );
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
    const hashMb = opts.depth >= 20 || (opts.elo ?? 0) >= 3000 ? 128 : 32;
    if (configuredHashMb !== hashMb) {
      send(`setoption name Hash value ${hashMb}`);
      configuredHashMb = hashMb;
    }
    if (opts.elo && opts.elo > 0) {
      send("setoption name UCI_LimitStrength value true");
      send(`setoption name UCI_Elo value ${Math.max(1320, Math.min(3190, opts.elo))}`);
    } else {
      send("setoption name UCI_LimitStrength value false");
    }
    send(`setoption name Skill Level value ${Math.max(0, Math.min(20, opts.skill ?? 20))}`);
    send(`setoption name MultiPV value ${Math.max(1, opts.multipv)}`);
    send(`position fen ${fen}`);
    const goDepth = `go depth ${Math.max(1, Math.min(30, opts.depth))}`;
    send(opts.movetime ? `${goDepth} movetime ${Math.max(50, opts.movetime)}` : goDepth);
  });
}

export function resetEngineGame() {
  send("ucinewgame");
}

export function quitEngine() {
  if (workerRef) {
    workerRef.postMessage("quit");
    workerRef.terminate();
    workerRef = null;
    configuredHashMb = 0;
  }
}

/** Plain Stockfish move at a given Skill Level (0–20). Used by Studio test bench anchors. */
export function engineBestMove(fen: string, skill: number, depth: number): Promise<string | null> {
  ensureWorker();
  return new Promise((resolve) => {
    let done = false;
    const off = onLine((line) => {
      if (line.startsWith("bestmove")) {
        if (done) return;
        done = true;
        off();
        clearTimeout(guard);
        const m = line.split(/\s+/)[1];
        resolve(m && m !== "(none)" ? m : null);
      }
    });
    const guard = setTimeout(() => {
      send("stop");
      setTimeout(() => {
        if (!done) {
          done = true;
          off();
          resolve(null);
        }
      }, 200);
    }, 6000);
    send("setoption name UCI_LimitStrength value false");
    send(`setoption name Skill Level value ${Math.max(0, Math.min(20, skill))}`);
    send("setoption name MultiPV value 1");
    send(`position fen ${fen}`);
    send(`go depth ${Math.max(1, Math.min(20, depth))}`);
  });
}
