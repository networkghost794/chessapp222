import type { Chess } from "chess.js";

// Built-in opening repertoire. Each bot gets 5-6 real openings
// (derived from its id) and picks a different one each game.
export interface Opening {
  id: string;
  name: string;
  side: "w" | "b";
  moves: string[];
}

const L = (id: string, name: string, side: "w" | "b", line: string): Opening => ({
  id,
  name,
  side,
  moves: line.split(" "),
});

export const OPENINGS: Opening[] = [
  // White
  L("italian", "Italian Game", "w", "e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d3 d6 O-O O-O"),
  L("ruy", "Ruy Lopez", "w", "e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 d6"),
  L("scotch", "Scotch Game", "w", "e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Nf6 Nxc6 bxc6 e5"),
  L("vienna", "Vienna Game", "w", "e4 e5 Nc3 Nf6 f4 d5 fxe5 Nxe4 Nf3"),
  L("qgd", "Queen's Gambit", "w", "d4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O Nf3"),
  L("london", "London System", "w", "d4 d5 Bf4 Nf6 e3 e6 Nf3 c5 c3 Nc6 Nbd2"),
  L("english", "English Opening", "w", "c4 e5 Nc3 Nf6 g3 d5 cxd5 Nxd5 Bg2 Nb6 Nf3"),
  L("kia", "King's Indian Attack", "w", "Nf3 d5 g3 Nf6 Bg2 e6 O-O Be7 d3 O-O Nbd2"),
  L("opensic", "Open Sicilian", "w", "e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Be3"),
  L("catalan", "Catalan", "w", "d4 Nf6 c4 e6 g3 d5 Bg2 Be7 Nf3 O-O O-O"),
  // Black
  L("najdorf", "Sicilian Najdorf", "b", "e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6"),
  L("dragon", "Sicilian Dragon", "b", "e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6 Be3 Bg7"),
  L("french", "French Defense", "b", "e4 e6 d4 d5 Nc3 Nf6 Bg5 Be7 e5 Nfd7"),
  L("caro", "Caro-Kann", "b", "e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5 Ng3 Bg6"),
  L("scandi", "Scandinavian", "b", "e4 d5 exd5 Qxd5 Nc3 Qa5 d4 Nf6 Nf3 c6"),
  L("opengame", "Open Game 1...e5", "b", "e4 e5 Nf3 Nc6 Bc4 Nf6 d3 Be7 O-O O-O"),
  L("berlin", "Berlin Defense", "b", "e4 e5 Nf3 Nc6 Bb5 Nf6 O-O Nxe4 d4 Nd6"),
  L("kid", "King's Indian Defense", "b", "d4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3 O-O Be2 e5"),
  L("nimzo", "Nimzo-Indian", "b", "d4 Nf6 c4 e6 Nc3 Bb4 e3 O-O Bd3 d5"),
  L("slav", "Slav Defense", "b", "d4 d5 c4 c6 Nf3 Nf6 Nc3 dxc4 a4 Bf5"),
  L("qgdb", "Queen's Gambit Declined", "b", "d4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O"),
  L("grunfeld", "Grunfeld", "b", "d4 Nf6 c4 g6 Nc3 d5 cxd5 Nxd5 e4 Nxc3 bxc3 Bg7"),
  L("dutch", "Dutch Defense", "b", "d4 f5 g3 Nf6 Bg2 e6 Nf3 Be7 O-O O-O"),
  L("revenglish", "Reversed Sicilian", "b", "c4 e5 Nc3 Nf6 g3 d5 cxd5 Nxd5 Bg2 Nb6"),
  L("vsnf3", "Solid vs 1.Nf3", "b", "Nf3 d5 g3 Nf6 Bg2 c6 O-O Bg4"),
];

function hash(s: string) {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

/** 3 White + 3 Black openings per bot, stable per bot id. Black always keeps a reply to e4 and d4. */
export function botRepertoire(botId: string): Opening[] {
  const pick = (list: Opening[], n: number, salt: string) =>
    [...list].sort((a, b) => hash(botId + salt + a.id) - hash(botId + salt + b.id)).slice(0, n);
  const white = pick(
    OPENINGS.filter((o) => o.side === "w"),
    3,
    "w",
  );
  const bE4 = pick(
    OPENINGS.filter((o) => o.side === "b" && o.moves[0] === "e4"),
    1,
    "e",
  );
  const bD4 = pick(
    OPENINGS.filter((o) => o.side === "b" && o.moves[0] === "d4"),
    1,
    "d",
  );
  const bOther = pick(
    OPENINGS.filter((o) => o.side === "b" && !bE4.includes(o) && !bD4.includes(o)),
    1,
    "x",
  );
  return [...white, ...bE4, ...bD4, ...bOther];
}

/** How many plies of theory a bot knows, scaled by Elo. */
export function theoryDepth(elo: number) {
  if (elo < 900) return 4 + Math.floor(Math.random() * 3);
  if (elo < 1600) return 8 + Math.floor(Math.random() * 5);
  if (elo < 2200) return 14 + Math.floor(Math.random() * 5);
  return 18 + Math.floor(Math.random() * 6);
}

const gameState = new Map<string, { opening: string; depth: number }>();
const lastPlayed = new Map<string, string[]>();

/** Returns the next theory move (SAN) for this bot, or null when out of book. */
export function repertoireMove(game: Chess, botId: string, elo: number): string | null {
  const hist = game.history();
  const side = game.turn();
  const rep = botRepertoire(botId).filter((o) => o.side === side);
  const key = botId + side;
  let st = gameState.get(key);
  if (hist.length <= 1 || !st) {
    // New game: choose an opening that fits, avoiding the last couple played.
    const recent = lastPlayed.get(key) ?? [];
    const fits = rep.filter((o) => o.moves.slice(0, hist.length).join(" ") === hist.join(" "));
    const fresh = fits.filter((o) => !recent.includes(o.id));
    const pool = fresh.length ? fresh : fits;
    if (!pool.length) return null;
    const chosen = pool[Math.floor(Math.random() * pool.length)];
    st = { opening: chosen.id, depth: theoryDepth(elo) };
    gameState.set(key, st);
    lastPlayed.set(key, [chosen.id, ...recent].slice(0, 2));
  }
  if (hist.length >= st.depth) return null;
  const prefix = hist.join(" ");
  const matches = (o: Opening) =>
    o.moves.length > hist.length && o.moves.slice(0, hist.length).join(" ") === prefix;
  const chosen = OPENINGS.find((o) => o.id === st!.opening);
  // Follow the chosen line; if the opponent deviated, use any known line that still fits.
  const line =
    chosen && matches(chosen)
      ? chosen
      : [...rep, ...OPENINGS.filter((o) => o.side === side)].find(matches);
  return line ? line.moves[hist.length] : null;
}

/**
 * 3800+ Master Aggressive Tactical Repertoire.
 * Ultra-sharp, decisive Grandmaster attack lines that seize the initiative,
 * attack the enemy king, and force tactical complications where engines thrive.
 */
export const AGGRESSIVE_TACTICAL_OPENINGS: Opening[] = [
  // White sharp attack repertoires
  L("evans", "Evans Gambit Sharp", "w", "e4 e5 Nf3 Nc6 Bc4 Bc5 b4 Bxb4 c3 Ba5 d4 exd4 O-O d6 Qb3"),
  L(
    "kingsgambit",
    "King's Gambit Accepted",
    "w",
    "e4 e5 f4 exf4 Nf3 g5 h4 g4 Ne5 Nf6 d4 d6 Nd3 Nxe4 Bxf4",
  ),
  L(
    "sicilian_english",
    "Open Sicilian English Attack",
    "w",
    "e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Be3 e5 Nb3 Be6 f3 Be7 Qd2 O-O O-O-O",
  ),
  L(
    "sicilian_yugoslav",
    "Sicilian Dragon Yugoslav Attack",
    "w",
    "e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6 Be3 Bg7 f3 O-O Qd2 Nc6 Bc4 Bd7 O-O-O Rc8 Bb3",
  ),
  L(
    "french_winawer",
    "French Winawer Poisoned Pawn",
    "w",
    "e4 e6 d4 d5 Nc3 Bb4 e5 c5 a3 Bxc3+ bxc3 Ne7 Qg4 Qc7 Qxg7 Rg8 Qxh7",
  ),
  L(
    "caro_tal",
    "Caro-Kann Tal Attack",
    "w",
    "e4 c6 d4 d5 e5 Bf5 h4 h5 c4 e6 Nc3 Nd7 Nge2 dxc4 Ng3",
  ),
  L(
    "scotch_gambit",
    "Scotch Gambit Mieses",
    "w",
    "e4 e5 Nf3 Nc6 d4 exd4 Bc4 Nf6 e5 d5 Bb5 Ne4 Nxd4 Bd7 Bxc6 bxc6 O-O Bc5",
  ),
  L(
    "semi_slav_botvinnik",
    "Semi-Slav Botvinnik Variation",
    "w",
    "d4 d5 c4 c6 Nf3 Nf6 Nc3 e6 Bg5 dxc4 e4 b5 e5 h6 Bh4 g5 Nxg5 hxg5 Bxg5 Nbd7",
  ),
  // Black counter-attacking repertoires
  L(
    "najdorf_sharp",
    "Sicilian Najdorf Poisoned Pawn",
    "b",
    "e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Bg5 e6 f4 Qb6 Qd2 Qxb2",
  ),
  L(
    "dragon_sharp",
    "Sicilian Dragon Chinese Variation",
    "b",
    "e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6 Be3 Bg7 f3 O-O Qd2 Nc6 Bc4 Bd7 O-O-O Rc8 Bb3 Ne5 h4 h5",
  ),
  L(
    "kid_mar_del_plata",
    "King's Indian Mar del Plata",
    "b",
    "d4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3 O-O Be2 e5 O-O Nc6 d5 Ne7 Ne1 Nd7 Be3 f5 f3 f4 Bf2 g5",
  ),
  L(
    "grunfeld_exchange",
    "Grunfeld Exchange Attack",
    "b",
    "d4 Nf6 c4 g6 Nc3 d5 cxd5 Nxd5 e4 Nxc3 bxc3 Bg7 Bc4 c5 Ne2 O-O O-O Nc6 Be3 Bg4 f3 Na5",
  ),
  L(
    "two_knights_counter",
    "Two Knights Fried Liver Counter",
    "b",
    "e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5 exd5 Na5 Bb5+ c6 dxc6 bxc6 Bd3 Nd5 Nf3 Bd6",
  ),
];

export function aggressiveTacticalMove(game: Chess): string | null {
  const hist = game.history();
  if (hist.length >= 24) return null;
  const side = game.turn();
  const prefix = hist.join(" ");
  const match = AGGRESSIVE_TACTICAL_OPENINGS.find(
    (o) =>
      o.side === side &&
      o.moves.length > hist.length &&
      o.moves.slice(0, hist.length).join(" ") === prefix,
  );
  return match ? match.moves[hist.length] : null;
}
