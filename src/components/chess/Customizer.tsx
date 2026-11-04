import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import {
  BOT_CATEGORIES, loadBots, subscribeBots, reorderCategory, type BotConfig, type BotCategory,
} from "@/lib/botStore";
import { EVENT_THEMES, LABEL_DEFAULTS, saveUiSettings, useUiSettings, type UiSettings } from "@/lib/appSettings";

const defLabel = (c: BotCategory) => BOT_CATEGORIES.find((x) => x.value === c)!.label;

/** Owner-only: rename/reorder tiers, set grid columns, edit labels, move & reorder bots. */
export function Customizer() {
  const saved = useUiSettings();
  const [draft, setDraft] = useState<UiSettings>(saved);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [bots, setBots] = useState<BotConfig[]>(loadBots());

  useEffect(() => setDraft(saved), [saved]);
  useEffect(() => subscribeBots(() => setBots(loadBots())), []);

  const moveTier = (i: number, d: number) => {
    const o = [...draft.tierOrder]; const j = i + d;
    if (j < 0 || j >= o.length) return;
    [o[i], o[j]] = [o[j], o[i]];
    setDraft({ ...draft, tierOrder: o });
  };
  const toggleHidden = (c: BotCategory) => setDraft({
    ...draft,
    hiddenTiers: draft.hiddenTiers.includes(c) ? draft.hiddenTiers.filter((x) => x !== c) : [...draft.hiddenTiers, c],
  });

  const save = async () => {
    setBusy(true); setMsg("");
    const err = await saveUiSettings(draft);
    setBusy(false);
    setMsg(err ? `Could not save: ${err}` : "Saved — live for everyone.");
  };

  const listOf = (c: BotCategory) => bots.filter((b) => b.category === c).sort((a, b) => a.orderIndex - b.orderIndex);

  const moveBot = async (b: BotConfig, d: number) => {
    const ids = listOf(b.category).map((x) => x.id);
    const i = ids.indexOf(b.id); const j = i + d;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    await reorderCategory(b.category, ids);
  };
  const changeTier = async (b: BotConfig, c: BotCategory) => {
    await reorderCategory(c, [...listOf(c).map((x) => x.id), b.id]);
  };

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h3 className="text-sm font-bold">Special event look</h3>
        <p className="text-xs text-muted-foreground">Tints the whole app for everyone. Click Save below to publish.</p>
        <div className="flex flex-wrap gap-2">
          {EVENT_THEMES.map((t) => (
            <button key={t.value} type="button" data-event-preview={t.value}
              onClick={() => setDraft({ ...draft, eventTheme: t.value })}
              className={"h-9 px-3 rounded-md text-xs font-semibold ring-1 " + (draft.eventTheme === t.value ? "ring-primary bg-primary/15 text-foreground" : "ring-border text-muted-foreground hover:text-foreground")}>
              {t.label}
            </button>
          ))}
        </div>
      </section>
      <section className="space-y-2">
        <h3 className="font-bold">Bot sections</h3>
        <p className="text-xs text-muted-foreground">Rename, reorder or hide sections in Play Bots.</p>
        {draft.tierOrder.map((c, i) => (
          <div key={c} className="flex items-center gap-2">
            <Input
              value={draft.tierLabels[c] ?? ""}
              placeholder={defLabel(c)}
              onChange={(e) => setDraft({ ...draft, tierLabels: { ...draft.tierLabels, [c]: e.target.value } })}
            />
            <Button size="icon" variant="ghost" onClick={() => moveTier(i, -1)}><ArrowUp className="w-4 h-4" /></Button>
            <Button size="icon" variant="ghost" onClick={() => moveTier(i, 1)}><ArrowDown className="w-4 h-4" /></Button>
            <Button size="icon" variant="ghost" onClick={() => toggleHidden(c)} title="Show / hide">
              {draft.hiddenTiers.includes(c) ? <EyeOff className="w-4 h-4 text-muted-foreground" /> : <Eye className="w-4 h-4" />}
            </Button>
          </div>
        ))}
      </section>

      <section className="space-y-2">
        <h3 className="font-bold">Bots per row</h3>
        <div className="flex gap-1.5">
          {[3, 4, 5, 6, 7, 8].map((n) => (
            <Button key={n} size="sm" variant={draft.gridColumns === n ? "default" : "secondary"}
              onClick={() => setDraft({ ...draft, gridColumns: n })}>{n}</Button>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="font-bold">Text labels</h3>
        <div className="grid md:grid-cols-2 gap-2">
          {Object.entries(LABEL_DEFAULTS).map(([k, def]) => (
            <div key={k}>
              <Label className="text-[10px] text-muted-foreground">{k}</Label>
              <Input value={draft.labels[k] ?? ""} placeholder={def}
                onChange={(e) => setDraft({ ...draft, labels: { ...draft.labels, [k]: e.target.value } })} />
            </div>
          ))}
        </div>
      </section>

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={busy} className="bg-success text-primary-foreground hover:bg-success/90 font-bold">
          {busy ? "Saving…" : "Save layout & labels"}
        </Button>
        {msg && <span className="text-xs text-muted-foreground">{msg}</span>}
      </div>

      <section className="space-y-3 border-t border-border/60 pt-4">
        <h3 className="font-bold">Move & order bots</h3>
        <p className="text-xs text-muted-foreground">Changes save instantly.</p>
        {draft.tierOrder.map((c) => {
          const list = listOf(c);
          if (!list.length) return null;
          return (
            <div key={c} className="space-y-1">
              <div className="text-xs font-semibold text-muted-foreground">{draft.tierLabels[c]?.trim() || defLabel(c)}</div>
              {list.map((b, i) => (
                <div key={b.id} className="flex items-center gap-2 rounded bg-secondary/40 px-2 py-1">
                  <span className="text-xs w-5 text-muted-foreground">{i + 1}</span>
                  {b.avatar && <img src={b.avatar} alt="" className="h-7 w-7 object-contain" />}
                  <span className="flex-1 text-sm truncate">{b.name} <span className="text-muted-foreground">({b.elo})</span></span>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => moveBot(b, -1)}><ArrowUp className="w-3.5 h-3.5" /></Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => moveBot(b, 1)}><ArrowDown className="w-3.5 h-3.5" /></Button>
                  <Select value={b.category} onValueChange={(v) => changeTier(b, v as BotCategory)}>
                    <SelectTrigger className="h-7 w-36 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {draft.tierOrder.map((t) => (
                        <SelectItem key={t} value={t}>{draft.tierLabels[t]?.trim() || defLabel(t)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          );
        })}
      </section>
    </div>
  );
}
