import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BOT_CATEGORIES, type BotCategory } from "@/lib/botStore";

/** Owner-editable UI customization, stored in app_settings under key "ui". */
export type UiSettings = {
  tierLabels: Partial<Record<BotCategory, string>>;
  tierOrder: BotCategory[];
  hiddenTiers: BotCategory[];
  gridColumns: number;
  labels: Record<string, string>;
  eventTheme: EventTheme;
};

export type EventTheme = "none" | "halloween" | "christmas" | "stpatricks" | "valentines" | "gold";
export const EVENT_THEMES: { value: EventTheme; label: string }[] = [
  { value: "none", label: "Default" },
  { value: "halloween", label: "Halloween" },
  { value: "christmas", label: "Christmas" },
  { value: "stpatricks", label: "St. Patrick's Day" },
  { value: "valentines", label: "Valentine's Day" },
  { value: "gold", label: "Gold Classic" },
];

/** Editable text labels: key -> default text. */
export const LABEL_DEFAULTS: Record<string, string> = {
  "playBots.title": "Play Bots",
  "playBots.play": "Play",
  "playBots.empty": "Pick a bot below to challenge.",
  "nav.home": "Home",
  "nav.playBots": "Play Bots",
  "nav.gameModes": "Game Modes",
  "nav.updates": "Updates",
  "nav.settings": "Settings",
};

const DEFAULTS: UiSettings = {
  tierLabels: {},
  tierOrder: BOT_CATEGORIES.map((c) => c.value),
  hiddenTiers: [],
  gridColumns: 5,
  labels: {},
  eventTheme: "none",
};

let cache: UiSettings = DEFAULTS;
let loaded = false;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

function normalize(v: Partial<UiSettings> | null | undefined): UiSettings {
  const all = BOT_CATEGORIES.map((c) => c.value);
  const order = (v?.tierOrder ?? []).filter((c) => all.includes(c));
  for (const c of all) if (!order.includes(c)) order.push(c);
  return {
    tierLabels: v?.tierLabels ?? {},
    tierOrder: order,
    hiddenTiers: (v?.hiddenTiers ?? []).filter((c) => all.includes(c)),
    gridColumns: Math.min(8, Math.max(3, Number(v?.gridColumns ?? 5))),
    labels: v?.labels ?? {},
    eventTheme: EVENT_THEMES.some((t) => t.value === v?.eventTheme) ? v!.eventTheme! : "none",
  };
}

export async function refreshUiSettings(): Promise<UiSettings> {
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "ui")
    .maybeSingle();
  cache = normalize(data?.value as Partial<UiSettings> | undefined);
  loaded = true;
  emit();
  return cache;
}

export async function saveUiSettings(next: UiSettings): Promise<string | null> {
  const { error } = await supabase
    .from("app_settings")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .upsert({ key: "ui", value: next as any, updated_at: new Date().toISOString() });
  if (error) return error.message;
  cache = normalize(next);
  emit();
  return null;
}

export function useUiSettings(): UiSettings {
  const [s, setS] = useState<UiSettings>(cache);
  useEffect(() => {
    const f = () => setS(cache);
    subs.add(f);
    if (!loaded) refreshUiSettings();
    else f();
    return () => {
      subs.delete(f);
    };
  }, []);
  return s;
}

/** Ordered, visible tiers with their (possibly renamed) labels. */
export function visibleTiers(s: UiSettings) {
  return s.tierOrder
    .filter((c) => !s.hiddenTiers.includes(c))
    .map((c) => ({
      value: c,
      label: s.tierLabels[c]?.trim() || BOT_CATEGORIES.find((x) => x.value === c)!.label,
    }));
}

export function label(s: UiSettings, key: string): string {
  return s.labels[key]?.trim() || LABEL_DEFAULTS[key] || key;
}

/** Applies the owner-chosen seasonal theme to the whole page. */
export function useEventTheme() {
  const s = useUiSettings();
  useEffect(() => {
    const el = document.documentElement;
    if (s.eventTheme === "none") el.removeAttribute("data-event");
    else el.setAttribute("data-event", s.eventTheme);
  }, [s.eventTheme]);
}
