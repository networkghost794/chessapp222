import { useMemo } from "react";
import { useUiSettings } from "@/lib/appSettings";

/** Festive hat drawn on top of the profile avatar for the active event. */
export function EventHat() {
  const { eventTheme } = useUiSettings();
  if (eventTheme !== "christmas") return null;
  return (
    <svg viewBox="0 0 100 80" aria-hidden className="pointer-events-none absolute -top-9 -left-5 w-24 rotate-[-18deg] drop-shadow-lg">
      <path d="M12 62 C 30 20, 60 4, 88 30 C 76 30, 70 40, 72 58 Z" fill="var(--xmas-red)" />
      <circle cx="88" cy="30" r="9" fill="var(--xmas-snow)" />
      <rect x="4" y="56" width="76" height="16" rx="8" fill="var(--xmas-snow)" />
    </svg>
  );
}

const BULB_COLORS = ["var(--xmas-red)", "var(--xmas-gold)", "var(--xmas-green)", "var(--xmas-blue)"];

/** Page-wide seasonal decorations: string lights + gentle snowfall. */
export function EventDecor() {
  const { eventTheme } = useUiSettings();
  const flakes = useMemo(
    () => Array.from({ length: 40 }, (_, i) => ({
      left: (i * 37) % 100, size: 4 + ((i * 7) % 6), dur: 9 + ((i * 13) % 10), delay: -((i * 11) % 18),
    })), []);
  if (eventTheme !== "christmas") return null;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-40 overflow-hidden">
      <svg className="absolute top-0 left-0 w-full h-10" preserveAspectRatio="none" viewBox="0 0 1000 40">
        <path d="M0 4 Q 62 30 125 4 T 250 4 T 375 4 T 500 4 T 625 4 T 750 4 T 875 4 T 1000 4" stroke="var(--xmas-wire)" strokeWidth="2" fill="none" />
      </svg>
      <div className="absolute top-0 left-0 w-full flex justify-between px-2">
        {Array.from({ length: 32 }, (_, i) => (
          <span key={i} className="xmas-bulb" style={{
            background: BULB_COLORS[i % 4], color: BULB_COLORS[i % 4],
            marginTop: `${6 + Math.abs(Math.sin((i / 4) * Math.PI)) * 14}px`,
            animationDelay: `${(i % 4) * 0.4}s`,
          }} />
        ))}
      </div>
      {flakes.map((f, i) => (
        <span key={i} className="xmas-flake" style={{
          left: `${f.left}%`, width: f.size, height: f.size,
          animationDuration: `${f.dur}s`, animationDelay: `${f.delay}s`,
        }} />
      ))}
    </div>
  );
}
