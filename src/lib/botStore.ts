import type { Chess } from "chess.js";

export type Strength =
  | "best"
  | "proportional"
  | "uniform"
  | "player";

export type PhaseConfig = {
  strength: Strength;
  pawnMove: number; // 0..100 bias
  advance: number;
  check: number;
  capture: number;
};

export type BotConfig = {
  id: string;
  name: string;
  elo: number;
  avatar?: string; // data URL
  quote: string;
  category: "Intermediate" | "Master";
  middlegame: PhaseConfig;
  endgame: PhaseConfig;
  opening: {
    enabled: boolean;
    maxDepth: number;
    book: string; // raw PGN/text
  };
  createdAt: number;
};

const KEY_BOTS = "ownerPortal.bots.v1";
const KEY_ACTIVE = "ownerPortal.activeBot.v1";

type Listener = () => void;
const listeners = new Set<Listener>();
export function subscribeBots(fn: Listener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
function emit() {
  listeners.forEach((l) => l());
}

export function loadBots(): BotConfig[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY_BOTS);
    return raw ? (JSON.parse(raw) as BotConfig[]) : [];
  } catch {
    return [];
  }
}

export function saveBot(bot: BotConfig) {
  const all = loadBots().filter((b) => b.id !== bot.id);
  all.push(bot);
  localStorage.setItem(KEY_BOTS, JSON.stringify(all));
  emit();
}

export function deleteBot(id: string) {
  const all = loadBots().filter((b) => b.id !== id);
  localStorage.setItem(KEY_BOTS, JSON.stringify(all));
  if (getActiveBotId() === id) setActiveBotId(null);
  emit();
}

export function getActiveBotId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(KEY_ACTIVE);
}

export function setActiveBotId(id: string | null) {
  if (id) localStorage.setItem(KEY_ACTIVE, id);
  else localStorage.removeItem(KEY_ACTIVE);
  emit();
}

// ---------- Engine: biased move selection ----------

type VerboseMove = {
  from: string;
  to: string;
  promotion?: string;
  san: string;
  piece: string;
  captured?: string;
  flags: string;
};

function isEndgame(game: Chess): boolean {
  // count non-king, non-pawn material
  const board = game.board();
  let major = 0;
  for (const row of board) {
    for (const sq of row) {
      if (sq && sq.type !== "k" && sq.type !== "p") major++;
    }
  }
  return major <= 6;
}

function scoreMove(game: Chess, m: VerboseMove, cfg: PhaseConfig): number {
  let s = 1;
  if (m.piece === "p") s += cfg.pawnMove / 25;
  // advance: any move that increases rank toward opponent
  const fromRank = parseInt(m.from[1], 10);
  const toRank = parseInt(m.to[1], 10);
  const turn = game.turn();
  const advance = turn === "w" ? toRank - fromRank : fromRank - toRank;
  if (advance > 0 && m.piece !== "p") s += (cfg.advance / 25) * advance;
  if (m.captured) s += cfg.capture / 12;
  // check detection: simulate
  const test = game.move(m.san);
  if (test) {
    if (game.inCheck()) s += cfg.check / 12;
    game.undo();
  }
  return Math.max(0.001, s);
}

export function pickBotMove(
  game: Chess,
  bot: BotConfig | null,
): { from: string; to: string; promotion?: string; san: string } | null {
  const moves = game.moves({ verbose: true }) as VerboseMove[];
  if (moves.length === 0) return null;
  if (!bot) {
    return moves[Math.floor(Math.random() * moves.length)];
  }

  // Opening book (very simple: pick first legal move appearing in book text)
  if (bot.opening.enabled && bot.opening.book) {
    const ply = game.history().length;
    if (ply < bot.opening.maxDepth * 2) {
      const tokens = bot.opening.book
        .replace(/\{[^}]*\}/g, " ")
        .replace(/\([^)]*\)/g, " ")
        .split(/\s+/)
        .filter((t) => t && !/^\d+\.+$/.test(t) && !/^(1-0|0-1|1\/2-1\/2|\*)$/.test(t));
      // Walk through history and try to find current position in book
      // Simple: try san match at position ply
      const candidate = tokens[ply];
      if (candidate) {
        const found = moves.find((m) => m.san === candidate || m.san.replace(/[+#]/g, "") === candidate.replace(/[+#]/g, ""));
        if (found) return found;
      }
    }
  }

  const cfg = isEndgame(game) ? bot.endgame : bot.middlegame;

  if (cfg.strength === "uniform") {
    return moves[Math.floor(Math.random() * moves.length)];
  }
  if (cfg.strength === "player") {
    // No human input here; treat as uniform random
    return moves[Math.floor(Math.random() * moves.length)];
  }
  const scored = moves.map((m) => ({ m, s: scoreMove(game, m, cfg) }));
  if (cfg.strength === "best") {
    scored.sort((a, b) => b.s - a.s);
    return scored[0].m;
  }
  // proportional
  const total = scored.reduce((a, b) => a + b.s, 0);
  let r = Math.random() * total;
  for (const x of scored) {
    r -= x.s;
    if (r <= 0) return x.m;
  }
  return scored[scored.length - 1].m;
}

export const defaultPhase = (): PhaseConfig => ({
  strength: "best",
  pawnMove: 50,
  advance: 50,
  check: 50,
  capture: 50,
});
