import { Clock } from "lucide-react";
import { formatClockDisplay } from "@/lib/timeControls";
import { cn } from "@/lib/utils";

export function MatchClockBadge({
  ms,
  active,
  needsPunch = false,
}: {
  ms: number | null;
  active: boolean;
  needsPunch?: boolean;
}) {
  const isUnlimited = ms === null;
  const isUrgent = !isUnlimited && ms > 0 && ms < 20_000;
  const isFlagged = !isUnlimited && ms <= 0;
  const display = formatClockDisplay(ms);

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border font-mono text-xs sm:text-sm font-bold tabular-nums shrink-0 transition-colors",
        isFlagged
          ? "bg-red-600/25 border-red-500 text-red-400"
          : needsPunch
            ? "bg-amber-500/20 border-amber-400 text-amber-300"
            : active && isUrgent
              ? "bg-red-500/20 border-red-500/70 text-red-400"
              : active && !isUnlimited
                ? "bg-emerald-500/15 border-emerald-500/50 text-emerald-300"
                : active && isUnlimited
                  ? "bg-primary/15 border-primary/40 text-foreground"
                  : "bg-secondary/60 border-border/60 text-muted-foreground",
      )}
      title={
        isUnlimited
          ? "Unlimited time"
          : needsPunch
            ? "Hit your clock to end your turn"
            : active
              ? "Clock running"
              : "Clock paused"
      }
    >
      <Clock className="w-3.5 h-3.5 shrink-0 opacity-80" />
      <span>{display}</span>
    </div>
  );
}
