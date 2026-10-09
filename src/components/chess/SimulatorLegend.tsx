import { Gauge } from "lucide-react";

const ITEMS = [
  { cls: "bg-sim-best", label: "Engine best", best: true },
  { cls: "bg-sim-good", label: "Natural choice" },
  { cls: "bg-sim-ok", label: "Playable" },
  { cls: "bg-sim-bad", label: "Would avoid" },
];

/** Slim status strip for the Strength Simulator. */
export function SimulatorLegend({ label, showBest = true }: { label: string; showBest?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-border/60 bg-card/60 px-4 py-2.5 text-[11px] text-muted-foreground">
      <span className="inline-flex items-center gap-2 text-foreground">
        <Gauge className="h-3.5 w-3.5 text-primary" />
        <span className="font-semibold uppercase tracking-[0.14em] text-[10px]">Strength Simulator</span>
        <span className="text-muted-foreground">·</span>
        <span className="font-semibold tabular-nums">{label}</span>
      </span>
      <span className="ml-auto flex flex-wrap items-center gap-4">
        {ITEMS.filter((i) => showBest || !i.best).map((i) => (
          <span key={i.label} className="inline-flex items-center gap-1.5">
            <span className={`h-1.5 w-1.5 rounded-full ${i.cls}`} />
            {i.label}
          </span>
        ))}
      </span>
    </div>
  );
}
