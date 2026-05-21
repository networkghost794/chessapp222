import type { Chess } from "chess.js";
import { POLY_KEYS } from "./polyglotKeys";

// Polyglot piece order: bp=0, wp=1, bn=2, wn=3, bb=4, wb=5, br=6, wr=7, bq=8, wq=9, bk=10, wk=11
const PIECE_OFFSET: Record<string, number> = {
  bp: 0, wp: 1, bn: 2, wn: 3, bb: 4, wb: 5, br: 6, wr: 7, bq: 8, wq: 9, bk: 10, wk: 11,
};
const RANDOM_PIECE = 0;          // 768 entries (12 * 64)
const RANDOM_CASTLE = 768;        // 4 entries: K Q k q
const RANDOM_ENPASSANT = 772;     // 8 entries: files a..h
const RANDOM_TURN = 780;          // 1 entry

const MASK64 = (1n << 64n) - 1n;

export function polyglotHash(game: Chess): bigint {
  let key = 0n;
  const board = game.board(); // board[0] = rank 8
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const sq = board[r][f];
      if (!sq) continue;
      const rank = 7 - r; // polyglot rank 0..7 = 1..8
      const file = f;
      const pcKey = sq.color + sq.type; // e.g. "wp"
      const off = PIECE_OFFSET[pcKey];
      const idx = RANDOM_PIECE + 64 * off + 8 * rank + file;
      key ^= POLY_KEYS[idx];
    }
  }
  // castling
  const fen = game.fen();
  const parts = fen.split(" ");
  const castling = parts[2];
  if (castling.includes("K")) key ^= POLY_KEYS[RANDOM_CASTLE + 0];
  if (castling.includes("Q")) key ^= POLY_KEYS[RANDOM_CASTLE + 1];
  if (castling.includes("k")) key ^= POLY_KEYS[RANDOM_CASTLE + 2];
  if (castling.includes("q")) key ^= POLY_KEYS[RANDOM_CASTLE + 3];

  // en passant — only if a pawn of side-to-move can actually capture
  const ep = parts[3];
  if (ep !== "-") {
    const file = ep.charCodeAt(0) - 97;
    const turn = parts[1];
    const pawnRank = turn === "w" ? 5 : 4; // pawn rank (1-indexed: 5 or 4)
    const epRow = 8 - (turn === "w" ? 5 : 4) - 1; // row index in board()
    // Check adjacent files for own pawn on the capturing rank
    const ourPawn = turn === "w" ? "P" : "p";
    let canCapture = false;
    for (const df of [-1, 1]) {
      const ff = file + df;
      if (ff < 0 || ff > 7) continue;
      const r = 8 - pawnRank; // row index
      const sq = game.board()[r]?.[ff];
      if (sq && (sq.color === turn) && sq.type === "p") canCapture = true;
    }
    void ourPawn; void epRow;
    if (canCapture) key ^= POLY_KEYS[RANDOM_ENPASSANT + file];
  }

  // turn — XOR if white to move
  if (parts[1] === "w") key ^= POLY_KEYS[RANDOM_TURN];

  return key & MASK64;
}

export type PolyEntry = { move: number; weight: number; learn: number };

export function lookupPolyglot(book: Uint8Array, key: bigint): PolyEntry[] {
  // 16-byte entries sorted by key. Binary search.
  const n = Math.floor(book.length / 16);
  const dv = new DataView(book.buffer, book.byteOffset, book.byteLength);
  let lo = 0, hi = n;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    const k = dv.getBigUint64(mid * 16, false);
    if (k < key) lo = mid + 1;
    else hi = mid;
  }
  const out: PolyEntry[] = [];
  for (let i = lo; i < n; i++) {
    const k = dv.getBigUint64(i * 16, false);
    if (k !== key) break;
    out.push({
      move: dv.getUint16(i * 16 + 8, false),
      weight: dv.getUint16(i * 16 + 10, false),
      learn: dv.getUint32(i * 16 + 12, false),
    });
  }
  return out;
}

// Convert a polyglot 16-bit move to UCI; handle castling rook-target encoding.
export function polyglotMoveToUci(game: Chess, mv: number): string {
  const toFile = mv & 0b111;
  const toRow = (mv >> 3) & 0b111;
  const fromFile = (mv >> 6) & 0b111;
  const fromRow = (mv >> 9) & 0b111;
  const promo = (mv >> 12) & 0b111;
  const sq = (f: number, r: number) => String.fromCharCode(97 + f) + (r + 1);
  let from = sq(fromFile, fromRow);
  let to = sq(toFile, toRow);
  // Castling fixups (polyglot encodes king-takes-rook)
  const piece = game.get(from as Parameters<Chess["get"]>[0]);
  if (piece && piece.type === "k") {
    if (from === "e1" && to === "h1") to = "g1";
    else if (from === "e1" && to === "a1") to = "c1";
    else if (from === "e8" && to === "h8") to = "g8";
    else if (from === "e8" && to === "a8") to = "c8";
  }
  const promoChar = ["", "n", "b", "r", "q"][promo] ?? "";
  return from + to + promoChar;
}

export function pickWeighted(entries: PolyEntry[]): PolyEntry | null {
  if (entries.length === 0) return null;
  const total = entries.reduce((a, e) => a + Math.max(1, e.weight), 0);
  let r = Math.random() * total;
  for (const e of entries) {
    r -= Math.max(1, e.weight);
    if (r <= 0) return e;
  }
  return entries[entries.length - 1];
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesToBase64(buf: Uint8Array): string {
  let s = "";
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) {
    s += String.fromCharCode(...buf.subarray(i, i + chunk));
  }
  return btoa(s);
}
