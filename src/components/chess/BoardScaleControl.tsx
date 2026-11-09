import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSettings } from "@/lib/settings";

export function BoardScaleControl({ className }: { className?: string }) {
  const [settings, update] = useSettings();
  const current = settings.boardSize || 100;

  const zoomOut = () => {
    update("boardSize", Math.max(70, current - 10));
  };

  const zoomIn = () => {
    update("boardSize", Math.min(160, current + 10));
  };

  const reset = () => {
    update("boardSize", 100);
  };

  return (
    <div
      className={`inline-flex items-center gap-0.5 bg-secondary/50 rounded-md p-0.5 border border-border/40 ${className ?? ""}`}
    >
      <Button
        variant="ghost"
        size="sm"
        className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
        onClick={zoomOut}
        disabled={current <= 70}
        title="Decrease board size (-10%)"
        aria-label="Decrease board size"
      >
        <Minus className="w-3 h-3" />
      </Button>
      <button
        onClick={reset}
        title="Reset board size to 100%"
        aria-label="Reset board size to 100%"
        className="px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground hover:text-foreground select-none cursor-pointer rounded hover:bg-secondary/80 transition-colors"
      >
        {current}%
      </button>
      <Button
        variant="ghost"
        size="sm"
        className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
        onClick={zoomIn}
        disabled={current >= 160}
        title="Increase board size (+10%)"
        aria-label="Increase board size"
      >
        <Plus className="w-3 h-3" />
      </Button>
    </div>
  );
}
