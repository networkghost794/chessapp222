import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const DEFAULT_LINES = [
  "Interesting position…",
  "You missed something there.",
  "Let's see how you handle this.",
  "Hmm, I have to think about this one.",
  "Bold choice.",
];

type Props = {
  active: boolean;
  lines?: string[];
  /** Minimum ms between bubbles. */
  minIntervalMs?: number;
  /** Maximum ms between bubbles. */
  maxIntervalMs?: number;
};

export function BotChatBubble({
  active,
  lines,
  minIntervalMs = 10_000,
  maxIntervalMs = 25_000,
}: Props) {
  const pool = (lines && lines.length > 0) ? lines : DEFAULT_LINES;
  const [text, setText] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!active) { setVisible(false); setText(null); return; }
    let cancelled = false;
    let showTimer: ReturnType<typeof setTimeout> | undefined;
    let hideTimer: ReturnType<typeof setTimeout> | undefined;
    let nextTimer: ReturnType<typeof setTimeout> | undefined;

    const schedule = () => {
      const delay = minIntervalMs + Math.random() * Math.max(0, maxIntervalMs - minIntervalMs);
      nextTimer = setTimeout(() => {
        if (cancelled) return;
        const line = pool[Math.floor(Math.random() * pool.length)];
        setText(line);
        // small tick to allow fade-in
        showTimer = setTimeout(() => !cancelled && setVisible(true), 20);
        hideTimer = setTimeout(() => {
          if (cancelled) return;
          setVisible(false);
          // remove after fade-out
          setTimeout(() => { if (!cancelled) { setText(null); schedule(); } }, 400);
        }, 4000 + 20);
      }, delay);
    };
    schedule();
    return () => {
      cancelled = true;
      if (showTimer) clearTimeout(showTimer);
      if (hideTimer) clearTimeout(hideTimer);
      if (nextTimer) clearTimeout(nextTimer);
    };
  }, [active, pool, minIntervalMs, maxIntervalMs]);

  if (!text) return null;

  return (
    <div
      className={cn(
        "pointer-events-none absolute -top-2 left-14 z-20 max-w-[260px] -translate-y-full",
        "rounded-2xl rounded-bl-sm bg-secondary/95 px-3 py-2 text-xs text-foreground",
        "ring-1 ring-border shadow-lg backdrop-blur",
        "transition-all duration-300",
        visible ? "opacity-100 translate-y-[-100%]" : "opacity-0 translate-y-[calc(-100%+6px)]",
      )}
    >
      {text}
      <span className="absolute -bottom-1 left-3 w-2 h-2 rotate-45 bg-secondary/95 ring-1 ring-border" />
    </div>
  );
}
