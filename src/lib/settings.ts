// Unified, persisted user preferences (purely cosmetic / UX — no engine impact).
// Values are stored in localStorage and broadcast so every mounted component
// reacts immediately.

import { useCallback, useEffect, useState } from "react";
import { findBoardTheme } from "./boardThemes";
import {
  makeCustomTimeControl,
  TIME_CONTROL_PRESETS,
  type TimeControlConfig,
} from "./timeControls";

export type ThemeMode = "dark" | "light" | "auto";
export type Environment3DId = "library" | "garden" | "club" | "penthouse" | "hall";
export type BoardMaterial3DId = "walnut" | "marble" | "mahogany" | "glass";
export type PieceDesign3DId = "staunton_wood" | "staunton_marble" | "modern_metal";
export type ClockStyle3DId = "analog_vintage" | "digital_tournament";
export type ClockSide3D = "left" | "right";
export type CameraPreset3D = "overhead" | "seated_front" | "perspective_angled";
export type GraphicsQuality3D = "low" | "medium" | "high";

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
  /** Optional 3D tabletop presentation (disabled by default). */
  immersive3D: boolean;
  environment3D: Environment3DId;
  boardMaterial3D: BoardMaterial3DId;
  pieceDesign3D: PieceDesign3DId;
  clockStyle3D: ClockStyle3DId;
  clockSide3D: ClockSide3D;
  cameraPreset3D: CameraPreset3D;
  graphicsQuality3D: GraphicsQuality3D;
  /** Require player to punch the physical clock after moving. */
  manualClockPunch: boolean;
  /** Bot match time control: 0 = unlimited, 1..180 = base minutes. */
  timeControlBaseMinutes: number;
  /** Increment in seconds per move (0..60). */
  timeControlIncrementSeconds: number;
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
  immersive3D: false,
  environment3D: "library",
  boardMaterial3D: "walnut",
  pieceDesign3D: "staunton_wood",
  clockStyle3D: "analog_vintage",
  clockSide3D: "right",
  cameraPreset3D: "seated_front",
  graphicsQuality3D: "high",
  manualClockPunch: false,
  timeControlBaseMinutes: 0,
  timeControlIncrementSeconds: 0,
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
  immersive3D: "botboard-immersive-3d",
  environment3D: "botboard-3d-env",
  boardMaterial3D: "botboard-3d-board",
  pieceDesign3D: "botboard-3d-pieces",
  clockStyle3D: "botboard-3d-clock",
  clockSide3D: "botboard-3d-clock-side",
  cameraPreset3D: "botboard-3d-cam",
  graphicsQuality3D: "botboard-3d-quality",
  manualClockPunch: "botboard-3d-manual-punch",
  timeControlBaseMinutes: "botboard-tc-base",
  timeControlIncrementSeconds: "botboard-tc-inc",
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

function readEnum<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const v = localStorage.getItem(key) as T | null;
    return v && allowed.includes(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

function readInt(key: string, min: number, max: number, fallback: number): number {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    const n = Number(raw);
    return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : fallback;
  } catch {
    return fallback;
  }
}

const ENVS_3D: readonly Environment3DId[] = ["library", "garden", "club", "penthouse", "hall"];
const BOARDS_3D: readonly BoardMaterial3DId[] = ["walnut", "marble", "mahogany", "glass"];
const PIECES_3D: readonly PieceDesign3DId[] = ["staunton_wood", "staunton_marble", "modern_metal"];
const CLOCKS_3D: readonly ClockStyle3DId[] = ["analog_vintage", "digital_tournament"];
const CLOCK_SIDES_3D: readonly ClockSide3D[] = ["left", "right"];
const CAMS_3D: readonly CameraPreset3D[] = ["overhead", "seated_front", "perspective_angled"];
const QUALITIES_3D: readonly GraphicsQuality3D[] = ["low", "medium", "high"];

export function getTimeControlFromSettings(settings: Settings): TimeControlConfig {
  if (settings.timeControlBaseMinutes <= 0) return TIME_CONTROL_PRESETS[0];
  return makeCustomTimeControl(
    settings.timeControlBaseMinutes,
    settings.timeControlIncrementSeconds,
  );
}

export function getSettings(): Settings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  let theme: ThemeMode = DEFAULT_SETTINGS.theme;
  let boardSize = DEFAULT_SETTINGS.boardSize;
  try {
    const t = localStorage.getItem(KEYS.theme);
    if (t === "dark" || t === "light" || t === "auto") theme = t;
    const s = Number(localStorage.getItem(KEYS.boardSize));
    if (Number.isFinite(s) && s >= 60 && s <= 160) boardSize = s;
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
    immersive3D: readBool(KEYS.immersive3D, DEFAULT_SETTINGS.immersive3D),
    environment3D: readEnum(KEYS.environment3D, ENVS_3D, DEFAULT_SETTINGS.environment3D),
    boardMaterial3D: readEnum(KEYS.boardMaterial3D, BOARDS_3D, DEFAULT_SETTINGS.boardMaterial3D),
    pieceDesign3D: readEnum(KEYS.pieceDesign3D, PIECES_3D, DEFAULT_SETTINGS.pieceDesign3D),
    clockStyle3D: readEnum(KEYS.clockStyle3D, CLOCKS_3D, DEFAULT_SETTINGS.clockStyle3D),
    clockSide3D: readEnum(KEYS.clockSide3D, CLOCK_SIDES_3D, DEFAULT_SETTINGS.clockSide3D),
    cameraPreset3D: readEnum(KEYS.cameraPreset3D, CAMS_3D, DEFAULT_SETTINGS.cameraPreset3D),
    graphicsQuality3D: readEnum(
      KEYS.graphicsQuality3D,
      QUALITIES_3D,
      DEFAULT_SETTINGS.graphicsQuality3D,
    ),
    manualClockPunch: readBool(KEYS.manualClockPunch, DEFAULT_SETTINGS.manualClockPunch),
    timeControlBaseMinutes: readInt(
      KEYS.timeControlBaseMinutes,
      0,
      180,
      DEFAULT_SETTINGS.timeControlBaseMinutes,
    ),
    timeControlIncrementSeconds: readInt(
      KEYS.timeControlIncrementSeconds,
      0,
      60,
      DEFAULT_SETTINGS.timeControlIncrementSeconds,
    ),
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
