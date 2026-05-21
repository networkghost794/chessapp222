import type { Chess } from "chess.js";
import { supabase } from "@/integrations/supabase/client";
import {
  base64ToBytes, lookupPolyglot, pickWeighted, polyglotHash, polyglotMoveToUci,
} from "./polyglot";
import { analyseTopMoves } from "./stockfishEngine";

export type Strength = "best" | "proportional" | "uniform" | "player";

export type PhaseConfig = {
  strength: Strength;
  pawnMove: number;
  advance: number;
  check: number;
  capture: number;
};

export type OpeningConfig = {
  enabled: boolean;
  /** Polyglot binary book stored as base64. */
  bookBin?: string;
  /** Original .bin file name for display. */
  bookName?: string;
};

export type BotConfig = {
  id: string;
  name: string;
  elo: number;
  avatar?: string;
  quote: string;
  category: "Intermediate" | "Master";
  middlegame: PhaseConfig;
  endgame: PhaseConfig;
  opening: OpeningConfig;
  createdAt: number;
  createdBy?: string | null;
  lifetimeWins?: number;
  lifetimeLosses?: number;
};

const KEY_ACTIVE = "ownerPortal.activeBot.v1";

let cache: BotConfig[] = [];
type Listener = () => void;
const listeners = new Set<Listener>();
const emit = () => listeners.forEach((l) => l());

export function subscribeBots(fn: Listener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function loadBots(): BotConfig[] {
  return cache;
}

function rowToBot(r: Record<string, unknown>): BotConfig {
  const mg = (r.middlegame_settings ?? {}) as Partial<PhaseConfig>;
  const eg = (r.endgame_settings ?? {}) as Partial<PhaseConfig>;
  const op = (r.opening_settings ?? {}) as Partial<BotConfig["opening"]>;
  return {
    id: String(r.id),
    name: String(r.name ?? "Bot"),
    elo: Number(r.elo ?? 1500),
    avatar: (r.profile_pic_url as string) ?? undefined,
    quote: String(r.quote ?? ""),
    category: (r.tier === "Master" ? "Master" : "Intermediate"),
    middlegame: { ...defaultPhase(), ...mg },
    endgame: { ...defaultPhase(), ...eg },
    opening: { enabled: !!op.enabled, bookBin: op.bookBin ? String(op.bookBin) : undefined, bookName: op.bookName ? String(op.bookName) : undefined },
    createdAt: r.created_at ? new Date(String(r.created_at)).getTime() : Date.now(),
    createdBy: (r.created_by as string) ?? null,
    lifetimeWins: Number(r.lifetime_wins ?? 0),
    lifetimeLosses: Number(r.lifetime_losses ?? 0),
  };
}

export async function refreshFromCloud(): Promise<BotConfig[]> {
  const { data, error } = await supabase
    .from("custom_bots")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) {
    console.warn("[botStore] refresh failed:", error.message);
    return cache;
  }
  cache = (data ?? []).map(rowToBot);
  emit();
  return cache;
}

export async function publishBot(input: {
  name: string;
  elo: number;
  avatarFile?: File | null;
  avatarDataUrl?: string;
  quote: string;
  category: "Intermediate" | "Master";
  middlegame: PhaseConfig;
  endgame: PhaseConfig;
  opening: OpeningConfig;
}): Promise<BotConfig | null> {
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) throw new Error("Sign in required to publish bots");

  let avatarUrl: string | undefined;
  if (input.avatarFile) {
    const ext = input.avatarFile.name.split(".").pop() || "png";
    const path = `${uid}/${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("bot-avatars").upload(path, input.avatarFile, { upsert: false });
    if (upErr) console.warn("[botStore] avatar upload failed:", upErr.message);
    else {
      const { data: pub } = supabase.storage.from("bot-avatars").getPublicUrl(path);
      avatarUrl = pub.publicUrl;
    }
  } else if (input.avatarDataUrl) {
    avatarUrl = input.avatarDataUrl;
  }

  const { data, error } = await supabase.from("custom_bots").insert({
    name: input.name,
    elo: input.elo,
    profile_pic_url: avatarUrl ?? null,
    quote: input.quote,
    tier: input.category,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    middlegame_settings: input.middlegame as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    endgame_settings: input.endgame as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    opening_settings: input.opening as any,
    created_by: uid,
  }).select("*").single();
  if (error) throw error;
  await refreshFromCloud();
  return data ? rowToBot(data) : null;
}

export async function deleteBot(id: string) {
  await supabase.from("custom_bots").delete().eq("id", id);
  if (getActiveBotId() === id) setActiveBotId(null);
  await refreshFromCloud();
}

export function getActiveBotId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(KEY_ACTIVE);
}

export function setActiveBotId(id: string | null) {
  if (typeof window === "undefined") return;
  if (id) localStorage.setItem(KEY_ACTIVE, id);
  else localStorage.removeItem(KEY_ACTIVE);
  emit();
}

export async function incrementBotLifetime(botId: string, wins: number, losses: number) {
  const { error } = await supabase.rpc("increment_bot_lifetime", {
    _bot_id: botId,
    _wins: wins,
    _losses: losses,
  });
  if (error) console.warn("[botStore] increment lifetime failed:", error.message);
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
  const board = game.board();
  let major = 0;
  for (const row of board) for (const sq of row) if (sq && sq.type !== "k" && sq.type !== "p") major++;
  return major <= 6;
}

function scoreMove(game: Chess, m: VerboseMove, cfg: PhaseConfig): number {
  let s = 1;
  if (m.piece === "p") s += cfg.pawnMove / 25;
  const fromRank = parseInt(m.from[1], 10);
  const toRank = parseInt(m.to[1], 10);
  const turn = game.turn();
  const advance = turn === "w" ? toRank - fromRank : fromRank - toRank;
  if (advance > 0 && m.piece !== "p") s += (cfg.advance / 25) * advance;
  if (m.captured) s += cfg.capture / 12;
  const test = game.move(m.san);
  if (test) {
    if (game.inCheck()) s += cfg.check / 12;
    game.undo();
  }
  return Math.max(0.001, s);
}

export type EngineMove = { from: string; to: string; promotion?: string; san: string };

function findLegalMove(game: Chess, uci: string): EngineMove | null {
  const from = uci.slice(0, 2);
  const to = uci.slice(2, 4);
  const promo = uci.length >= 5 ? uci[4] : undefined;
  const moves = game.moves({ verbose: true }) as VerboseMove[];
  return moves.find((m) => m.from === from && m.to === to && (promo ? m.promotion === promo : !m.promotion)) ?? null;
}

export function pickBotMove(game: Chess, bot: BotConfig | null): EngineMove | null {
  const moves = game.moves({ verbose: true }) as VerboseMove[];
  if (moves.length === 0) return null;
  if (!bot) return moves[Math.floor(Math.random() * moves.length)];
  const cfg = isEndgame(game) ? bot.endgame : bot.middlegame;
  if (cfg.strength === "uniform") return moves[Math.floor(Math.random() * moves.length)];
  const scored = moves.map((m) => ({ m, s: scoreMove(game, m, cfg) }));
  if (cfg.strength === "best") {
    scored.sort((a, b) => b.s - a.s);
    return scored[0].m;
  }
  const total = scored.reduce((a, b) => a + b.s, 0);
  let r = Math.random() * total;
  for (const x of scored) {
    r -= x.s;
    if (r <= 0) return x.m;
  }
  return scored[scored.length - 1].m;
}

/**
 * Async engine pick. 1) Polyglot opening book lookup. 2) Stockfish top-K moves
 * filtered by the bot's slider weights. 3) Sync fallback on engine failure.
 */
export async function chooseBotMove(
  game: Chess,
  bot: BotConfig | null,
): Promise<{ move: EngineMove; source: "book" | "engine" | "fallback" } | null> {
  const legal = game.moves({ verbose: true }) as VerboseMove[];
  if (legal.length === 0) return null;

  // 1) Polyglot opening book
  if (bot?.opening.enabled && bot.opening.bookBin) {
    try {
      const book = base64ToBytes(bot.opening.bookBin);
      const key = polyglotHash(game);
      const entries = lookupPolyglot(book, key);
      if (entries.length > 0) {
        const chosen = pickWeighted(entries);
        if (chosen) {
          const uci = polyglotMoveToUci(game, chosen.move);
          const found = findLegalMove(game, uci);
          if (found) return { move: found, source: "book" };
        }
      }
    } catch (e) {
      console.warn("[botStore] polyglot lookup failed:", e);
    }
  }

  // 2) Stockfish top-K, then weight-filter
  if (bot) {
    try {
      const cfg = isEndgame(game) ? bot.endgame : bot.middlegame;
      const multipv = Math.min(legal.length, 6);
      const depth = bot.category === "Master" ? 14 : 10;
      const top = await analyseTopMoves(game.fen(), { multipv, depth, elo: bot.elo });
      const candidates: { vm: VerboseMove; base: number }[] = [];
      top.forEach((tm, idx) => {
        const vm = legal.find((m) => m.from === tm.uci.slice(0, 2) && m.to === tm.uci.slice(2, 4)
          && ((tm.uci.length >= 5 ? tm.uci[4] : undefined) === m.promotion || (!m.promotion && tm.uci.length < 5)));
        if (vm) candidates.push({ vm, base: top.length - idx });
      });
      if (candidates.length > 0) {
        if (cfg.strength === "best") return { move: candidates[0].vm, source: "engine" };
        const scored = candidates.map((c) => ({ m: c.vm, s: c.base * scoreMove(game, c.vm, cfg) }));
        const total = scored.reduce((a, b) => a + b.s, 0);
        let r = Math.random() * total;
        for (const x of scored) {
          r -= x.s;
          if (r <= 0) return { move: x.m, source: "engine" };
        }
        return { move: scored[scored.length - 1].m, source: "engine" };
      }
    } catch (e) {
      console.warn("[botStore] stockfish unavailable:", e);
    }
  }

  // 3) Fallback heuristic
  const pick = pickBotMove(game, bot);
  return pick ? { move: pick, source: "fallback" } : null;
}

export const defaultPhase = (): PhaseConfig => ({
  strength: "player",
  pawnMove: 50,
  advance: 50,
  check: 50,
  capture: 50,
});
