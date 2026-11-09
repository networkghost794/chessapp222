// Unified, persisted user preferences (purely cosmetic / UX — no engine impact).
// Values are stored in localStorage and broadcast so every mounted component
// reacts immediately.

import { useCallback, useEffect, useState } from "react";
import { findBoardTheme } from "./boardThemes";

export type ThemeMode = "dark" | "light" | "auto";

export type Settings = {
  theme: ThemeMode;
  sound: boolean;
  animations: boolean;
  botSpeech: boolean;
  immersive: boolean;
  /** Board scale in percent (60–130). */
  boardSize: number;
  pieceSet: string;
  boardTheme: string;
};

export const DEFAULT_SETTINGS: Settings = {
  theme: "dark",
  sound: true,
  animations: true,
  botSpeech: true,
  immersive: false,
  boardSize: 100,
  pieceSet: "neo",
  boardTheme: "green",
};

const KEYS: Record<keyof Settings, string> = {
  theme: "botboard-theme",
  sound: "botboard-sound",
  animations: "botboard-anim",
  botSpeech: "botboard-speech",
  immersive: "botboard-immersive",
  boardSize: "botboard-board-size",
  pieceSet: "botboard-piece-set",
  boardTheme: "botboard-board-theme",
};

const EVENT = "botboard-settings-change";

function readBool(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === "true" || v === "on" || v === "1";
  } catch {
    return fallback;
  }
}

export function getSettings(): Settings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  let theme: ThemeMode = DEFAULT_SETTINGS.theme;
  let boardSize = DEFAULT_SETTINGS.boardSize;
  try {
    const t = localStorage.getItem(KEYS.theme);
    if (t === "dark" || t === "light" || t === "auto") theme = t;
    const s = Number(localStorage.getItem(KEYS.boardSize));
    if (Number.isFinite(s) && s >= 60 && s <= 130) boardSize = s;
  } catch {
    /* ignore */
  }
  return {
    theme,
    sound: readBool(KEYS.sound, DEFAULT_SETTINGS.sound),
    animations: readBool(KEYS.animations, DEFAULT_SETTINGS.animations),
    botSpeech: readBool(KEYS.botSpeech, DEFAULT_SETTINGS.botSpeech),
    immersive: readBool(KEYS.immersive, DEFAULT_SETTINGS.immersive),
    boardSize,
    pieceSet: (() => {
      try {
        return localStorage.getItem(KEYS.pieceSet) || "neo";
      } catch {
        return "neo";
      }
    })(),
    boardTheme: (() => {
      try {
        return localStorage.getItem(KEYS.boardTheme) || "green";
      } catch {
        return "green";
      }
    })(),
  };
}

export function setSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
  try {
    localStorage.setItem(KEYS[key], String(value));
  } catch {
    /* ignore */
  }
  if (key === "theme") applyTheme(value as ThemeMode);
  if (key === "animations") applyAnimations(value as boolean);
  if (key === "boardSize") applyBoardSize(value as number);
  if (key === "boardTheme") applyBoardTheme(value as string);
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(EVENT));
}

/* ---------------- theme application ---------------- */

function prefersDark(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return true;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function resolveTheme(mode: ThemeMode): "dark" | "light" {
  return mode === "auto" ? (prefersDark() ? "dark" : "light") : mode;
}

export function applyTheme(mode: ThemeMode) {
  if (typeof document === "undefined") return;
  const resolved = resolveTheme(mode);
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  root.classList.toggle("light", resolved === "light");
  root.style.colorScheme = resolved;
}

export function applyAnimations(enabled: boolean) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("no-anim", !enabled);
}

export function applyBoardSize(percent: number) {
  if (typeof document === "undefined") return;
  const clamped = Math.max(60, Math.min(160, percent || 100));
  document.documentElement.style.setProperty("--board-scale", String(clamped / 100));
}

export function applyBoardTheme(id: string) {
  if (typeof document === "undefined") return;
  const t = findBoardTheme(id);
  document.documentElement.style.setProperty("--board-light", t.light);
  document.documentElement.style.setProperty("--board-dark", t.dark);
}

/** Mount once (root) — applies stored preferences and follows the OS theme. */
export function initSettingsEffects(): () => void {
  const s = getSettings();
  applyTheme(s.theme);
  applyAnimations(s.animations);
  applyBoardSize(s.boardSize);
  applyBoardTheme(s.boardTheme);

  const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
  const onOsChange = () => {
    if (getSettings().theme === "auto") applyTheme("auto");
  };
  mq?.addEventListener?.("change", onOsChange);
  return () => mq?.removeEventListener?.("change", onOsChange);
}

/* ---------------- react access ---------------- */

export function useSettings(): [
  Settings,
  <K extends keyof Settings>(k: K, v: Settings[K]) => void,
] {
  const [state, setState] = useState<Settings>(DEFAULT_SETTINGS);

  useEffect(() => {
    setState(getSettings());
    const sync = () => setState(getSettings());
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const update = useCallback(<K extends keyof Settings>(k: K, v: Settings[K]) => {
    setSetting(k, v);
    setState((prev) => ({ ...prev, [k]: v }));
  }, []);

  return [state, update];
}

/** Non-reactive helpers for modules outside React. */
export const settingEnabled = {
  sound: () => getSettings().sound,
  animations: () => getSettings().animations,
  botSpeech: () => getSettings().botSpeech,
};
