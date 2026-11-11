import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BOT_CATEGORIES, type BotCategory } from "@/lib/botStore";

export type CustomTier = {
  id: string;
  name: string;
};

export type CardStyle = "classic" | "glass" | "gold" | "cyber" | "minimal";

/** Owner-editable UI customization, stored in app_settings under key "ui". */
export type UiSettings = {
  tierLabels: Record<string, string>;
  tierOrder: string[];
  hiddenTiers: string[];
  gridColumns: number;
  labels: Record<string, string>;
  eventTheme: EventTheme;
  customTiers?: CustomTier[];

  // Customization controls
  cardStyle?: CardStyle;
  showElo?: boolean;
  showTitles?: boolean;
  showCrowns?: boolean;
  showQuotes?: boolean;
  showFlags?: boolean;
  accentGlow?: boolean;
};

export type EventTheme =
  | "none"
  | "halloween"
  | "christmas"
  | "stpatricks"
  | "valentines"
  | "gold"
  | "cyberpunk"
  | "emerald"
  | "sunset";

export const EVENT_THEMES: { value: EventTheme; label: string }[] = [
  { value: "none", label: "Default Dark" },
  { value: "halloween", label: "Halloween Spooky" },
  { value: "christmas", label: "Festive Christmas" },
  { value: "stpatricks", label: "St. Patrick's Shamrock" },
  { value: "valentines", label: "Valentine Heart" },
  { value: "gold", label: "Gold Grandmaster" },
  { value: "cyberpunk", label: "Cyberpunk Neon" },
  { value: "emerald", label: "Emerald Forest" },
  { value: "sunset", label: "Sunset Crimson" },
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
  customTiers: [],
  cardStyle: "classic",
  showElo: true,
  showTitles: true,
  showCrowns: true,
  showQuotes: true,
  showFlags: true,
  accentGlow: false,
};

let cache: UiSettings = DEFAULTS;
let loaded = false;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

function normalize(v: Partial<UiSettings> | null | undefined): UiSettings {
  const customTiers = (v?.customTiers ?? []).filter((t) => t && t.id && t.name);
  const customIds = customTiers.map((t) => t.id);
  const all = [...BOT_CATEGORIES.map((c) => c.value), ...customIds];
  const order = (v?.tierOrder ?? []).filter((c) => all.includes(c));
  // Keep Personal at the top if not already present
  if (!order.includes("Personal")) {
    order.unshift("Personal");
  }
  for (const c of all) if (!order.includes(c)) order.push(c);
  return {
    tierLabels: v?.tierLabels ?? {},
    tierOrder: order,
    hiddenTiers: (v?.hiddenTiers ?? []).filter((c) => all.includes(c)),
    gridColumns: Math.min(8, Math.max(3, Number(v?.gridColumns ?? 5))),
    labels: v?.labels ?? {},
    eventTheme: EVENT_THEMES.some((t) => t.value === v?.eventTheme) ? v!.eventTheme! : "none",
    customTiers,
    cardStyle: v?.cardStyle ?? "classic",
    showElo: v?.showElo ?? true,
    showTitles: v?.showTitles ?? true,
    showCrowns: v?.showCrowns ?? true,
    showQuotes: v?.showQuotes ?? true,
    showFlags: v?.showFlags ?? true,
    accentGlow: v?.accentGlow ?? false,
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
  const customMap = new Map((s.customTiers ?? []).map((t) => [t.id, t.name]));
  return s.tierOrder
    .filter((c) => !s.hiddenTiers.includes(c))
    .map((c) => ({
      value: c,
      label:
        s.tierLabels[c]?.trim() ||
        customMap.get(c) ||
        BOT_CATEGORIES.find((x) => x.value === c)?.label ||
        c,
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
