import { useEffect, useMemo, useState } from "react";
import { Chess, type Square } from "chess.js";
import { toast } from "sonner";
import { Copy, Plus, Save, Trash2, Play, RotateCcw, Search, FlaskConical } from "lucide-react";
import {
  BOT_CATEGORIES,
  DEFAULT_BUCKET_MAP,
  ENGINE_PROFILES,
  type EngineProfile,
  STRENGTH_LABELS,
  chooseBotMove,
  defaultEndgameTrigger,
  defaultEngineConfig,
  defaultErrorRules,
  defaultHumanMistake,
  defaultOpening,
  defaultPhase,
  defaultThinkingTime,
  deleteBot,
  loadBots,
  publishBot,
  refreshFromCloud,
  subscribeBots,
  updateBot,
  type BotCategory,
  type BotConfig,
  type BotPublishInput,
  type ExpectedMoves,
  type MoveStyle,
  type PhaseConfig,
  type StrengthBucket,
} from "@/lib/botStore";
import { Board } from "@/components/chess/Board";
import { cn } from "@/lib/utils";

type Draft = Omit<BotConfig, "id" | "createdAt" | "orderIndex"> & {
  id: string | null;
  avatarFile?: File | null;
};

const blankDraft = (): Draft => ({
  id: null,
  name: "New Bot",
  elo: 1500,
  quote: "",
  category: "Intermediate",
  avatar: undefined,
  middlegame: defaultPhase(),
  endgame: defaultPhase(),
  opening: defaultOpening(),
  errorRules: defaultErrorRules(),
  endgameTrigger: defaultEndgameTrigger(),
  bucketMap: { ...DEFAULT_BUCKET_MAP },
  humanMistake: defaultHumanMistake(),
  dialogueLines: [],
  title: null,
  titleColor: null,
  country: null,
  thinking: defaultThinkingTime(),
  engine: defaultEngineConfig(),
});
const fromBot = (b: BotConfig): Draft => JSON.parse(JSON.stringify({ ...b, id: b.id }));

type Archetype = {
  name: string;
  desc: string;
  style: MoveStyle;
  expected: ExpectedMoves;
  mg: StrengthBucket;
  eg: StrengthBucket;
};
const ARCHETYPES: Archetype[] = [
  {
    name: "Attacking Genius",
    desc: "Tal-style sacrifices & checks",
    style: {
      pawnAdvance: 60,
      pieceDevelopment: 70,
      capture: 75,
      check: 90,
      kingSafety: 25,
      positional: 30,
    },
    expected: { keepBishopPair: 30, advance: 45, check: 40, capture: 30 },
    mg: "better_pp",
    eg: "similar",
  },
  {
    name: "Positional Grinder",
    desc: "Karpov-style squeeze",
    style: {
      pawnAdvance: 40,
      pieceDevelopment: 60,
      capture: 35,
      check: 20,
      kingSafety: 70,
      positional: 95,
    },
    expected: { keepBishopPair: 80, advance: 15, check: 5, capture: 5 },
    mg: "better_pp",
    eg: "best",
  },
  {
    name: "Universal Classical",
    desc: "Balanced, principled",
    style: {
      pawnAdvance: 50,
      pieceDevelopment: 65,
      capture: 50,
      check: 45,
      kingSafety: 55,
      positional: 65,
    },
    expected: { keepBishopPair: 50, advance: 20, check: 10, capture: 10 },
    mg: "similar",
    eg: "similar",
  },
  {
    name: "Solid Defender",
    desc: "Safety first, trades down",
    style: {
      pawnAdvance: 25,
      pieceDevelopment: 55,
      capture: 60,
      check: 20,
      kingSafety: 95,
      positional: 70,
    },
    expected: { keepBishopPair: 40, advance: 5, check: 5, capture: 30 },
    mg: "similar",
    eg: "better",
  },
  {
    name: "Wild Gambiteer",
    desc: "Pawn storms, chaos",
    style: {
      pawnAdvance: 90,
      pieceDevelopment: 60,
      capture: 55,
      check: 75,
      kingSafety: 15,
      positional: 20,
    },
    expected: { keepBishopPair: 10, advance: 70, check: 30, capture: 20 },
    mg: "similar",
    eg: "similar",
  },
  {
    name: "Club Hacker",
    desc: "Grabs material, loves checks",
    style: {
      pawnAdvance: 50,
      pieceDevelopment: 35,
      capture: 90,
      check: 80,
      kingSafety: 35,
      positional: 15,
    },
    expected: { keepBishopPair: 10, advance: 30, check: 30, capture: 60 },
    mg: "similar",
    eg: "worse",
  },
];

const STYLE_KEYS: [keyof MoveStyle, string][] = [
  ["pawnAdvance", "Pawn advances"],
  ["pieceDevelopment", "Piece development"],
  ["capture", "Captures"],
  ["check", "Checks"],
  ["kingSafety", "King safety"],
  ["positional", "Positional play"],
];
const EXP_KEYS: [keyof ExpectedMoves, string][] = [
  ["keepBishopPair", "Keep bishop pair"],
  ["advance", "Long-term advance"],
  ["check", "Check tendency"],
  ["capture", "Capture tendency"],
];

function Card({
  title,
  impact,
  children,
}: {
  title: string;
  impact?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">{title}</h3>
        {impact && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-warning/10 text-warning ring-1 ring-warning/30">
            {impact}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}
function Slider({
  label,
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  suffix = "",
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
}) {
  return (
    <label className="block">
      <div className="flex justify-between text-[11px] text-muted-foreground">
        <span>{label}</span>
        <span className="font-mono text-foreground">
          {value}
          {suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[var(--warning)]"
      />
    </label>
  );
}
function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between text-xs cursor-pointer">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-[var(--warning)] w-4 h-4"
      />
    </label>
  );
}
const inputCls = "w-full h-8 rounded-md bg-background border border-border px-2 text-xs";

export function StudioBotEditor({
  editRequest,
}: {
  editRequest?: { id: string; n: number } | null;
}) {
  const [bots, setBots] = useState<BotConfig[]>(loadBots());
  const [draft, setDraft] = useState<Draft>(blankDraft());
  const [phaseTab, setPhaseTab] = useState<"middlegame" | "endgame">("middlegame");
  const [mode, setMode] = useState<"basic" | "advanced" | "expert">("advanced");
  const [q, setQ] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const u = subscribeBots(() => setBots(loadBots()));
    refreshFromCloud().then(setBots);
    return u;
  }, []);
  useEffect(() => {
    if (!editRequest) return;
    const b = loadBots().find((x) => x.id === editRequest.id);
    if (b) setDraft(fromBot(b));
  }, [editRequest]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const phase = draft[phaseTab];
  const setPhase = (p: Partial<PhaseConfig>) =>
    setDraft((d) => ({ ...d, [phaseTab]: { ...d[phaseTab], ...p } }));

  function applyArchetype(a: Archetype) {
    setDraft((d) => ({
      ...d,
      middlegame: {
        ...d.middlegame,
        strength: a.mg,
        style: { ...a.style },
        expected: { ...a.expected },
      },
      endgame: {
        ...d.endgame,
        strength: a.eg,
        style: {
          ...a.style,
          positional: Math.min(100, a.style.positional + 15),
          kingSafety: Math.max(10, a.style.kingSafety - 20),
        },
        expected: { ...a.expected },
      },
    }));
    toast.success(`Applied ${a.name}`);
  }

  async function save() {
    if (!draft.name.trim()) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    try {
      const input: BotPublishInput = {
        name: draft.name.trim(),
        elo: Math.max(100, Math.min(4000, Math.round(draft.elo))),
        quote: draft.quote,
        category: draft.category,
        dialogueLines: draft.dialogueLines,
        middlegame: draft.middlegame,
        endgame: draft.endgame,
        opening: draft.opening,
        errorRules: draft.errorRules,
        endgameTrigger: draft.endgameTrigger,
        bucketMap: draft.bucketMap,
        humanMistake: draft.humanMistake,
        title: draft.title,
        titleColor: draft.titleColor,
        country: draft.country,
        thinking: draft.thinking,
        engine: draft.engine,
        avatarFile: draft.avatarFile ?? null,
      };
      if (!draft.id && draft.avatar && !draft.avatarFile) input.avatarDataUrl = draft.avatar;
      const saved = draft.id ? await updateBot(draft.id, input) : await publishBot(input);
      if (saved) setDraft(fromBot(saved));
      toast.success(draft.id ? "Bot saved & live" : "Bot created & published");
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : ((e as { message?: string })?.message ?? "Save failed"),
      );
    } finally {
      setSaving(false);
    }
  }
  async function remove() {
    if (!draft.id || !confirm(`Delete ${draft.name}? This cannot be undone.`)) return;
    await deleteBot(draft.id);
    setDraft(blankDraft());
    toast.success("Bot deleted");
  }

  const filtered = bots.filter((b) => b.name.toLowerCase().includes(q.toLowerCase()));
  const adv = mode !== "basic";
  const exp = mode === "expert";

  return (
    <div className="grid gap-4 xl:grid-cols-[220px_1fr_1fr_400px] lg:grid-cols-[220px_1fr_1fr]">
      {/* Roster */}
      <aside className="rounded-xl border border-border bg-card p-3 space-y-2 h-fit xl:sticky xl:top-20">
        <div className="flex gap-1">
          <button
            onClick={() => setDraft(blankDraft())}
            className="flex-1 h-8 rounded-md bg-warning text-background text-xs font-bold flex items-center justify-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" />
            New
          </button>
          <button
            disabled={!draft.id}
            onClick={() => {
              setDraft((d) => ({ ...d, id: null, name: `${d.name} (copy)` }));
              toast("Cloned — save to publish the copy");
            }}
            className="flex-1 h-8 rounded-md border border-border text-xs flex items-center justify-center gap-1 disabled:opacity-40"
          >
            <Copy className="w-3.5 h-3.5" />
            Clone
          </button>
        </div>
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2 top-2.5 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search bots"
            className={cn(inputCls, "pl-7")}
          />
        </div>
        <div className="max-h-[70vh] overflow-y-auto space-y-0.5">
          {filtered.map((b) => (
            <button
              key={b.id}
              onClick={() => setDraft(fromBot(b))}
              className={cn(
                "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-xs",
                draft.id === b.id ? "bg-warning/15 ring-1 ring-warning/40" : "hover:bg-muted",
              )}
            >
              {b.avatar ? (
                <img src={b.avatar} alt="" className="w-6 h-6 rounded object-contain" />
              ) : (
                <div className="w-6 h-6 rounded bg-muted" />
              )}
              <span className="flex-1 truncate">{b.name}</span>
              <span className="font-mono text-muted-foreground">{b.elo}</span>
            </button>
          ))}
        </div>
      </aside>

      {/* Column 2: Identity + Personality */}
      <div className="space-y-4">
        <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1">
          {(["basic", "advanced", "expert"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cn(
                "flex-1 h-7 rounded text-xs font-semibold capitalize",
                mode === m ? "bg-warning/15 text-warning" : "text-muted-foreground",
              )}
            >
              {m}
            </button>
          ))}
        </div>
        <Card title="Identity" impact="Cosmetic">
          <div className="flex gap-3 items-end">
            <label className="w-20 h-20 rounded-lg border border-dashed border-border grid place-items-center cursor-pointer overflow-hidden shrink-0">
              {draft.avatarFile ? (
                <img
                  src={URL.createObjectURL(draft.avatarFile)}
                  alt=""
                  className="w-full h-full object-contain"
                />
              ) : draft.avatar ? (
                <img src={draft.avatar} alt="" className="w-full h-full object-contain" />
              ) : (
                <span className="text-[10px] text-muted-foreground">Portrait</span>
              )}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => set("avatarFile", e.target.files?.[0] ?? null)}
              />
            </label>
            <div className="flex-1 space-y-2">
              <input
                value={draft.name}
                onChange={(e) => set("name", e.target.value)}
                className={inputCls}
                placeholder="Name"
              />
              <div className="grid grid-cols-3 gap-2">
                <input
                  value={draft.title ?? ""}
                  onChange={(e) => set("title", e.target.value || null)}
                  className={inputCls}
                  placeholder="Title (GM, CRTR)"
                />
                <input
                  value={draft.country ?? ""}
                  onChange={(e) => set("country", e.target.value || null)}
                  className={inputCls}
                  placeholder="Flag 🇨🇦"
                />
                <input
                  type="color"
                  value={draft.titleColor ?? "#e5a93c"}
                  onChange={(e) => set("titleColor", e.target.value)}
                  className="h-8 w-full rounded-md bg-background border border-border"
                  title="Title color"
                />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[11px] text-muted-foreground">
              Rating (also sets strength)
              <input
                type="number"
                value={draft.elo}
                onChange={(e) => set("elo", Number(e.target.value))}
                className={inputCls}
              />
            </label>
            <label className="text-[11px] text-muted-foreground">
              Category
              <select
                value={draft.category}
                onChange={(e) => set("category", e.target.value as BotCategory)}
                className={inputCls}
              >
                {BOT_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <input
            value={draft.quote}
            onChange={(e) => set("quote", e.target.value)}
            className={inputCls}
            placeholder="Signature quote"
          />
          {adv && (
            <textarea
              value={draft.dialogueLines.join("\n")}
              onChange={(e) => set("dialogueLines", e.target.value.split("\n"))}
              rows={3}
              className="w-full rounded-md bg-background border border-border p-2 text-xs"
              placeholder="In-game chat lines (one per line)"
            />
          )}
        </Card>
        <Card title="Archetype presets" impact="Personality">
          <div className="grid grid-cols-2 gap-2">
            {ARCHETYPES.map((a) => (
              <button
                key={a.name}
                onClick={() => applyArchetype(a)}
                className="text-left rounded-lg border border-border p-2 hover:border-warning/50"
              >
                <div className="text-xs font-semibold">{a.name}</div>
                <div className="text-[10px] text-muted-foreground">{a.desc}</div>
              </button>
            ))}
          </div>
        </Card>
        <Card title="Personality by phase" impact="Personality weight">
          <div className="flex gap-1">
            {(["middlegame", "endgame"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPhaseTab(p)}
                className={cn(
                  "flex-1 h-7 rounded text-xs capitalize",
                  phaseTab === p ? "bg-warning/15 text-warning" : "border border-border",
                )}
              >
                {p}
              </button>
            ))}
          </div>
          <label className="text-[11px] text-muted-foreground block">
            Strength bucket
            <select
              value={phase.strength}
              onChange={(e) => setPhase({ strength: e.target.value as StrengthBucket })}
              className={inputCls}
            >
              {STRENGTH_LABELS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <div className="text-[10px] uppercase text-muted-foreground pt-1">Next-move style</div>
          {STYLE_KEYS.map(([k, l]) => (
            <Slider
              key={k}
              label={l}
              value={phase.style[k]}
              onChange={(v) => setPhase({ style: { ...phase.style, [k]: v } })}
            />
          ))}
          {adv && (
            <>
              <div className="text-[10px] uppercase text-muted-foreground pt-1">
                Long-term tendencies
              </div>
              {EXP_KEYS.map(([k, l]) => (
                <Slider
                  key={k}
                  label={l}
                  value={phase.expected[k]}
                  onChange={(v) => setPhase({ expected: { ...phase.expected, [k]: v } })}
                />
              ))}
            </>
          )}
          <Slider
            label="Endgame starts at ≤ pieces (non-pawn)"
            value={draft.endgameTrigger.maxMajorMinor}
            min={0}
            max={14}
            onChange={(v) => set("endgameTrigger", { maxMajorMinor: v })}
          />
        </Card>
      </div>

      {/* Column 3: Mistakes, rules, engine */}
      <div className="space-y-4">
        <Card title="Human mistake layer" impact="Strength">
          <Slider
            label="Blunder chance"
            suffix="%"
            value={draft.humanMistake.blunderChance}
            onChange={(v) => set("humanMistake", { ...draft.humanMistake, blunderChance: v })}
          />
          <Slider
            label="Missed capture chance"
            suffix="%"
            value={draft.humanMistake.missedCaptureChance}
            onChange={(v) => set("humanMistake", { ...draft.humanMistake, missedCaptureChance: v })}
          />
          <Slider
            label="Tactical blind spot"
            suffix="%"
            value={draft.humanMistake.blindSpotChance}
            onChange={(v) => set("humanMistake", { ...draft.humanMistake, blindSpotChance: v })}
          />
          <Slider
            label="Random move"
            suffix="%"
            value={draft.humanMistake.randomMoveChance}
            onChange={(v) => set("humanMistake", { ...draft.humanMistake, randomMoveChance: v })}
          />
          <div className="grid grid-cols-2 gap-2">
            <Slider
              label="Think min"
              suffix="s"
              step={0.1}
              min={0}
              max={10}
              value={draft.thinking.minMs / 1000}
              onChange={(v) => set("thinking", { ...draft.thinking, minMs: Math.round(v * 1000) })}
            />
            <Slider
              label="Think max"
              suffix="s"
              step={0.1}
              min={0}
              max={15}
              value={draft.thinking.maxMs / 1000}
              onChange={(v) => set("thinking", { ...draft.thinking, maxMs: Math.round(v * 1000) })}
            />
          </div>
        </Card>
        {adv && (
          <Card title="Hard error rules" impact="Override">
            <Toggle
              label="Always play forced mate"
              value={draft.errorRules.forceMate}
              onChange={(v) => set("errorRules", { ...draft.errorRules, forceMate: v })}
            />
            <Slider
              label="Max centipawn loss (0 = off)"
              suffix="cp"
              max={1000}
              step={10}
              value={draft.errorRules.maxCpLoss}
              onChange={(v) => set("errorRules", { ...draft.errorRules, maxCpLoss: v })}
            />
            <Toggle
              label="Don't blunder when winning"
              value={draft.errorRules.noBlunderWhenWinning}
              onChange={(v) => set("errorRules", { ...draft.errorRules, noBlunderWhenWinning: v })}
            />
            <Slider
              label="Winning threshold"
              suffix="cp"
              max={1000}
              step={10}
              value={draft.errorRules.winningThresholdCp}
              onChange={(v) => set("errorRules", { ...draft.errorRules, winningThresholdCp: v })}
            />
            <Slider
              label="Max loss when winning"
              suffix="cp"
              max={500}
              step={5}
              value={draft.errorRules.winningMaxLossCp}
              onChange={(v) => set("errorRules", { ...draft.errorRules, winningMaxLossCp: v })}
            />
          </Card>
        )}
        {exp && (
          <Card title="Engine brain" impact="Engine impact: high">
            <p className="text-[10px] font-semibold text-primary">Running on Stockfish 18 NNUE</p>
            <label className="block text-[11px] font-medium">Engine style</label>
            <select
              className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
              value={draft.engine.profile ?? "stockfish"}
              onChange={(e) =>
                set("engine", { ...draft.engine, profile: e.target.value as EngineProfile })
              }
            >
              {ENGINE_PROFILES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.name} — {p.tag}
                </option>
              ))}
            </select>
            <p className="text-[10px] text-muted-foreground">
              {ENGINE_PROFILES.find((p) => p.value === (draft.engine.profile ?? "stockfish"))?.desc}
            </p>
            <Toggle
              label="Pure engine mode (no strength limits or mistakes)"
              value={!!draft.engine.pureMode}
              onChange={(v) => set("engine", { ...draft.engine, pureMode: v })}
            />
            <Slider
              label="Search depth (0 = auto by rating)"
              value={draft.engine.depth}
              max={30}
              onChange={(v) => set("engine", { ...draft.engine, depth: v })}
            />
            <Slider
              label="Max think per move (0 = auto)"
              suffix="s"
              value={draft.engine.timeoutSec ?? 0}
              max={60}
              onChange={(v) => set("engine", { ...draft.engine, timeoutSec: v })}
            />
            <p className="text-[10px] text-muted-foreground">
              Estimated wait:{" "}
              {(() => {
                const d = draft.engine.depth || 11;
                const pv = draft.engine.multipv || 24;
                const t = 0.05 * Math.pow(1.45, Math.max(0, d - 8)) * Math.sqrt(pv);
                return t < 1 ? "under 1s" : `~${Math.round(t)}s`;
              })()}
            </p>
            <Slider
              label="Candidate lines / MultiPV (0 = auto 24)"
              value={draft.engine.multipv}
              max={40}
              onChange={(v) => set("engine", { ...draft.engine, multipv: v })}
            />
            <Toggle
              label="Limit candidate pool by rating"
              value={draft.engine.eloPool}
              onChange={(v) => set("engine", { ...draft.engine, eloPool: v })}
            />
            <Toggle
              label="Rating-based blunder injection"
              value={draft.engine.eloBlunders}
              onChange={(v) => set("engine", { ...draft.engine, eloBlunders: v })}
            />
            <p className="text-[10px] text-muted-foreground">
              High depth with low MultiPV = strongest play but slower moves.
            </p>
          </Card>
        )}
        {exp && (
          <Card title="Centipawn buckets" impact="Strength">
            <div className="grid grid-cols-2 gap-2">
              {STRENGTH_LABELS.filter((s) => s.value !== "best" && s.value !== "worst").map((s) => (
                <label key={s.value} className="text-[10px] text-muted-foreground">
                  {s.label}
                  <input
                    type="number"
                    value={draft.bucketMap[s.value]}
                    onChange={(e) =>
                      set("bucketMap", { ...draft.bucketMap, [s.value]: Number(e.target.value) })
                    }
                    className={inputCls}
                  />
                </label>
              ))}
            </div>
          </Card>
        )}
        {adv && (
          <Card title="Opening" impact="Candidate source">
            <Toggle
              label="Use Polyglot book"
              value={draft.opening.enabled}
              onChange={(v) => set("opening", { ...draft.opening, enabled: v })}
            />
            <Slider
              label="Book influence"
              suffix="%"
              value={draft.opening.influence}
              onChange={(v) => set("opening", { ...draft.opening, influence: v })}
            />
            <Slider
              label="Max book depth (plies)"
              min={2}
              max={40}
              value={draft.opening.maxBookDepth}
              onChange={(v) => set("opening", { ...draft.opening, maxBookDepth: v })}
            />
            <p className="text-[10px] text-muted-foreground">
              {draft.opening.bookName
                ? `Book: ${draft.opening.bookName}`
                : "No book uploaded — built-in repertoire is used."}
            </p>
          </Card>
        )}
        <div className="flex gap-2 sticky bottom-2">
          <button
            onClick={save}
            disabled={saving}
            className="flex-1 h-10 rounded-lg bg-warning text-background font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? "Saving…" : draft.id ? "Save & Publish" : "Create & Publish"}
          </button>
          {draft.id && (
            <button
              onClick={remove}
              className="h-10 w-10 rounded-lg border border-destructive/40 text-destructive grid place-items-center"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Column 4: Inspector */}
      <div className="lg:col-span-3 xl:col-span-1">
        <Inspector draft={draft} />
      </div>
    </div>
  );
}

function Inspector({ draft }: { draft: Draft }) {
  const [fen, setFen] = useState(new Chess().fen());
  const game = useMemo(() => new Chess(fen), [fen]);
  const [last, setLast] = useState<{ from: Square; to: Square } | null>(null);
  const [busy, setBusy] = useState(false);
  const [dist, setDist] = useState<{ san: string; n: number; src: string }[] | null>(null);
  const bot = useMemo<BotConfig>(
    () => ({ ...draft, id: draft.id ?? "draft", createdAt: 0, orderIndex: 0 }),
    [draft],
  );

  function onMove(from: Square, to: Square) {
    const g = new Chess(fen);
    try {
      const m = g.move({ from, to, promotion: "q" });
      if (!m) return false;
    } catch {
      return false;
    }
    setFen(g.fen());
    setLast({ from, to });
    setDist(null);
    return true;
  }
  async function botMove() {
    if (game.isGameOver()) return;
    setBusy(true);
    const r = await chooseBotMove(new Chess(fen), bot);
    setBusy(false);
    if (r) onMove(r.move.from as Square, r.move.to as Square);
  }
  async function sample() {
    setBusy(true);
    const counts = new Map<string, { n: number; src: string }>();
    for (let i = 0; i < 10; i++) {
      const r = await chooseBotMove(new Chess(fen), bot);
      if (r) {
        const c = counts.get(r.move.san) ?? { n: 0, src: r.source };
        c.n++;
        counts.set(r.move.san, c);
      }
    }
    setDist([...counts.entries()].map(([san, v]) => ({ san, ...v })).sort((a, b) => b.n - a.n));
    setBusy(false);
  }
  return (
    <section className="rounded-xl border border-border bg-card p-4 space-y-3 xl:sticky xl:top-20">
      <h3 className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
        <FlaskConical className="w-3.5 h-3.5 text-warning" />
        Live inspector
      </h3>
      <p className="text-[10px] text-muted-foreground">
        Tests your unsaved settings. Move pieces to set up a position.
      </p>
      <div className="max-w-[360px] mx-auto">
        <Board game={game} flipped={false} disabled={busy} lastMove={last} onAttemptMove={onMove} />
      </div>
      <div className="flex gap-2">
        <button
          onClick={botMove}
          disabled={busy}
          className="flex-1 h-8 rounded-md bg-warning/15 text-warning ring-1 ring-warning/40 text-xs font-semibold flex items-center justify-center gap-1 disabled:opacity-50"
        >
          <Play className="w-3.5 h-3.5" />
          Bot plays
        </button>
        <button
          onClick={sample}
          disabled={busy}
          className="flex-1 h-8 rounded-md border border-border text-xs font-semibold disabled:opacity-50"
        >
          {busy ? "Thinking…" : "Sample 10 picks"}
        </button>
        <button
          onClick={() => {
            setFen(new Chess().fen());
            setLast(null);
            setDist(null);
          }}
          className="h-8 w-8 rounded-md border border-border grid place-items-center"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>
      <input
        value={fen}
        onChange={(e) => {
          try {
            new Chess(e.target.value);
            setFen(e.target.value);
            setDist(null);
          } catch {
            /* ignore invalid */
          }
        }}
        className={cn(inputCls, "font-mono text-[10px]")}
      />
      {dist && (
        <div className="space-y-1">
          <div className="text-[10px] uppercase text-muted-foreground">
            Move choices (10 samples)
          </div>
          {dist.map((d) => (
            <div key={d.san} className="flex items-center gap-2 text-xs">
              <span className="w-12 font-mono font-semibold">{d.san}</span>
              <div className="flex-1 h-2 rounded bg-muted overflow-hidden">
                <div className="h-full bg-warning" style={{ width: `${d.n * 10}%` }} />
              </div>
              <span className="w-8 text-right font-mono">{d.n * 10}%</span>
              <span className="w-12 text-[10px] text-muted-foreground">{d.src}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
