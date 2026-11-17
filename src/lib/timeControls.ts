export type TimeControlPresetId =
  "unlimited" | "1+0" | "3+0" | "3+2" | "5+0" | "10+0" | "15+10" | "30+0" | "custom";

export interface TimeControlConfig {
  id: TimeControlPresetId;
  label: string;
  baseMinutes: number; // 0 = unlimited, 1..180 = timed
  incrementSeconds: number; // 0..60
}

export const TIME_CONTROL_PRESETS: TimeControlConfig[] = [
  { id: "unlimited", label: "Unlimited", baseMinutes: 0, incrementSeconds: 0 },
  { id: "1+0", label: "1 min", baseMinutes: 1, incrementSeconds: 0 },
  { id: "3+0", label: "3 min", baseMinutes: 3, incrementSeconds: 0 },
  { id: "3+2", label: "3+2", baseMinutes: 3, incrementSeconds: 2 },
  { id: "5+0", label: "5 min", baseMinutes: 5, incrementSeconds: 0 },
  { id: "10+0", label: "10 min", baseMinutes: 10, incrementSeconds: 0 },
  { id: "15+10", label: "15+10", baseMinutes: 15, incrementSeconds: 10 },
  { id: "30+0", label: "30 min", baseMinutes: 30, incrementSeconds: 0 },
];

export const DEFAULT_TIME_CONTROL: TimeControlConfig = TIME_CONTROL_PRESETS[0]; // Unlimited by default

export function makeCustomTimeControl(
  baseMinutes: number,
  incrementSeconds: number,
): TimeControlConfig {
  const mins = Math.max(1, Math.min(180, Math.round(baseMinutes || 5)));
  const inc = Math.max(0, Math.min(60, Math.round(incrementSeconds || 0)));
  const matched = TIME_CONTROL_PRESETS.find(
    (p) => p.baseMinutes === mins && p.incrementSeconds === inc,
  );
  if (matched) return matched;
  return {
    id: "custom",
    label: inc > 0 ? `${mins}+${inc}` : `${mins} min`,
    baseMinutes: mins,
    incrementSeconds: inc,
  };
}

export function formatClockDisplay(ms: number | null): string {
  if (ms === null) return "∞";
  const clamped = Math.max(0, ms);
  if (clamped < 20_000) {
    const tenths = Math.floor(clamped / 100) / 10;
    return tenths.toFixed(1).padStart(4, "0"); // e.g. "19.4", "05.2", "00.0"
  }
  const totalSec = Math.ceil(clamped / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}
