import type { Chess } from "chess.js";
import { supabase } from "@/integrations/supabase/client";
import {
  base64ToBytes, lookupPolyglot, pickWeighted, polyglotHash, polyglotMoveToUci,
} from "./polyglot";
import { analyseTopMoves, type TopMove } from "./stockfishEngine";

// ---------- Lucas Chess–style personality types ----------

/** Strength bucket — how far from optimal moves may deviate, in centipawns. */
export type StrengthBucket =
  | "best"
  | "better_pp"
  | "better_p"
  | "better"
  | "similar"
  | "worse"
  | "worse_m"
  | "worse_mm"
  | "worst";

/** Legacy alias kept so older imports still type-check. */
export type Strength = StrengthBucket;

/** Tunable deviation map (centipawn loss tolerated vs best). Editable per bot via portal. */
export type BucketMap = Record<StrengthBucket, number>;
export const DEFAULT_BUCKET_MAP: BucketMap = {
  best: 0,
  better_pp: 10,
  better_p: 25,
  better: 50,
  similar: 90,
  worse: 150,
  worse_m: 230,
  worse_mm: 330,
  worst: 9999,
};

export const STRENGTH_LABELS: { value: StrengthBucket; label: string }[] = [
  { value: "best", label: "Best move" },
  { value: "better_pp", label: "Somewhat better ++" },
  { value: "better_p", label: "Somewhat better +" },
  { value: "better", label: "Somewhat better" },
  { value: "similar", label: "Similar to player" },
  { value: "worse", label: "Somewhat worse" },
  { value: "worse_m", label: "Somewhat worse -" },
  { value: "worse_mm", label: "Somewhat worse --" },
  { value: "worst", label: "Worst move" },
];

/** Move-style sliders (0–100). Drive which moves enter the candidate pool. */
export type MoveStyle = {
  pawnAdvance: number;
  pieceDevelopment: number;
  capture: number;
  check: number;
  kingSafety: number;
  positional: number;
};
export const defaultMoveStyle = (): MoveStyle => ({
  pawnAdvance: 50,
  pieceDevelopment: 50,
  capture: 50,
  check: 50,
  kingSafety: 50,
  positional: 50,
});

/** Lucas Chess–style "in the expected moves" long-term tendencies (0–100). */
export type ExpectedMoves = {
  keepBishopPair: number;
  advance: number;
  check: number;
  capture: number;
};
export const defaultExpectedMoves = (): ExpectedMoves => ({
  keepBishopPair: 45,
  advance: 20,
  check: 10,
  capture: 5,
});

/** Per-phase config combines bucket selection and move-style weights. */
export type PhaseConfig = {
  /** Lucas Chess strength bucket. */
  strength: StrengthBucket;
  /** Move type weights for this phase ("in the next move"). */
  style: MoveStyle;
  /** "In the expected moves" — long-term strategic tendencies. */
  expected: ExpectedMoves;
  // legacy fields retained for backward compatibility with old saved JSON
  pawnMove?: number;
  advance?: number;
  check?: number;
  capture?: number;
};

/** Hard-override error rules — always evaluated first. */
export type ErrorRules = {
  forceMate: boolean;
  maxCpLoss: number;            // 0 = disabled
  noBlunderWhenWinning: boolean;
  winningThresholdCp: number;   // when own eval ≥ this, restrict big losses
  winningMaxLossCp: number;     // max allowed loss in winning positions
};
export const defaultErrorRules = (): ErrorRules => ({
  forceMate: true,
  maxCpLoss: 150,
  noBlunderWhenWinning: true,
  winningThresholdCp: 250,
  winningMaxLossCp: 60,
});

/** Opening book settings (Polyglot .bin). */
export type OpeningConfig = {
  enabled: boolean;
  bookBin?: string;        // base64
  bookName?: string;
  mode: "best" | "proportional" | "uniform" | "player";
  influence: number;        // 0–100 — % chance to actually use a book move when found
};
export const defaultOpening = (): OpeningConfig => ({
  enabled: false,
  mode: "proportional",
  influence: 100,
});

/** Endgame transition threshold — max non-king/non-pawn material count. */
export type EndgameTrigger = { maxMajorMinor: number };
export const defaultEndgameTrigger = (): EndgameTrigger => ({ maxMajorMinor: 6 });

export type BotCategory =
  | "Beginner"
  | "Intermediate"
  | "Advanced"
  | "Master"
  | "SpecialEvent"
  | "TopPlayer";

export const BOT_CATEGORIES: { value: BotCategory; label: string }[] = [
  { value: "Beginner", label: "Beginner Bots" },
  { value: "Intermediate", label: "Intermediate Bots" },
  { value: "Advanced", label: "Advanced Bots" },
  { value: "Master", label: "Master Bots" },
  { value: "SpecialEvent", label: "Special Event Bots" },
  { value: "TopPlayer", label: "Top Player Bots" },
];

export type BotConfig = {
  id: string;
  name: string;
  /** Cosmetic only — never influences move selection or rating changes. */
  elo: number;
  avatar?: string;
  quote: string;
  category: BotCategory;
  middlegame: PhaseConfig;
  endgame: PhaseConfig;
  opening: OpeningConfig;
  errorRules: ErrorRules;
  endgameTrigger: EndgameTrigger;
  bucketMap: BucketMap;
  dialogueLines: string[];
  createdAt: number;
  createdBy?: string | null;
  lifetimeWins?: number;
  lifetimeLosses?: number;
};

export const defaultPhase = (): PhaseConfig => ({
  strength: "similar",
  style: defaultMoveStyle(),
  expected: defaultExpectedMoves(),
});

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

function migratePhase(raw: Partial<PhaseConfig> | undefined): PhaseConfig {
  const r = raw ?? {};
  const style: MoveStyle = {
    ...defaultMoveStyle(),
    ...(r.style ?? {}),
    // back-fill from legacy keys
    pawnAdvance: r.style?.pawnAdvance ?? (r as { pawnMove?: number }).pawnMove ?? 50,
    pieceDevelopment: r.style?.pieceDevelopment ?? (r as { advance?: number }).advance ?? 50,
    capture: r.style?.capture ?? (r as { capture?: number }).capture ?? 50,
    check: r.style?.check ?? (r as { check?: number }).check ?? 50,
  };
  const legalBuckets: StrengthBucket[] = STRENGTH_LABELS.map((s) => s.value);
  const s = (r.strength as StrengthBucket) ?? "similar";
  return {
    strength: legalBuckets.includes(s) ? s : "similar",
    style,
    expected: { ...defaultExpectedMoves(), ...((r as { expected?: Partial<ExpectedMoves> }).expected ?? {}) },
  };
}

function rowToBot(r: Record<string, unknown>): BotConfig {
  const mg = (r.middlegame_settings ?? {}) as Partial<PhaseConfig>;
  const eg = (r.endgame_settings ?? {}) as Partial<PhaseConfig>;
  const op = (r.opening_settings ?? {}) as Partial<OpeningConfig> & {
    errorRules?: Partial<ErrorRules>;
    endgameTrigger?: Partial<EndgameTrigger>;
    bucketMap?: Partial<BucketMap>;
  };
  return {
    id: String(r.id),
    name: String(r.name ?? "Bot"),
    elo: Number(r.elo ?? 1500),
    avatar: (r.profile_pic_url as string) ?? undefined,
    quote: String(r.quote ?? ""),
    category: (BOT_CATEGORIES.find((c) => c.value === r.tier)?.value ?? "Intermediate"),
    middlegame: migratePhase(mg),
    endgame: migratePhase(eg),
    opening: {
      ...defaultOpening(),
      ...op,
      enabled: !!op.enabled,
      bookBin: op.bookBin ? String(op.bookBin) : undefined,
      bookName: op.bookName ? String(op.bookName) : undefined,
      mode: (op.mode as OpeningConfig["mode"]) ?? "proportional",
      influence: typeof op.influence === "number" ? op.influence : 100,
    },
    errorRules: { ...defaultErrorRules(), ...(op.errorRules ?? {}) },
    endgameTrigger: { ...defaultEndgameTrigger(), ...(op.endgameTrigger ?? {}) },
    bucketMap: { ...DEFAULT_BUCKET_MAP, ...(op.bucketMap ?? {}) },
    dialogueLines: Array.isArray(r.dialogue_lines) ? (r.dialogue_lines as string[]).filter((x) => typeof x === "string") : [],
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
  category: BotCategory;
  dialogueLines?: string[];
  middlegame: PhaseConfig;
  endgame: PhaseConfig;
  opening: OpeningConfig;
  errorRules: ErrorRules;
  endgameTrigger: EndgameTrigger;
  bucketMap: BucketMap;
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

  // Pack extras into opening_settings jsonb so no migration is required.
  const openingPayload = {
    ...input.opening,
    errorRules: input.errorRules,
    endgameTrigger: input.endgameTrigger,
    bucketMap: input.bucketMap,
  };

  const insertPayload = {
    name: input.name,
    elo: input.elo,
    profile_pic_url: avatarUrl ?? null,
    quote: input.quote,
    tier: input.category,
    middlegame_settings: input.middlegame,
    endgame_settings: input.endgame,
    opening_settings: openingPayload,
    dialogue_lines: (input.dialogueLines ?? []).filter((s) => s.trim().length > 0),
    created_by: uid,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await supabase.from("custom_bots").insert(insertPayload as any).select("*").single();
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

// =================================================================
//  Lucas Chess–style move-selection pipeline
// =================================================================

type VerboseMove = {
  from: string;
  to: string;
  promotion?: string;
  san: string;
  piece: string;
  captured?: string;
  flags: string;
};

export type MoveClass = {
  isPawn: boolean;
  isCapture: boolean;
  isCheck: boolean;
  isDevelopment: boolean;
  isKingSafety: boolean;
  isPositional: boolean;
  advance: number;
};

function classifyMove(game: Chess, m: VerboseMove): MoveClass {
  const fromRank = parseInt(m.from[1], 10);
  const toRank = parseInt(m.to[1], 10);
  const turn = game.turn();
  const advance = turn === "w" ? toRank - fromRank : fromRank - toRank;

  const fromFile = m.from.charCodeAt(0) - 97;
  const isMinor = m.piece === "n" || m.piece === "b";
  const homeRank = turn === "w" ? 1 : 8;
  const isDevelopment = isMinor && fromRank === homeRank;

  // king-safety = castling, or moves of king toward corner files
  const isCastle = m.flags.includes("k") || m.flags.includes("q");
  const isKingSafety = isCastle || (m.piece === "k" && Math.abs(fromFile - (m.to.charCodeAt(0) - 97)) >= 1);

  // probe check
  let isCheck = false;
  const t = game.move(m.san);
  if (t) { isCheck = game.inCheck(); game.undo(); }

  const isCapture = !!m.captured;
  // "positional" = quiet, non-development, non-pawn-shove
  const isPositional = !isCapture && !isCheck && !isDevelopment && m.piece !== "p" && !isCastle;

  return {
    isPawn: m.piece === "p",
    isCapture,
    isCheck,
    isDevelopment,
    isKingSafety,
    isPositional,
    advance: Math.max(0, advance),
  };
}

/** Style score in [0,∞). Higher = more in-character for this bot. */
function styleScore(cls: MoveClass, style: MoveStyle): number {
  let s = 0.5; // baseline so unmatched moves are still possible
  if (cls.isPawn) s += style.pawnAdvance / 50;
  if (cls.isDevelopment) s += style.pieceDevelopment / 40;
  if (cls.isCapture) s += style.capture / 35;
  if (cls.isCheck) s += style.check / 35;
  if (cls.isKingSafety) s += style.kingSafety / 30;
  if (cls.isPositional) s += style.positional / 60;
  if (cls.advance > 0 && !cls.isPawn) s += (style.pieceDevelopment / 120) * cls.advance;
  return Math.max(0.01, s);
}

function isEndgame(game: Chess, trigger: EndgameTrigger): boolean {
  const board = game.board();
  let mm = 0;
  for (const row of board) for (const sq of row) if (sq && sq.type !== "k" && sq.type !== "p") mm++;
  return mm <= trigger.maxMajorMinor;
}

export type EngineMove = { from: string; to: string; promotion?: string; san: string };

function findLegalMove(game: Chess, uci: string): EngineMove | null {
  const from = uci.slice(0, 2);
  const to = uci.slice(2, 4);
  const promo = uci.length >= 5 ? uci[4] : undefined;
  const moves = game.moves({ verbose: true }) as VerboseMove[];
  return moves.find((m) => m.from === from && m.to === to && (promo ? m.promotion === promo : !m.promotion)) ?? null;
}

/** Legacy export retained for callers/tests; uses style weights only, no engine. */
export function pickBotMove(game: Chess, bot: BotConfig | null): EngineMove | null {
  const moves = game.moves({ verbose: true }) as VerboseMove[];
  if (moves.length === 0) return null;
  if (!bot) return moves[Math.floor(Math.random() * moves.length)];
  const phase = isEndgame(game, bot.endgameTrigger) ? bot.endgame : bot.middlegame;
  const scored = moves.map((m) => ({ m, s: styleScore(classifyMove(game, m), phase.style) }));
  const total = scored.reduce((a, b) => a + b.s, 0);
  let r = Math.random() * total;
  for (const x of scored) { r -= x.s; if (r <= 0) return x.m; }
  return scored[scored.length - 1].m;
}

type ScoredMove = { vm: VerboseMove; cp: number; mate: number | null };

/** Convert Stockfish TopMove (from side-to-move perspective) into a unified cp score. */
function topToCp(tm: TopMove): { cp: number; mate: number | null } {
  if (tm.mate !== null) {
    // mate in N — winning mates very positive, losing very negative
    const sign = tm.mate > 0 ? 1 : -1;
    return { cp: sign * (100000 - Math.abs(tm.mate) * 10), mate: tm.mate };
  }
  return { cp: tm.cp ?? 0, mate: null };
}

/**
 * Pipeline:
 *   1) Polyglot opening book (with influence %).
 *   2) Stockfish MultiPV for ALL legal moves.
 *   3) Style-weight candidate pool.
 *   4) Strength bucket filter (cp loss vs best).
 *   5) Serious-error overrides (mate, max loss, winning safety).
 *   6) Weighted-random among survivors by style score.
 */
export async function chooseBotMove(
  game: Chess,
  bot: BotConfig | null,
): Promise<{ move: EngineMove; source: "book" | "engine" | "fallback" } | null> {
  const legal = game.moves({ verbose: true }) as VerboseMove[];
  if (legal.length === 0) return null;

  // ---------- 1) Polyglot opening book ----------
  if (bot?.opening.enabled && bot.opening.bookBin) {
    try {
      const book = base64ToBytes(bot.opening.bookBin);
      const key = polyglotHash(game);
      const entries = lookupPolyglot(book, key);
      if (entries.length > 0 && Math.random() * 100 < (bot.opening.influence ?? 100)) {
        let chosen = entries[0];
        if (bot.opening.mode === "best") {
          chosen = entries.reduce((a, b) => (b.weight > a.weight ? b : a), entries[0]);
        } else if (bot.opening.mode === "uniform") {
          chosen = entries[Math.floor(Math.random() * entries.length)];
        } else if (bot.opening.mode === "proportional") {
          chosen = pickWeighted(entries) ?? entries[0];
        } else {
          // "player" → highest-weight fallback
          chosen = entries.reduce((a, b) => (b.weight > a.weight ? b : a), entries[0]);
        }
        const uci = polyglotMoveToUci(game, chosen.move);
        const found = findLegalMove(game, uci);
        if (found) return { move: found, source: "book" };
      }
    } catch (e) {
      console.warn("[botStore] polyglot lookup failed:", e);
    }
  }

  // ---------- 2) Stockfish evaluation of all legal moves ----------
  if (bot) {
    try {
      const phase = isEndgame(game, bot.endgameTrigger) ? bot.endgame : bot.middlegame;
      const multipv = Math.min(legal.length, 24);
      // Depth cap by ELO — weaker bots search shallower
      const elo = Math.max(100, Math.min(3200, bot.elo ?? 1500));
      const depth =
        elo < 400 ? 4 :
        elo < 800 ? 6 :
        elo < 1400 ? 8 :
        elo < 2000 ? 11 :
        elo < 2500 ? 14 : 16;
      // NOTE: do NOT pass Elo to UCI_LimitStrength — we control strength via candidate filtering below.
      const top = await analyseTopMoves(game.fen(), { multipv, depth });

      const scored: ScoredMove[] = [];
      for (const tm of top) {
        const vm = legal.find((m) =>
          m.from === tm.uci.slice(0, 2) &&
          m.to === tm.uci.slice(2, 4) &&
          ((tm.uci.length >= 5 ? tm.uci[4] : undefined) === m.promotion ||
            (!m.promotion && tm.uci.length < 5)),
        );
        if (vm) {
          const { cp, mate } = topToCp(tm);
          scored.push({ vm, cp, mate });
        }
      }
      // Cover any legal moves Stockfish didn't return (rare with multipv=24)
      for (const m of legal) {
        if (!scored.find((s) => s.vm.from === m.from && s.vm.to === m.to && s.vm.promotion === m.promotion)) {
          scored.push({ vm: m, cp: -10000, mate: null });
        }
      }
      if (scored.length === 0) throw new Error("no engine candidates");

      // Sort by cp desc (side-to-move perspective)
      scored.sort((a, b) => b.cp - a.cp);
      const bestCp = scored[0].cp;

      // ---------- 5a) Hard override: forced mate (engine truth, before any filtering) ----------
      if (bot.errorRules.forceMate) {
        const mateNow = scored.find((s) => s.mate !== null && s.mate > 0);
        if (mateNow) return { move: mateNow.vm, source: "engine" };
      }

      // ============================================================
      //   STEP 1 — STRENGTH ENGINE (ELO CONTROL LAYER)
      //   Build a limited candidate move pool BEFORE personality runs.
      //   Personality can never select a move outside this pool.
      // ============================================================
      const eloPoolSize =
        elo < 200  ? Math.min(scored.length, 5) :
        elo < 600  ? Math.min(scored.length, 7) :
        elo < 1000 ? Math.min(scored.length, 9) :
        elo < 1500 ? Math.min(scored.length, 12) :
        elo < 2000 ? Math.min(scored.length, 16) :
                     scored.length;
      let eloPool: ScoredMove[] = scored.slice(0, eloPoolSize);

      // Blunder injection — probability inversely proportional to ELO.
      const blunderProb =
        elo < 200  ? 0.35 :
        elo < 600  ? 0.22 :
        elo < 1000 ? 0.12 :
        elo < 1500 ? 0.05 :
        elo < 2000 ? 0.02 : 0;
      if (blunderProb > 0 && Math.random() < blunderProb && scored.length > eloPoolSize) {
        const span = Math.min(6, scored.length - eloPoolSize);
        const worse = scored[eloPoolSize + Math.floor(Math.random() * span)];
        if (worse) eloPool = [...eloPool, worse];
      }
      // Force-mate already returned above, so this is safe.
      const eloFiltered = eloPool;

      // ============================================================
      //   STEP 2 — PERSONALITY LAYER (STYLE ONLY)
      //   Operates strictly within the ELO-filtered pool.
      // ============================================================
      const bucket = phase.strength;
      const tolerance = bot.bucketMap[bucket] ?? DEFAULT_BUCKET_MAP[bucket];
      const eloBestCp = eloFiltered[0].cp;

      let pool: ScoredMove[];
      if (bucket === "worst") {
        pool = [eloFiltered[eloFiltered.length - 1]];
      } else if (bucket === "best") {
        pool = eloFiltered.filter((s) => eloBestCp - s.cp <= 5);
      } else {
        pool = eloFiltered.filter((s) => eloBestCp - s.cp <= tolerance);
        if (pool.length === 0) pool = [eloFiltered[0]];
      }


      // ---------- 5b) Max centipawn loss cap ----------
      if (bot.errorRules.maxCpLoss > 0 && bucket !== "worst") {
        const capped = pool.filter((s) => bestCp - s.cp <= bot.errorRules.maxCpLoss);
        if (capped.length > 0) pool = capped;
      }

      // ---------- 5c) Don’t blunder when winning ----------
      if (bot.errorRules.noBlunderWhenWinning && bestCp >= bot.errorRules.winningThresholdCp && bucket !== "worst") {
        const safe = pool.filter((s) => bestCp - s.cp <= bot.errorRules.winningMaxLossCp);
        if (safe.length > 0) pool = safe;
      }

      // ---------- 3 + 6) Style-weighted pick over the survivors ----------
      if (pool.length === 1) return { move: pool[0].vm, source: "engine" };
      if (bucket === "best") return { move: pool[0].vm, source: "engine" };

      const weighted = pool.map((s) => {
        const cls = classifyMove(game, s.vm);
        const sty = styleScore(cls, phase.style);
        // gently favour stronger moves within the bucket: weight by style * (1 - loss/tolerance)
        const loss = Math.max(0, bestCp - s.cp);
        const closeness = tolerance > 0 ? Math.max(0.1, 1 - loss / (tolerance + 1)) : 1;
        // "In the expected moves" — long-term Lucas Chess strategic bias.
        // Applied as a soft multiplicative bonus; never overrides engine eval.
        const exp = phase.expected ?? defaultExpectedMoves();
        let bias = 1;
        if (cls.isCapture) bias += exp.capture / 200;
        if (cls.isCheck) bias += exp.check / 200;
        if (cls.advance > 0) bias += (exp.advance / 200) * Math.min(3, cls.advance);
        // "Keep the two bishops" — penalise trading away own bishop while still owning the pair.
        if (s.vm.piece === "b") {
          let myBishops = 0;
          const turn = game.turn();
          for (const row of game.board()) for (const sq of row) {
            if (sq && sq.type === "b" && sq.color === turn) myBishops++;
          }
          if (myBishops >= 2) bias *= Math.max(0.2, 1 - exp.keepBishopPair / 150);
        }
        return { vm: s.vm, w: sty * closeness * bias };
      });
      const total = weighted.reduce((a, b) => a + b.w, 0);
      let r = Math.random() * total;
      for (const x of weighted) {
        r -= x.w;
        if (r <= 0) return { move: x.vm, source: "engine" };
      }
      return { move: weighted[weighted.length - 1].vm, source: "engine" };
    } catch (e) {
      console.warn("[botStore] stockfish unavailable:", e);
    }
  }

  // ---------- Fallback: style-only heuristic ----------
  const pick = pickBotMove(game, bot);
  return pick ? { move: pick, source: "fallback" } : null;
}
