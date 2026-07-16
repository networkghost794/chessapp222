import { useMemo } from "react";
import { cn } from "@/lib/utils";
import type { PositionEval } from "@/lib/stockfishEval";

/**
 * Vertical evaluation bar. Positive = White advantage.
 *
 * `evalData` is from side-to-move perspective; this component converts
 * it to an absolute White-perspective value for display.
 */
export function EvaluationBar({
  evalData,
  loading,
  height,
}: {
  evalData: PositionEval | null;
  loading?: boolean;
  height?: number;
}) {
  const { whitePct, label, mateSide } = useMemo(() => {
    if (!evalData) return { whitePct: 50, label: "0.0", mateSide: null as null | "w" | "b" };

    // Convert to White-perspective.
    let cp = evalData.cp;
    let mate = evalData.mate;
    if (evalData.turn === "b") {
      if (cp != null) cp = -cp;
      if (mate != null) mate = -mate;
    }

    if (mate != null) {
      const side = mate > 0 ? "w" : "b";
      const pct = mate > 0 ? 98 : 2;
      return { whitePct: pct, label: `M${Math.abs(mate)}`, mateSide: side as "w" | "b" };
    }
    const c = cp ?? 0;
    // Sigmoid-ish mapping (approx chess.com feel).
    const pawns = c / 100;
    const pct = 50 + 50 * (2 / (1 + Math.exp(-0.4 * pawns)) - 1);
    const clamped = Math.max(3, Math.min(97, pct));
    const sign = pawns >= 0 ? "+" : "";
    return { whitePct: clamped, label: `${sign}${pawns.toFixed(1)}`, mateSide: null };
  }, [evalData]);

  const blackPct = 100 - whitePct;
  const whiteAhead = whitePct >= 50;

  return (
    <div className="flex flex-col items-center gap-1 select-none" style={{ height }}>
      <div className="text-[10px] font-mono text-muted-foreground min-h-[14px]">
        {whiteAhead ? label : ""}
      </div>
      <div
        className={cn(
          "relative w-6 rounded-md overflow-hidden ring-1 ring-border bg-black",
          loading && "opacity-70",
        )}
        style={{ flex: "1 1 auto" }}
        title={evalData ? `Stockfish eval: ${label}` : "Evaluating…"}
      >
        <div
          className="absolute left-0 right-0 bottom-0 bg-white transition-[height] duration-300 ease-out"
          style={{ height: `${whitePct}%` }}
        />
        {/* midline */}
        <div className="absolute left-0 right-0 top-1/2 h-px bg-neutral-500/50" />
        {/* mate glow */}
        {mateSide && (
          <div
            className={cn(
              "absolute inset-0",
              mateSide === "w" ? "shadow-[inset_0_0_12px_2px_rgba(255,255,255,0.6)]" : "shadow-[inset_0_0_12px_2px_rgba(0,0,0,0.7)]",
            )}
          />
        )}
      </div>
      <div className="text-[10px] font-mono text-muted-foreground min-h-[14px]">
        {!whiteAhead ? label.replace("-", "") : ""}
        <span className="opacity-0">{blackPct.toFixed(0)}</span>
      </div>
    </div>
  );
}
