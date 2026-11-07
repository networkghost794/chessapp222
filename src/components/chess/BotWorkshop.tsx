import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  BOT_CATEGORIES,
  STRENGTH_LABELS,
  loadBots,
  refreshFromCloud,
  subscribeBots,
  type BotConfig,
  type BotCategory,
} from "@/lib/botStore";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ArrowDown, ArrowUp, Columns3, Pencil, Search } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type ColId =
  | "category"
  | "elo"
  | "title"
  | "country"
  | "mgStrength"
  | "egStrength"
  | "mistakes"
  | "maxLoss"
  | "thinking"
  | "opening"
  | "record"
  | "dialogue";

type ColDef = {
  id: ColId;
  label: string;
  get: (b: BotConfig) => string | number;
  sort?: (b: BotConfig) => number | string;
};

const strengthLabel = (v: string) => STRENGTH_LABELS.find((s) => s.value === v)?.label ?? v;
const catLabel = (c: BotCategory) => BOT_CATEGORIES.find((x) => x.value === c)?.label ?? c;
const mistakeTotal = (b: BotConfig) => {
  const m = b.humanMistake;
  return (
    (m?.blunderChance ?? 0) +
    (m?.missedCaptureChance ?? 0) +
    (m?.blindSpotChance ?? 0) +
    (m?.randomMoveChance ?? 0)
  );
};

const COLUMNS: ColDef[] = [
  { id: "category", label: "Category", get: (b) => catLabel(b.category), sort: (b) => b.category },
  { id: "elo", label: "Display Elo", get: (b) => b.elo, sort: (b) => b.elo },
  { id: "title", label: "Title", get: (b) => b.title || "—" },
  { id: "country", label: "Flag", get: (b) => b.country || "—" },
  {
    id: "mgStrength",
    label: "Middlegame strength",
    get: (b) => strengthLabel(b.middlegame.strength),
  },
  { id: "egStrength", label: "Endgame strength", get: (b) => strengthLabel(b.endgame.strength) },
  {
    id: "mistakes",
    label: "Mistake total %",
    get: (b) => `${mistakeTotal(b)}%`,
    sort: mistakeTotal,
  },
  {
    id: "maxLoss",
    label: "Max cp loss",
    get: (b) => b.errorRules.maxCpLoss || "off",
    sort: (b) => b.errorRules.maxCpLoss,
  },
  {
    id: "thinking",
    label: "Think time",
    get: (b) => `${(b.thinking.minMs / 1000).toFixed(1)}–${(b.thinking.maxMs / 1000).toFixed(1)}s`,
    sort: (b) => b.thinking.maxMs,
  },
  {
    id: "opening",
    label: "Opening book",
    get: (b) => (b.opening.enabled && b.opening.bookName ? b.opening.bookName : "Repertoire"),
  },
  {
    id: "record",
    label: "Lifetime W/L",
    get: (b) => `${b.lifetimeWins ?? 0} / ${b.lifetimeLosses ?? 0}`,
    sort: (b) => b.lifetimeWins ?? 0,
  },
  {
    id: "dialogue",
    label: "Dialogue lines",
    get: (b) => b.dialogueLines.length,
    sort: (b) => b.dialogueLines.length,
  },
];

type Prefs = { order: ColId[]; hidden: ColId[] };
const DEFAULT_PREFS: Prefs = {
  order: COLUMNS.map((c) => c.id),
  hidden: ["country", "dialogue", "thinking"],
};
const PREFS_KEY = "studio_workshop";

function normalizePrefs(p?: Partial<Prefs>): Prefs {
  const valid = new Set(COLUMNS.map((c) => c.id));
  const order = (p?.order ?? []).filter((id) => valid.has(id));
  for (const c of COLUMNS) if (!order.includes(c.id)) order.push(c.id);
  return { order, hidden: (p?.hidden ?? DEFAULT_PREFS.hidden).filter((id) => valid.has(id)) };
}

export function BotWorkshop({ onEdit }: { onEdit: (id: string) => void }) {
  const [bots, setBots] = useState<BotConfig[]>(loadBots());
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<BotCategory | "all">("all");
  const [sort, setSort] = useState<{ col: ColId | "name"; dir: 1 | -1 }>({ col: "elo", dir: -1 });

  useEffect(() => subscribeBots(() => setBots(loadBots())), []);
  useEffect(() => {
    refreshFromCloud();
    supabase
      .from("app_settings")
      .select("value")
      .eq("key", PREFS_KEY)
      .maybeSingle()
      .then(({ data }) => setPrefs(normalizePrefs(data?.value as Partial<Prefs> | undefined)));
  }, []);

  const savePrefs = async (next: Prefs) => {
    setPrefs(next);
    const { error } = await supabase
      .from("app_settings")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .upsert({ key: PREFS_KEY, value: next as any, updated_at: new Date().toISOString() });
    if (error) toast.error(`Couldn't save columns: ${error.message}`);
  };

  const visibleCols = prefs.order
    .filter((id) => !prefs.hidden.includes(id))
    .map((id) => COLUMNS.find((c) => c.id === id)!);

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = bots.filter(
      (b) =>
        (cat === "all" || b.category === cat) && (!term || b.name.toLowerCase().includes(term)),
    );
    const key = (b: BotConfig): string | number => {
      if (sort.col === "name") return b.name.toLowerCase();
      const c = COLUMNS.find((x) => x.id === sort.col)!;
      return (c.sort ?? c.get)(b);
    };
    return [...list].sort((a, b) => {
      const x = key(a),
        y = key(b);
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });
  }, [bots, q, cat, sort]);

  const toggleSort = (col: ColId | "name") =>
    setSort((s) =>
      s.col === col ? { col, dir: (s.dir * -1) as 1 | -1 } : { col, dir: col === "name" ? 1 : -1 },
    );

  const move = (id: ColId, dir: -1 | 1) => {
    const order = [...prefs.order];
    const i = order.indexOf(id),
      j = i + dir;
    if (j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    savePrefs({ ...prefs, order });
  };
  const toggleHidden = (id: ColId) =>
    savePrefs({
      ...prefs,
      hidden: prefs.hidden.includes(id)
        ? prefs.hidden.filter((h) => h !== id)
        : [...prefs.hidden, id],
    });

  const SortIcon = ({ col }: { col: ColId | "name" }) =>
    sort.col === col ? (
      sort.dir === 1 ? (
        <ArrowUp className="w-3 h-3" />
      ) : (
        <ArrowDown className="w-3 h-3" />
      )
    ) : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search bots…"
            className="h-8 w-56 pl-8 text-xs"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {(["all", ...BOT_CATEGORIES.map((c) => c.value)] as const).map((c) => (
            <button
              key={c}
              onClick={() => setCat(c)}
              className={cn(
                "h-7 px-2.5 rounded-md text-[11px] border border-border",
                cat === c
                  ? "bg-primary text-primary-foreground border-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {c === "all" ? "All" : catLabel(c).replace(" Bots", "")}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {rows.length} of {bots.length} bots
          </span>
          <Popover>
            <PopoverTrigger asChild>
              <Button size="sm" variant="secondary" className="h-8 gap-1.5">
                <Columns3 className="w-3.5 h-3.5" /> Columns
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64 p-2">
              <div className="text-[11px] text-muted-foreground px-1 pb-2">
                Show, hide and reorder columns. Saved automatically.
              </div>
              {prefs.order.map((id, i) => {
                const c = COLUMNS.find((x) => x.id === id)!;
                return (
                  <div
                    key={id}
                    className="flex items-center gap-2 px-1 py-1 rounded hover:bg-muted/50"
                  >
                    <input
                      type="checkbox"
                      checked={!prefs.hidden.includes(id)}
                      onChange={() => toggleHidden(id)}
                    />
                    <span className="text-xs flex-1">{c.label}</span>
                    <button
                      disabled={i === 0}
                      onClick={() => move(id, -1)}
                      className="disabled:opacity-30"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      disabled={i === prefs.order.length - 1}
                      onClick={() => move(id, 1)}
                      className="disabled:opacity-30"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
              <Button
                size="sm"
                variant="ghost"
                className="w-full mt-1 h-7 text-xs"
                onClick={() => savePrefs(DEFAULT_PREFS)}
              >
                Reset to default
              </Button>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <div className="rounded-lg border border-border overflow-x-auto bg-card/40">
        <table className="w-full text-xs">
          <thead className="bg-muted/40 text-muted-foreground">
            <tr>
              <th
                className="text-left font-medium px-3 py-2 cursor-pointer select-none"
                onClick={() => toggleSort("name")}
              >
                <span className="inline-flex items-center gap-1">
                  Bot <SortIcon col="name" />
                </span>
              </th>
              {visibleCols.map((c) => (
                <th
                  key={c.id}
                  className="text-left font-medium px-3 py-2 whitespace-nowrap cursor-pointer select-none"
                  onClick={() => toggleSort(c.id)}
                >
                  <span className="inline-flex items-center gap-1">
                    {c.label} <SortIcon col={c.id} />
                  </span>
                </th>
              ))}
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((b) => (
              <tr key={b.id} className="border-t border-border/60 hover:bg-muted/30">
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    {b.avatar ? (
                      <img src={b.avatar} alt="" className="w-7 h-7 object-contain" />
                    ) : (
                      <div className="w-7 h-7 rounded bg-muted" />
                    )}
                    <span className="font-semibold whitespace-nowrap">{b.name}</span>
                  </div>
                </td>
                {visibleCols.map((c) => (
                  <td key={c.id} className="px-3 py-2 whitespace-nowrap tabular-nums">
                    {c.get(b)}
                  </td>
                ))}
                <td className="px-3 py-2 text-right">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 gap-1"
                    onClick={() => onEdit(b.id)}
                  >
                    <Pencil className="w-3 h-3" /> Edit
                  </Button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={visibleCols.length + 2}
                  className="px-3 py-8 text-center text-muted-foreground"
                >
                  No bots match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
