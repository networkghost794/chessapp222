import { Chess, type Square } from "chess.js";
import { polyglotHash, lookupPolyglot, polyglotMoveToUci } from "./polyglot";
import { botRepertoire } from "./repertoire";
import type { PosStats } from "./openingLab";

const fenKey = (fen: string) => fen.split(" ").slice(0, 4).join(" ");

function polyMove(from: string, to: string, promo?: string, isCastle?: "k" | "q"): number {
  const f = (s: string) => [s.charCodeAt(0) - 97, Number(s[1]) - 1];
  let [tf, tr] = f(to);
  const [ff, fr] = f(from);
  if (isCastle) {
    tf = isCastle === "k" ? 7 : 0;
    tr = fr;
  }
  const p = promo ? (({ n: 1, b: 2, r: 3, q: 4 } as Record<string, number>)[promo] ?? 0) : 0;
  return (p << 12) | (fr << 9) | (ff << 6) | (tr << 3) | tf;
}

function collectBookKeys(bookBytes: Uint8Array): Set<bigint> {
  const keys = new Set<bigint>();
  const n = Math.floor(bookBytes.length / 16);
  const dv = new DataView(bookBytes.buffer, bookBytes.byteOffset, bookBytes.byteLength);
  for (let i = 0; i < n; i++) {
    keys.add(dv.getBigUint64(i * 16, false));
  }
  return keys;
}

/** Decode a Polyglot .bin binary file into an editable PosStats tree. */
export function decodePolyglotToTree(
  bookBytes: Uint8Array,
  maxDepth = 24,
  maxPositions = 6000,
): PosStats {
  const tree: PosStats = new Map();
  const visited = new Set<string>();
  const bookKeys = collectBookKeys(bookBytes);
  if (bookKeys.size === 0) return tree;

  const startFen = new Chess().fen();
  const startHasBook = bookKeys.has(polyglotHash(new Chess()));
  const queue: { fen: string; depth: number }[] = [{ fen: startFen, depth: 0 }];

  while (queue.length > 0 && visited.size < maxPositions) {
    const item = queue.shift()!;
    if (item.depth >= maxDepth) continue;

    const key = fenKey(item.fen);
    if (visited.has(key)) continue;
    visited.add(key);

    const c = new Chess(item.fen);
    const hash = polyglotHash(c);
    const entries = lookupPolyglot(bookBytes, hash);

    if (entries.length > 0) {
      let posMap = tree.get(key);
      if (!posMap) {
        posMap = new Map();
        tree.set(key, posMap);
      }

      for (const entry of entries) {
        const uci = polyglotMoveToUci(c, entry.move);
        try {
          const from = uci.slice(0, 2);
          const to = uci.slice(2, 4);
          const promo = uci.slice(4) || undefined;
          const mv = c.move({ from, to, promotion: promo });
          if (mv) {
            posMap.set(uci, {
              san: mv.san,
              uci,
              count: entry.weight || 1,
              wins: Math.round((entry.weight || 1) * 0.5),
              draws: 0,
            });
            queue.push({ fen: c.fen(), depth: item.depth + 1 });
            c.undo();
          }
        } catch {
          // ignore illegal or malformed move entry
        }
      }
      continue;
    }

    // Support single-color (e.g. Black-only) Polyglot books by bridging across
    // opponent moves that directly reach a position stored in the book.
    if (!startHasBook || item.depth > 0) {
      for (const mv of c.moves({ verbose: true })) {
        c.move(mv.san);
        if (bookKeys.has(polyglotHash(c))) {
          queue.push({ fen: c.fen(), depth: item.depth + 1 });
        }
        c.undo();
      }
    }
  }

  return tree;
}

/** Convert a bot's built-in repertoire into an editable PosStats tree. */
export function botRepertoireToTree(botId: string, sideFilter?: "w" | "b"): PosStats {
  const lines = botRepertoire(botId).filter((l) => !sideFilter || l.side === sideFilter);
  const tree = linesToTree(lines.map((l) => l.moves));
  if (sideFilter) {
    return removeSideFromTree(tree, sideFilter === "w" ? "b" : "w");
  }
  return tree;
}

/** Convert opening move lines into a PosStats tree. */
export function linesToTree(lines: string[][]): PosStats {
  const tree: PosStats = new Map();

  for (const line of lines) {
    const c = new Chess();
    for (const moveStr of line) {
      const key = fenKey(c.fen());
      try {
        const m = c.move(moveStr);
        if (!m) break;
        const uci = m.from + m.to + (m.promotion ?? "");
        let pos = tree.get(key);
        if (!pos) {
          pos = new Map();
          tree.set(key, pos);
        }
        let st = pos.get(uci);
        if (!st) {
          pos.set(uci, (st = { san: m.san, uci, count: 0, wins: 0, draws: 0 }));
        }
        st.count += 10;
        st.wins += 5;
      } catch {
        break;
      }
    }
  }

  return tree;
}

/** Prune any positions that are no longer reachable from the initial board position. */
export function pruneUnreachablePositions(tree: PosStats, maxDepth = 40): PosStats {
  if (tree.size === 0) return new Map();

  let hasWhite = false;
  let hasBlack = false;
  for (const key of tree.keys()) {
    const turn = key.split(" ")[1];
    if (turn === "w") hasWhite = true;
    else if (turn === "b") hasBlack = true;
    if (hasWhite && hasBlack) break;
  }

  const singleSide: "w" | "b" | null =
    hasWhite && !hasBlack ? "w" : hasBlack && !hasWhite ? "b" : null;

  const reachable = new Set<string>();
  const visited = new Set<string>();
  const queue: { fen: string; depth: number }[] = [{ fen: new Chess().fen(), depth: 0 }];

  while (queue.length > 0) {
    const item = queue.shift()!;
    if (item.depth > maxDepth) continue;

    const key = fenKey(item.fen);
    if (visited.has(key)) continue;
    visited.add(key);

    const posMoves = tree.get(key);
    const turn = key.split(" ")[1] as "w" | "b";

    if (posMoves && posMoves.size > 0) {
      reachable.add(key);
      const c = new Chess(item.fen);
      for (const uci of posMoves.keys()) {
        try {
          const mv = c.move({
            from: uci.slice(0, 2),
            to: uci.slice(2, 4),
            promotion: uci.slice(4) || undefined,
          });
          if (mv) {
            queue.push({ fen: c.fen(), depth: item.depth + 1 });
            c.undo();
          }
        } catch {
          // ignore illegal
        }
      }
    } else if (singleSide && turn !== singleSide) {
      // Single-color book: bridge opponent's move only into existing book positions
      const c = new Chess(item.fen);
      for (const mv of c.moves({ verbose: true })) {
        c.move(mv.san);
        const childKey = fenKey(c.fen());
        if (tree.has(childKey)) {
          queue.push({ fen: c.fen(), depth: item.depth + 1 });
        }
        c.undo();
      }
    }
  }

  const cleaned: PosStats = new Map();
  for (const [key, pos] of tree) {
    if (reachable.has(key) && pos.size > 0) {
      cleaned.set(key, new Map(pos));
    }
  }
  return cleaned;
}

/** Remove a move from a specific position and strip any orphaned downstream positions. */
export function removeMoveFromTree(tree: PosStats, fen: string, uci: string): PosStats {
  const nextTree: PosStats = new Map();
  for (const [k, pos] of tree) {
    nextTree.set(k, new Map(pos));
  }

  const key = fenKey(fen);
  const pos = nextTree.get(key);
  if (!pos) return nextTree;

  pos.delete(uci);
  if (pos.size === 0) {
    nextTree.delete(key);
  }

  return pruneUnreachablePositions(nextTree);
}

/** Remove all moves belonging to a specific side ("w" or "b") from the tree. */
export function removeSideFromTree(tree: PosStats, sideToRemove: "w" | "b"): PosStats {
  const filtered: PosStats = new Map();
  for (const [key, pos] of tree) {
    const turn = key.split(" ")[1];
    if (turn === sideToRemove) continue;
    if (pos.size > 0) {
      filtered.set(key, new Map(pos));
    }
  }
  return pruneUnreachablePositions(filtered);
}

/** List legal moves from `fen` that transition into a position with moves in `tree`. */
export function opponentContinuationsAt(
  tree: PosStats,
  fen: string,
): { san: string; uci: string }[] {
  const c = new Chess(fen);
  const out: { san: string; uci: string }[] = [];
  for (const mv of c.moves({ verbose: true })) {
    c.move(mv.san);
    const childKey = fenKey(c.fen());
    const childPos = tree.get(childKey);
    if (childPos && childPos.size > 0) {
      out.push({ san: mv.san, uci: mv.from + mv.to + (mv.promotion ?? "") });
    }
    c.undo();
  }
  return out;
}

/** Count positions and move entries in a PosStats tree. */
export function countTreeStats(tree: PosStats): {
  positions: number;
  entries: number;
  whiteMoves: number;
  blackMoves: number;
} {
  let entries = 0;
  let whiteMoves = 0;
  let blackMoves = 0;
  for (const [key, pos] of tree) {
    const turn = key.split(" ")[1];
    entries += pos.size;
    if (turn === "w") whiteMoves += pos.size;
    else if (turn === "b") blackMoves += pos.size;
  }
  return { positions: tree.size, entries, whiteMoves, blackMoves };
}

/** Compile a PosStats tree into a valid Polyglot .bin byte array. */
export function treeToPolyglotBinary(tree: PosStats): Uint8Array {
  const rows: { k: bigint; m: number; w: number }[] = [];

  for (const [key, movesMap] of tree) {
    const c = new Chess();
    try {
      c.load(`${key} 0 1`);
    } catch {
      continue;
    }

    const hash = polyglotHash(c);
    const max = Math.max(1, ...Array.from(movesMap.values()).map((s) => s.count));

    for (const [uci, stat] of movesMap) {
      const from = uci.slice(0, 2);
      const to = uci.slice(2, 4);
      const promo = uci.slice(4) || undefined;

      let castle: "k" | "q" | undefined;
      const piece = c.get(from as Square);
      if (piece?.type === "k") {
        if ((from === "e1" && to === "g1") || (from === "e8" && to === "g8")) castle = "k";
        if ((from === "e1" && to === "c1") || (from === "e8" && to === "c8")) castle = "q";
      }

      const pm = polyMove(from, to, promo, castle);
      const weight = Math.max(1, Math.min(65535, Math.round((stat.count / max) * 65535)));
      rows.push({ k: hash, m: pm, w: weight });
    }
  }

  // Polyglot spec: sort ascending by 64-bit hash key, then descending by weight
  rows.sort((a, b) => (a.k < b.k ? -1 : a.k > b.k ? 1 : b.w - a.w));

  const bin = new Uint8Array(rows.length * 16);
  const dv = new DataView(bin.buffer);
  rows.forEach((r, i) => {
    dv.setBigUint64(i * 16, r.k, false);
    dv.setUint16(i * 16 + 8, r.m, false);
    dv.setUint16(i * 16 + 10, r.w, false);
    dv.setUint32(i * 16 + 12, 0, false);
  });

  return bin;
}
