import { useState } from "react";
import { Clock, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  makeCustomTimeControl,
  TIME_CONTROL_PRESETS,
  type TimeControlConfig,
} from "@/lib/timeControls";
import { getTimeControlFromSettings, useSettings } from "@/lib/settings";

export function TimeControlPicker({ compact = false }: { compact?: boolean }) {
  const [settings, updateSetting] = useSettings();
  const activeTc: TimeControlConfig = getTimeControlFromSettings(settings);
  const [customOpen, setCustomOpen] = useState(false);
  const [customMins, setCustomMins] = useState<string>(
    String(activeTc.baseMinutes > 0 ? activeTc.baseMinutes : 5),
  );
  const [customInc, setCustomInc] = useState<string>(String(activeTc.incrementSeconds));

  const applyTc = (baseMinutes: number, incrementSeconds: number) => {
    updateSetting("timeControlBaseMinutes", baseMinutes);
    updateSetting("timeControlIncrementSeconds", incrementSeconds);
  };

  const applyCustom = () => {
    const m = Math.max(1, Math.min(180, Math.round(Number(customMins) || 5)));
    const i = Math.max(0, Math.min(60, Math.round(Number(customInc) || 0)));
    const resolved = makeCustomTimeControl(m, i);
    applyTc(resolved.baseMinutes, resolved.incrementSeconds);
    setCustomOpen(false);
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[11px]">
        <span className="inline-flex items-center gap-1.5 font-semibold text-muted-foreground uppercase tracking-wide">
          <Clock className="w-3.5 h-3.5 text-primary" />
          Time Control
        </span>
        <span className="font-mono font-semibold text-foreground">{activeTc.label}</span>
      </div>

      <div className={cn("grid gap-1", compact ? "grid-cols-3" : "grid-cols-5")}>
        {TIME_CONTROL_PRESETS.map((tc) => {
          const isSelected = activeTc.id === tc.id;
          return (
            <button
              key={tc.id}
              type="button"
              onClick={() => applyTc(tc.baseMinutes, tc.incrementSeconds)}
              className={cn(
                "px-1.5 py-1.5 rounded border text-[11px] font-semibold transition-colors truncate",
                isSelected
                  ? "bg-primary/15 border-primary text-primary"
                  : "bg-secondary/40 border-border/60 text-muted-foreground hover:bg-secondary hover:text-foreground",
              )}
              title={
                tc.baseMinutes === 0
                  ? "No time limit"
                  : `${tc.baseMinutes} min + ${tc.incrementSeconds}s increment`
              }
            >
              {tc.label}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => {
            setCustomMins(String(activeTc.baseMinutes > 0 ? activeTc.baseMinutes : 5));
            setCustomInc(String(activeTc.incrementSeconds));
            setCustomOpen(true);
          }}
          className={cn(
            "px-1.5 py-1.5 rounded border text-[11px] font-semibold transition-colors inline-flex items-center justify-center gap-1",
            activeTc.id === "custom"
              ? "bg-primary/15 border-primary text-primary"
              : "bg-secondary/40 border-border/60 text-muted-foreground hover:bg-secondary hover:text-foreground",
          )}
          title="Configure custom base time & increment"
        >
          <SlidersHorizontal className="w-3 h-3" />
          <span>{activeTc.id === "custom" ? activeTc.label : "Custom"}</span>
        </button>
      </div>

      <Dialog open={customOpen} onOpenChange={setCustomOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Clock className="w-4 h-4 text-primary" />
              Custom Time Control
            </DialogTitle>
            <DialogDescription>
              Set base minutes (1–180) and increment per move (0–60s).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label htmlFor="tc-base-min" className="text-xs font-semibold">
                Base Time (minutes)
              </Label>
              <Input
                id="tc-base-min"
                type="number"
                min={1}
                max={180}
                value={customMins}
                onChange={(e) => setCustomMins(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && applyCustom()}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tc-inc-sec" className="text-xs font-semibold">
                Increment per Move (seconds)
              </Label>
              <Input
                id="tc-inc-sec"
                type="number"
                min={0}
                max={60}
                value={customInc}
                onChange={(e) => setCustomInc(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && applyCustom()}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" size="sm" onClick={() => setCustomOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={applyCustom}>
              Apply Time Control
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
