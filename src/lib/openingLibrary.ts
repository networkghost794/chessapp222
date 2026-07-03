// Global opening library. Each opening is a short SAN main line (from ply 1).
// Bots reference these by `id` in their white/black repertoire.
// The opening line only *biases* candidate move selection in the opening
// phase (~first 10 plies) — it never overrides the strength / personality /
// mistake pipeline.

export type OpeningCategory =
  | "Open Games"
  | "Semi-Open Defenses"
  | "Closed Games"
  | "Indian Defenses"
  | "Flank Openings";

export type OpeningColor = "white" | "black" | "any";

export type OpeningDef = {
  id: string;
  name: string;
  category: OpeningCategory;
  /** Which side this opening is intended for. */
  color: OpeningColor;
  /** SAN main line starting at ply 1 (white move 1). */
  line: string[];
};

export const OPENING_LIBRARY: OpeningDef[] = [
  // ---------- Open Games (1.e4 e5) ----------
  { id: "italian", name: "Italian Game", category: "Open Games", color: "white",
    line: ["e4","e5","Nf3","Nc6","Bc4","Bc5","c3","Nf6","d3","d6"] },
  { id: "ruy_lopez", name: "Ruy Lopez", category: "Open Games", color: "white",
    line: ["e4","e5","Nf3","Nc6","Bb5","a6","Ba4","Nf6","O-O","Be7"] },
  { id: "scotch", name: "Scotch Game", category: "Open Games", color: "white",
    line: ["e4","e5","Nf3","Nc6","d4","exd4","Nxd4","Nf6","Nc3","Bb4"] },
  { id: "four_knights", name: "Four Knights Game", category: "Open Games", color: "white",
    line: ["e4","e5","Nf3","Nc6","Nc3","Nf6","Bb5","Bb4","O-O","O-O"] },
  { id: "vienna", name: "Vienna Game", category: "Open Games", color: "white",
    line: ["e4","e5","Nc3","Nf6","Bc4","Nxe4","Qh5","Nd6","Bb3","Nc6"] },
  { id: "bishops_opening", name: "Bishop's Opening", category: "Open Games", color: "white",
    line: ["e4","e5","Bc4","Nf6","d3","Nc6","Nf3","Bc5","O-O","d6"] },
  { id: "kings_gambit", name: "King's Gambit", category: "Open Games", color: "white",
    line: ["e4","e5","f4","exf4","Nf3","g5","Bc4","Bg7","d4","d6"] },
  { id: "center_game", name: "Center Game", category: "Open Games", color: "white",
    line: ["e4","e5","d4","exd4","Qxd4","Nc6","Qe3","Nf6","Nc3","Bb4"] },

  // ---------- Semi-Open Defenses (Black) ----------
  { id: "sicilian", name: "Sicilian Defense", category: "Semi-Open Defenses", color: "black",
    line: ["e4","c5","Nf3","d6","d4","cxd4","Nxd4","Nf6","Nc3","a6"] },
  { id: "french", name: "French Defense", category: "Semi-Open Defenses", color: "black",
    line: ["e4","e6","d4","d5","Nc3","Nf6","Bg5","Be7","e5","Nfd7"] },
  { id: "caro_kann", name: "Caro-Kann Defense", category: "Semi-Open Defenses", color: "black",
    line: ["e4","c6","d4","d5","Nc3","dxe4","Nxe4","Bf5","Ng3","Bg6"] },
  { id: "scandinavian", name: "Scandinavian Defense", category: "Semi-Open Defenses", color: "black",
    line: ["e4","d5","exd5","Qxd5","Nc3","Qa5","d4","Nf6","Nf3","c6"] },
  { id: "alekhine", name: "Alekhine Defense", category: "Semi-Open Defenses", color: "black",
    line: ["e4","Nf6","e5","Nd5","d4","d6","Nf3","Bg4","Be2","e6"] },
  { id: "pirc", name: "Pirc Defense", category: "Semi-Open Defenses", color: "black",
    line: ["e4","d6","d4","Nf6","Nc3","g6","Nf3","Bg7","Be2","O-O"] },
  { id: "modern", name: "Modern Defense", category: "Semi-Open Defenses", color: "black",
    line: ["e4","g6","d4","Bg7","Nc3","d6","Nf3","Nf6","Be2","O-O"] },
  { id: "owens", name: "Owen's Defense", category: "Semi-Open Defenses", color: "black",
    line: ["e4","b6","d4","Bb7","Bd3","e6","Nf3","Nf6","Nc3","d6"] },

  // ---------- Closed Games (1.d4 d5) ----------
  { id: "queens_gambit", name: "Queen's Gambit", category: "Closed Games", color: "white",
    line: ["d4","d5","c4","e6","Nc3","Nf6","Bg5","Be7","Nf3","O-O"] },
  { id: "london", name: "London System", category: "Closed Games", color: "white",
    line: ["d4","d5","Nf3","Nf6","Bf4","c5","e3","Nc6","c3","Bf5"] },
  { id: "colle", name: "Colle System", category: "Closed Games", color: "white",
    line: ["d4","d5","Nf3","Nf6","e3","e6","Bd3","c5","c3","Nc6"] },
  { id: "catalan", name: "Catalan Opening", category: "Closed Games", color: "white",
    line: ["d4","Nf6","c4","e6","g3","d5","Bg2","Be7","Nf3","O-O"] },
  { id: "trompowsky", name: "Trompowsky Attack", category: "Closed Games", color: "white",
    line: ["d4","Nf6","Bg5","Ne4","Bf4","c5","f3","Nf6","d5","Qb6"] },
  { id: "torre", name: "Torre Attack", category: "Closed Games", color: "white",
    line: ["d4","Nf6","Nf3","e6","Bg5","c5","e3","cxd4","exd4","Be7"] },
  { id: "stonewall", name: "Stonewall Attack", category: "Closed Games", color: "white",
    line: ["d4","d5","e3","Nf6","Bd3","c5","c3","Nc6","f4","Bg4"] },

  // ---------- Indian Defenses (Black vs 1.d4) ----------
  { id: "kings_indian", name: "King's Indian Defense", category: "Indian Defenses", color: "black",
    line: ["d4","Nf6","c4","g6","Nc3","Bg7","e4","d6","Nf3","O-O"] },
  { id: "queens_indian", name: "Queen's Indian Defense", category: "Indian Defenses", color: "black",
    line: ["d4","Nf6","c4","e6","Nf3","b6","g3","Bb7","Bg2","Be7"] },
  { id: "nimzo_indian", name: "Nimzo-Indian Defense", category: "Indian Defenses", color: "black",
    line: ["d4","Nf6","c4","e6","Nc3","Bb4","e3","O-O","Bd3","d5"] },
  { id: "grunfeld", name: "Grünfeld Defense", category: "Indian Defenses", color: "black",
    line: ["d4","Nf6","c4","g6","Nc3","d5","cxd5","Nxd5","e4","Nxc3"] },
  { id: "benoni", name: "Benoni Defense", category: "Indian Defenses", color: "black",
    line: ["d4","Nf6","c4","c5","d5","e6","Nc3","exd5","cxd5","d6"] },
  { id: "benko", name: "Benko Gambit", category: "Indian Defenses", color: "black",
    line: ["d4","Nf6","c4","c5","d5","b5","cxb5","a6","bxa6","Bxa6"] },
  { id: "bogo_indian", name: "Bogo-Indian Defense", category: "Indian Defenses", color: "black",
    line: ["d4","Nf6","c4","e6","Nf3","Bb4+","Bd2","Qe7","g3","Nc6"] },

  // ---------- Flank Openings (White) ----------
  { id: "english", name: "English Opening", category: "Flank Openings", color: "white",
    line: ["c4","e5","Nc3","Nf6","Nf3","Nc6","g3","d5","cxd5","Nxd5"] },
  { id: "reti", name: "Réti Opening", category: "Flank Openings", color: "white",
    line: ["Nf3","d5","c4","e6","g3","Nf6","Bg2","Be7","O-O","O-O"] },
  { id: "birds", name: "Bird's Opening", category: "Flank Openings", color: "white",
    line: ["f4","d5","Nf3","Nf6","e3","g6","Be2","Bg7","O-O","O-O"] },
  { id: "larsen", name: "Larsen's Opening", category: "Flank Openings", color: "white",
    line: ["b3","e5","Bb2","Nc6","e3","Nf6","Bb5","Bd6","Na3","O-O"] },
  { id: "grob", name: "Grob Opening", category: "Flank Openings", color: "white",
    line: ["g4","d5","Bg2","c6","g5","e5","d3","Bd6","Nc3","Ne7"] },
];

export const OPENINGS_BY_ID: Record<string, OpeningDef> =
  Object.fromEntries(OPENING_LIBRARY.map((o) => [o.id, o]));

export function openingsForColor(color: "white" | "black"): OpeningDef[] {
  return OPENING_LIBRARY.filter((o) => o.color === color || o.color === "any");
}

/**
 * Given a chosen opening and the current SAN history, return the next book
 * SAN move for the side to move, or null if the game has already left theory
 * or the opening has been exhausted.
 */
export function nextBookMove(opening: OpeningDef, historySan: string[]): string | null {
  if (historySan.length >= opening.line.length) return null;
  for (let i = 0; i < historySan.length; i++) {
    if (historySan[i] !== opening.line[i]) return null;
  }
  return opening.line[historySan.length];
}
