import type { Chess } from "chess.js";
import { supabase } from "@/integrations/supabase/client";

export type Strength = "best" | "proportional" | "uniform" | "player";

export type PhaseConfig = {
  strength: Strength;
  pawnMove: number;
  advance: number;
  check: number;
  capture: number;
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
  opening: { enabled: boolean; maxDepth: number; book: string };
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
    opening: { enabled: !!op.enabled, maxDepth: Number(op.maxDepth ?? 0), book: String(op.book ?? "") },
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
  opening: { enabled: boolean; maxDepth: number; book: string };
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
    middlegame_settings: input.middlegame as unknown as Record<string, unknown>,
    endgame_settings: input.endgame as unknown as Record<string, unknown>,
    opening_settings: input.opening as unknown as Record<string, unknown>,
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

export function pickBotMove(
  game: Chess,
  bot: BotConfig | null,
): { from: string; to: string; promotion?: string; san: string } | null {
  const moves = game.moves({ verbose: true }) as VerboseMove[];
  if (moves.length === 0) return null;
  if (!bot) return moves[Math.floor(Math.random() * moves.length)];

  // Strict opening book up to maxDepth full moves
  if (bot.opening.enabled && bot.opening.book) {
    const ply = game.history().length;
    if (ply < bot.opening.maxDepth * 2) {
      const tokens = bot.opening.book
        .replace(/\{[^}]*\}/g, " ")
        .replace(/\([^)]*\)/g, " ")
        .split(/\s+/)
        .filter((t) => t && !/^\d+\.+$/.test(t) && !/^(1-0|0-1|1\/2-1\/2|\*)$/.test(t));
      const candidate = tokens[ply];
      if (candidate) {
        const norm = candidate.replace(/[+#]/g, "");
        const found = moves.find((m) => m.san === candidate || m.san.replace(/[+#]/g, "") === norm);
        if (found) return found;
      }
    }
  }

  const cfg = isEndgame(game) ? bot.endgame : bot.middlegame;

  // "player"/custom-uploaded weights: strictly weighted random selection
  if (cfg.strength === "uniform") return moves[Math.floor(Math.random() * moves.length)];

  const scored = moves.map((m) => ({ m, s: scoreMove(game, m, cfg) }));
  if (cfg.strength === "best") {
    scored.sort((a, b) => b.s - a.s);
    return scored[0].m;
  }
  // proportional + player → weighted random by user-uploaded multi-variable weights
  const total = scored.reduce((a, b) => a + b.s, 0);
  let r = Math.random() * total;
  for (const x of scored) {
    r -= x.s;
    if (r <= 0) return x.m;
  }
  return scored[scored.length - 1].m;
}

export const defaultPhase = (): PhaseConfig => ({
  strength: "player",
  pawnMove: 50,
  advance: 50,
  check: 50,
  capture: 50,
});
