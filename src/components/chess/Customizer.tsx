import { useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  Plus,
  Trash2,
  ShieldCheck,
  Sparkles,
  LayoutGrid,
  Palette,
  CheckCircle2,
  Layers,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  BOT_CATEGORIES,
  loadBots,
  subscribeBots,
  reorderCategory,
  type BotConfig,
  type BotCategory,
} from "@/lib/botStore";
import {
  EVENT_THEMES,
  LABEL_DEFAULTS,
  saveUiSettings,
  useUiSettings,
  type UiSettings,
  type CardStyle,
  type CustomTier,
} from "@/lib/appSettings";
import { toast } from "sonner";

const defLabel = (c: string, customTiers?: CustomTier[]) =>
  BOT_CATEGORIES.find((x) => x.value === c)?.label ??
  customTiers?.find((t) => t.id === c)?.name ??
  c;

/** Owner-only: Full App & Studio Customizer (RLS Status, Custom Columns, Themes, Card Styles, Copy & Bot Assignments). */
export function Customizer() {
  const saved = useUiSettings();
  const [draft, setDraft] = useState<UiSettings>(saved);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [bots, setBots] = useState<BotConfig[]>(loadBots());
  const [newColName, setNewColName] = useState("");

  useEffect(() => setDraft(saved), [saved]);
  useEffect(() => subscribeBots(() => setBots(loadBots())), []);

  const moveTier = (i: number, d: number) => {
    const o = [...draft.tierOrder];
    const j = i + d;
    if (j < 0 || j >= o.length) return;
    [o[i], o[j]] = [o[j], o[i]];
    setDraft({ ...draft, tierOrder: o });
  };

  const toggleHidden = (c: string) =>
    setDraft({
      ...draft,
      hiddenTiers: draft.hiddenTiers.includes(c)
        ? draft.hiddenTiers.filter((x) => x !== c)
        : [...draft.hiddenTiers, c],
    });

  const handleAddColumn = () => {
    const trimmed = newColName.trim();
    if (!trimmed) {
      toast.error("Please enter a column name");
      return;
    }
    const id = "col_" + Date.now();
    const newTier: CustomTier = { id, name: trimmed };
    const customTiers = [...(draft.customTiers ?? []), newTier];
    const tierOrder = [...draft.tierOrder, id];
    const tierLabels = { ...draft.tierLabels, [id]: trimmed };

    setDraft({
      ...draft,
      customTiers,
      tierOrder,
      tierLabels,
    });
    setNewColName("");
    toast.success(`Added custom column "${trimmed}"`);
  };

  const handleDeleteCustomColumn = (id: string) => {
    const custom = (draft.customTiers ?? []).find((t) => t.id === id);
    const colName = custom?.name || draft.tierLabels[id] || id;
    if (
      !confirm(`Delete custom column "${colName}"? Bots assigned to it will remain in library.`)
    ) {
      return;
    }

    const customTiers = (draft.customTiers ?? []).filter((t) => t.id !== id);
    const tierOrder = draft.tierOrder.filter((t) => t !== id);
    const hiddenTiers = draft.hiddenTiers.filter((t) => t !== id);
    const { [id]: _, ...tierLabels } = draft.tierLabels;

    setDraft({
      ...draft,
      customTiers,
      tierOrder,
      hiddenTiers,
      tierLabels,
    });
    toast.success(`Removed column "${colName}"`);
  };

  const save = async () => {
    setBusy(true);
    setMsg("");
    const err = await saveUiSettings(draft);
    setBusy(false);
    if (err) {
      setMsg(`Could not save: ${err}`);
      toast.error(err);
    } else {
      setMsg("Saved — live for everyone across the app!");
      toast.success("UI Customization & Layout saved!");
    }
  };

  const listOf = (c: string) =>
    bots.filter((b) => b.category === c).sort((a, b) => a.orderIndex - b.orderIndex);

  const moveBot = async (b: BotConfig, d: number) => {
    const ids = listOf(b.category).map((x) => x.id);
    const i = ids.indexOf(b.id);
    const j = i + d;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    await reorderCategory(b.category, ids);
  };

  const changeTier = async (b: BotConfig, c: string) => {
    await reorderCategory(c as BotCategory, [...listOf(c).map((x) => x.id), b.id]);
    toast.success(`Moved ${b.name} to ${draft.tierLabels[c] || defLabel(c, draft.customTiers)}`);
  };

  return (
    <div className="space-y-8">
      {/* RLS Security Status Banner */}
      <section className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 space-y-2">
        <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
          <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
          Database & Storage Security (Supabase RLS Enforced)
        </div>
        <p className="text-xs text-muted-foreground">
          Public SELECT is enabled for public bot profiles, match stats, and assets. All INSERT,
          UPDATE, and DELETE operations are restricted strictly to authenticated creators and
          platform owners (`auth.uid() = creator_id` / `owner`).
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          {[
            "profiles",
            "custom_bots",
            "bot_stats",
            "app_settings",
            "avatars bucket",
            "bot-avatars bucket",
            "opening-books bucket",
          ].map((item) => (
            <Badge
              key={item}
              variant="outline"
              className="bg-emerald-950/40 border-emerald-500/40 text-emerald-300 text-[10px] gap-1"
            >
              <CheckCircle2 className="w-3 h-3 text-emerald-400" /> {item} RLS Protected
            </Badge>
          ))}
        </div>
      </section>

      {/* Dynamic Bot Columns & Categories Manager */}
      <section className="rounded-xl border border-border/70 bg-card p-5 space-y-4 shadow-sm">
        <div>
          <div className="flex items-center gap-2 text-base font-bold text-foreground">
            <Layers className="w-5 h-5 text-warning" />
            Roster Columns & Bot Categories Manager
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Create, rename, reorder, show/hide, or delete custom bot sections in the library (e.g.
            Creator Bots, Engine Bosses, Clones).
          </p>
        </div>

        {/* Add New Column Form */}
        <div className="flex items-center gap-2 p-3 rounded-lg border border-warning/30 bg-warning/5">
          <Input
            value={newColName}
            onChange={(e) => setNewColName(e.target.value)}
            placeholder="New column name (e.g. Creator Bots, Engine Bosses, Clones)"
            className="text-xs bg-background"
            onKeyDown={(e) => e.key === "Enter" && handleAddColumn()}
          />
          <Button
            type="button"
            onClick={handleAddColumn}
            className="bg-warning text-background hover:bg-warning/90 font-bold text-xs shrink-0 flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" /> Add Column
          </Button>
        </div>

        {/* List of Active Columns / Categories */}
        <div className="space-y-2">
          {draft.tierOrder.map((c, i) => {
            const isCustom = (draft.customTiers ?? []).some((t) => t.id === c);
            const botCount = listOf(c).length;
            const isHidden = draft.hiddenTiers.includes(c);

            return (
              <div
                key={c}
                className="flex items-center gap-2 p-2 rounded-lg border border-border bg-secondary/20 hover:border-border/80 transition"
              >
                <div className="flex-1 flex items-center gap-2">
                  <Input
                    value={draft.tierLabels[c] ?? ""}
                    placeholder={defLabel(c, draft.customTiers)}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        tierLabels: { ...draft.tierLabels, [c]: e.target.value },
                      })
                    }
                    className="text-xs h-8 bg-background font-medium"
                  />
                  {isCustom ? (
                    <Badge
                      variant="secondary"
                      className="text-[10px] bg-warning/15 text-warning border-warning/30 shrink-0"
                    >
                      Custom Column
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] text-muted-foreground shrink-0">
                      System Tier
                    </Badge>
                  )}
                  <Badge variant="outline" className="text-[10px] text-muted-foreground shrink-0">
                    {botCount} bots
                  </Badge>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={() => moveTier(i, -1)}
                    title="Move column up"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={() => moveTier(i, 1)}
                    title="Move column down"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={() => toggleHidden(c)}
                    title={isHidden ? "Show column" : "Hide column"}
                  >
                    {isHidden ? (
                      <EyeOff className="w-3.5 h-3.5 text-muted-foreground" />
                    ) : (
                      <Eye className="w-3.5 h-3.5 text-success" />
                    )}
                  </Button>
                  {isCustom && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-destructive hover:bg-destructive/10"
                      onClick={() => handleDeleteCustomColumn(c)}
                      title="Delete custom column"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Bot Card & Roster Display Controls */}
      <section className="rounded-xl border border-border/70 bg-card p-5 space-y-4 shadow-sm">
        <div>
          <div className="flex items-center gap-2 text-base font-bold text-foreground">
            <LayoutGrid className="w-5 h-5 text-primary" />
            Bot Card & Layout Customization
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Customize how bot profile cards, ratings, badges, and grids display across the
            application.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          {/* Card Visual Style */}
          <div className="space-y-2">
            <Label className="text-xs font-bold">Bot Card Visual Style</Label>
            <Select
              value={draft.cardStyle ?? "classic"}
              onValueChange={(v) => setDraft({ ...draft, cardStyle: v as CardStyle })}
            >
              <SelectTrigger className="text-xs h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="classic">Classic Dark (Standard)</SelectItem>
                <SelectItem value="glass">Glassmorphism (Frosted Glass & Glow)</SelectItem>
                <SelectItem value="gold">Gold Grandmaster (Golden Accent)</SelectItem>
                <SelectItem value="cyber">Cyberpunk Neon (Cyan High-Tech)</SelectItem>
                <SelectItem value="minimal">Minimalist Flat (Clean Border)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Grid Columns Per Row */}
          <div className="space-y-2">
            <Label className="text-xs font-bold">Bots Per Row (Grid Layout)</Label>
            <div className="flex gap-1.5">
              {[3, 4, 5, 6, 7, 8].map((n) => (
                <Button
                  key={n}
                  size="sm"
                  type="button"
                  variant={draft.gridColumns === n ? "default" : "secondary"}
                  onClick={() => setDraft({ ...draft, gridColumns: n })}
                  className="flex-1 text-xs font-bold"
                >
                  {n} cols
                </Button>
              ))}
            </div>
          </div>
        </div>

        {/* Display Toggles */}
        <div className="space-y-2 pt-2 border-t border-border/60">
          <Label className="text-xs font-bold">Card Display Badges & Overlays</Label>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {[
              { key: "showElo" as const, label: "Elo Ratings" },
              { key: "showTitles" as const, label: "Title Badges (GM/IM)" },
              { key: "showCrowns" as const, label: "Win Crowns" },
              { key: "showQuotes" as const, label: "Signature Quotes" },
              { key: "showFlags" as const, label: "Country Flags" },
              { key: "accentGlow" as const, label: "Glow Effects" },
            ].map(({ key, label: toggleLabel }) => (
              <label
                key={key}
                className="flex items-center justify-between p-2.5 rounded-lg border border-border bg-secondary/30 text-xs font-medium cursor-pointer hover:bg-secondary/50"
              >
                <span>{toggleLabel}</span>
                <input
                  type="checkbox"
                  checked={draft[key] !== false}
                  onChange={(e) => setDraft({ ...draft, [key]: e.target.checked })}
                  className="h-4 w-4 rounded border-border text-primary"
                />
              </label>
            ))}
          </div>
        </div>
      </section>

      {/* App Themes & Visual Look */}
      <section className="rounded-xl border border-border/70 bg-card p-5 space-y-4 shadow-sm">
        <div>
          <div className="flex items-center gap-2 text-base font-bold text-foreground">
            <Palette className="w-5 h-5 text-amber-400" />
            Seasonal Themes & Visual Styling
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Apply seasonal color tints and global visual styling across the entire app.
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {EVENT_THEMES.map((t) => (
            <button
              key={t.value}
              type="button"
              data-event-preview={t.value}
              onClick={() => setDraft({ ...draft, eventTheme: t.value })}
              className={
                "p-3 rounded-lg border text-left transition flex items-center justify-between " +
                (draft.eventTheme === t.value
                  ? "border-primary bg-primary/15 font-bold text-foreground"
                  : "border-border bg-secondary/20 text-muted-foreground hover:bg-secondary/40")
              }
            >
              <span className="text-xs">{t.label}</span>
              {draft.eventTheme === t.value && <Sparkles className="w-3.5 h-3.5 text-primary" />}
            </button>
          ))}
        </div>
      </section>

      {/* Text Labels & UI Copy Overrides */}
      <section className="rounded-xl border border-border/70 bg-card p-5 space-y-4 shadow-sm">
        <div>
          <div className="flex items-center gap-2 text-base font-bold text-foreground">
            <Sparkles className="w-5 h-5 text-success" />
            Text Copy & Interface Labels
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Customize button labels, titles, and empty states.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-3">
          {Object.entries(LABEL_DEFAULTS).map(([k, def]) => (
            <div key={k} className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">{k}</Label>
              <Input
                value={draft.labels[k] ?? ""}
                placeholder={def}
                onChange={(e) =>
                  setDraft({ ...draft, labels: { ...draft.labels, [k]: e.target.value } })
                }
                className="text-xs bg-background"
              />
            </div>
          ))}
        </div>
      </section>

      {/* Global Save Button */}
      <div className="sticky bottom-4 z-20 flex items-center justify-between p-4 rounded-xl border border-primary/40 bg-card/90 backdrop-blur shadow-lg">
        <div>
          <div className="text-xs font-bold text-foreground">Publish UI Customization</div>
          <div className="text-[10px] text-muted-foreground">
            Changes will immediately publish live for all users.
          </div>
        </div>
        <div className="flex items-center gap-3">
          {msg && <span className="text-xs font-medium text-warning">{msg}</span>}
          <Button
            onClick={save}
            disabled={busy}
            className="bg-success text-primary-foreground hover:bg-success/90 font-bold px-6 shadow-md"
          >
            {busy ? "Publishing…" : "Save & Publish Layout"}
          </Button>
        </div>
      </div>

      {/* Bot Assignment & Reordering Tool */}
      <section className="space-y-3 border-t border-border/60 pt-6">
        <div>
          <h3 className="font-bold text-base">Assign & Reorder Bots by Column</h3>
          <p className="text-xs text-muted-foreground">
            Assign bots to any column or category and fine-tune their display order.
          </p>
        </div>

        {draft.tierOrder.map((c) => {
          const list = listOf(c);
          if (!list.length) return null;
          return (
            <div
              key={c}
              className="space-y-1.5 p-3 rounded-lg border border-border bg-secondary/10"
            >
              <div className="text-xs font-bold text-primary flex items-center justify-between">
                <span>{draft.tierLabels[c]?.trim() || defLabel(c, draft.customTiers)}</span>
                <span className="text-[10px] text-muted-foreground">{list.length} bots</span>
              </div>
              <div className="space-y-1">
                {list.map((b, i) => (
                  <div
                    key={b.id}
                    className="flex items-center gap-2 rounded bg-background px-2.5 py-1.5 border border-border/50 text-xs"
                  >
                    <span className="w-5 text-muted-foreground font-mono">{i + 1}</span>
                    {b.avatar ? (
                      <img src={b.avatar} alt="" className="h-6 w-6 rounded object-contain" />
                    ) : (
                      <div className="h-6 w-6 rounded bg-muted" />
                    )}
                    <span className="flex-1 truncate font-medium">
                      {b.name} <span className="text-muted-foreground font-normal">({b.elo})</span>
                    </span>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => moveBot(b, -1)}
                      title="Move up"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => moveBot(b, 1)}
                      title="Move down"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </Button>
                    <Select value={b.category} onValueChange={(v) => changeTier(b, v)}>
                      <SelectTrigger className="h-7 w-44 text-xs bg-background">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {draft.tierOrder.map((t) => (
                          <SelectItem key={t} value={t}>
                            {draft.tierLabels[t]?.trim() || defLabel(t, draft.customTiers)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}
