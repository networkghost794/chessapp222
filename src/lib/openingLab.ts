import { Chess } from "chess.js";
import { polyglotHash } from "./polyglot";
import type { MoveStyle, ExpectedMoves, EngineProfile } from "./botStore";

export type PgnGame = { headers: Record<string, string>; moves: string; };
export type ColorFilter = "white" | "black" | "both";
export type ResultFilter = "wins" | "winsDraws" | "all";

export function splitPgn(text: string): PgnGame[] {
  const chunks = text.replace(/\r/g, "").split(/\n(?=\[Event )/);
  const out: PgnGame[] = [];
  for (const c of chunks) {
    const headers: Record<string, string> = {};
    for (const m of c.matchAll(/^\[(\w+)\s+"([^"]*)"\]/gm)) headers[m[1]] = m[2];
    const moves = c.replace(/^\[.*\]\s*$/gm, "").trim();
    if (moves) out.push({ headers, moves });
  }
  return out;
}

export function listPlayers(games: PgnGame[]): { name: string; count: number }[] {
  const m = new Map<string, number>();
  for (const g of games) for (const k of ["White", "Black"]) {
    const n = g.headers[k]; if (n) m.set(n, (m.get(n) ?? 0) + 1);
  }
  return [...m.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
}

export type LabOptions = { player: string; color: ColorFilter; result: ResultFilter; maxPly: number; minCount: number };

type MoveStat = { san: string; uci: string; count: number; wins: number; draws: number };
export type PosStats = Map<string, Map<string, MoveStat>>; // fenKey -> uci -> stat
export type LabResult = {
  used: number; skipped: number; positions: number; entries: number;
  tree: PosStats; book: Uint8Array; dna: DnaResult;
};
export type DnaResult = {
  style: MoveStyle; expected: ExpectedMoves; engineProfile: EngineProfile;
  mistakeRate: number; samples: number;
  facts: { label: string; value: string }[];
};

const fenKey = (fen: string) => fen.split(" ").slice(0, 4).join(" ");
const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)));

function polyMove(from: string, to: string, promo?: string, isCastle?: "k" | "q"): number {
  const f = (s: string) => [s.charCodeAt(0) - 97, Number(s[1]) - 1];
  let [tf, tr] = f(to);
  const [ff, fr] = f(from);
  if (isCastle) tf = isCastle === "k" ? 7 : 0, tr = fr;
  const p = promo ? ({ n: 1, b: 2, r: 3, q: 4 } as Record<string, number>)[promo] ?? 0 : 0;
  return (p << 12) | (fr << 9) | (ff << 6) | (tr << 3) | tf;
}

export function analyzeGames(games: PgnGame[], o: LabOptions): LabResult {
  const tree: PosStats = new Map();
  const book = new Map<bigint, Map<number, number>>();
  let used = 0, skipped = 0;
  // DNA counters (player's moves only, whole game)
  let mv = 0, caps = 0, checks = 0, pawn = 0, devEarly = 0, earlyMoves = 0, kingMoves = 0;
  let castlePlySum = 0, castled = 0, castleGames = 0, bishopKeep = 0, bishopGames = 0, forward = 0, sacs = 0;
  const val: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
  const name = o.player.trim().toLowerCase();

  for (const g of games) {
    const w = (g.headers.White ?? "").toLowerCase(), b = (g.headers.Black ?? "").toLowerCase();
    let side: "w" | "b" | null = null;
    if (name) { if (w === name) side = "w"; else if (b === name) side = "b"; else { skipped++; continue; } }
    if (side && o.color === "white" && side !== "w") { skipped++; continue; }
    if (side && o.color === "black" && side !== "b") { skipped++; continue; }
    const res = g.headers.Result ?? "*";
    const score = (s: "w" | "b") => res === "1/2-1/2" ? 0.5 : (res === "1-0") === (s === "w") && res !== "*" ? 1 : 0;
    if (side && o.result !== "all") {
      const sc = score(side);
      if (sc === 0 || (o.result === "wins" && sc !== 1)) { skipped++; continue; }
    }
    const chess = new Chess();
    try { chess.loadPgn(`${Object.entries(g.headers).map(([k, v]) => `[${k} "${v}"]`).join("\n")}\n\n${g.moves}`); }
    catch { skipped++; continue; }
    const hist = chess.history({ verbose: true });
    const replay = new Chess();
    const start = g.headers.FEN; if (start) { try { replay.load(start); } catch { skipped++; continue; } }
    used++;
    let myCastle = 0;
    for (let i = 0; i < hist.length; i++) {
      const m = hist[i];
      const mine = side ? m.color === side : (o.color === "both" || (o.color === "white") === (m.color === "w"));
      if (mine && i < o.maxPly) {
        const key = fenKey(replay.fen());
        const uci = m.from + m.to + (m.promotion ?? "");
        let pos = tree.get(key); if (!pos) tree.set(key, pos = new Map());
        let st = pos.get(uci); if (!st) pos.set(uci, st = { san: m.san, uci, count: 0, wins: 0, draws: 0 });
        st.count++; const sc = score(m.color); if (sc === 1) st.wins++; else if (sc === 0.5) st.draws++;
        const h = polyglotHash(replay);
        const castle = m.flags.includes("k") ? "k" : m.flags.includes("q") ? "q" : undefined;
        const pm = polyMove(m.from, m.to, m.promotion, castle);
        let bm = book.get(h); if (!bm) book.set(h, bm = new Map());
        bm.set(pm, (bm.get(pm) ?? 0) + 1);
      }
      if (mine && (side || o.color !== "both")) {
        mv++;
        if (m.captured) { caps++; if (val[m.piece] > val[m.captured] + 1) sacs++; }
        if (m.san.includes("+") || m.san.includes("#")) checks++;
        if (m.piece === "p") pawn++;
        if (m.piece === "k" && !m.flags.match(/[kq]/)) kingMoves++;
        const fr = Number(m.from[1]), tr = Number(m.to[1]);
        if ((m.color === "w" ? tr - fr : fr - tr) > 0) forward++;
        if (i < 20) { earlyMoves++; if ("nb".includes(m.piece) && (m.from[1] === "1" || m.from[1] === "8")) devEarly++; }
        if (m.flags.match(/[kq]/) && !myCastle) { myCastle = i + 1; castlePlySum += i + 1; castled++; }
      }
      replay.move(m.san);
    }
    if (side || o.color !== "both") {
      castleGames++;
      const my = side ?? (o.color === "white" ? "w" : "b");
      const bishops = replay.board().flat().filter((s) => s && s.color === my && s.type === "b").length;
      bishopGames++; if (bishops >= 2) bishopKeep++;
    }
  }

  // Build Polyglot binary: entries sorted by key then move.
  const rows: { k: bigint; m: number; w: number }[] = [];
  for (const [k, mm] of book) {
    const max = Math.max(...mm.values());
    for (const [m, c] of mm) if (c >= o.minCount) rows.push({ k, m, w: Math.max(1, Math.round((c / max) * 65535)) });
  }
  rows.sort((a, b) => (a.k < b.k ? -1 : a.k > b.k ? 1 : b.w - a.w));
  const bin = new Uint8Array(rows.length * 16);
  const dv = new DataView(bin.buffer);
  rows.forEach((r, i) => { dv.setBigUint64(i * 16, r.k, false); dv.setUint16(i * 16 + 8, r.m, false); dv.setUint16(i * 16 + 10, r.w, false); dv.setUint32(i * 16 + 12, 0, false); });

  const rate = (n: number, d: number) => (d ? n / d : 0);
  const capR = rate(caps, mv), chkR = rate(checks, mv), pawnR = rate(pawn, mv), fwdR = rate(forward, mv);
  const sacR = rate(sacs, mv), devR = rate(devEarly, earlyMoves), kingR = rate(kingMoves, mv);
  const avgCastle = castled ? castlePlySum / castled : 40;
  const castleR = rate(castled, castleGames), bpR = rate(bishopKeep, bishopGames);
  // Heuristic mapping around typical master averages (cap ~20%, check ~6%, pawn ~25%).
  const style: MoveStyle = {
    capture: clamp(50 + (capR - 0.2) * 300),
    check: clamp(50 + (chkR - 0.06) * 600),
    pawnAdvance: clamp(50 + (pawnR - 0.25) * 250),
    pieceDevelopment: clamp(50 + (devR - 0.3) * 200),
    kingSafety: clamp(30 + castleR * 50 + (avgCastle < 16 ? 15 : 0) - kingR * 100),
    positional: clamp(70 - (capR - 0.2) * 200 - (chkR - 0.06) * 300 - sacR * 400),
  };
  const expected: ExpectedMoves = {
    keepBishopPair: clamp(bpR * 100),
    advance: clamp(fwdR * 60),
    check: clamp(chkR * 200),
    capture: clamp(capR * 60),
  };
  const aggression = style.capture + style.check + sacR * 1000;
  const engineProfile: EngineProfile =
    style.positional >= 65 ? "komodo" : aggression > 140 ? "berserk" : sacR > 0.02 ? "leela" : "stockfish";
  return {
    used, skipped, positions: book.size, entries: rows.length, tree, book: bin,
    dna: {
      style, expected, engineProfile, mistakeRate: 0, samples: mv,
      facts: [
        { label: "Moves analysed", value: String(mv) },
        { label: "Capture rate", value: `${(capR * 100).toFixed(1)}%` },
        { label: "Check rate", value: `${(chkR * 100).toFixed(1)}%` },
        { label: "Pawn moves", value: `${(pawnR * 100).toFixed(1)}%` },
        { label: "Material sacrifices", value: `${(sacR * 100).toFixed(2)}%` },
        { label: "Castles in", value: castled ? `${(castleR * 100).toFixed(0)}% of games, ply ${avgCastle.toFixed(0)}` : "rarely" },
        { label: "Keeps bishop pair", value: `${(bpR * 100).toFixed(0)}% of games` },
      ],
    },
  };
}

export function movesAt(tree: PosStats, fen: string): MoveStat[] {
  return [...(tree.get(fenKey(fen))?.values() ?? [])].sort((a, b) => b.count - a.count);
}
