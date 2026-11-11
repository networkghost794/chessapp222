import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/useAuth";
import { toast } from "sonner";

type Q = { q: string; opts: { label: string; value: number }[] };

const QUESTIONS: Q[] = [
  {
    q: "How familiar are you with chess tactics?",
    opts: [
      { label: "I just learned how the pieces move", value: 400 },
      { label: "I know tricks like forks and pins", value: 500 },
      { label: "I study openings and calculate deep combinations", value: 1000 },
    ],
  },
  {
    q: "What is your main chess time control?",
    opts: [
      { label: "Untimed / Casual 30 minutes", value: 100 },
      { label: "Rapid 10-minute games", value: 50 },
      { label: "Fast Blitz / Bullet games", value: 0 },
    ],
  },
  {
    q: "Do you use an opening book structure?",
    opts: [
      { label: "No, I just move random pieces out", value: 0 },
      { label: "Yes, I have 1 or 2 favorite opening lines", value: 100 },
    ],
  },
];

export function PlacementTest({ open }: { open: boolean }) {
  const { user, refreshProfile } = useAuth();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);

  const choose = async (v: number) => {
    const next = [...answers, v];
    if (step < QUESTIONS.length - 1) {
      setAnswers(next);
      setStep(step + 1);
      return;
    }
    if (!user) return;
    const elo = next.reduce((a, b) => a + b, 0);
    setSaving(true);
    const { error } = await supabase.rpc("complete_placement_test", { _elo: elo });
    setSaving(false);
    if (error) toast.error(error.message);
    else {
      toast.success(`Placement complete · ${elo} Elo`);
      await refreshProfile();
    }
  };

  const cur = QUESTIONS[step];

  return (
    <Dialog open={open}>
      <DialogContent
        className="max-w-md"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Real-Elo Placement Test</DialogTitle>
          <DialogDescription>
            Question {step + 1} of {QUESTIONS.length} — answer honestly to calibrate your rating.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="text-sm font-medium">{cur.q}</div>
          <div className="space-y-2">
            {cur.opts.map((o) => (
              <button
                key={o.label}
                disabled={saving}
                onClick={() => choose(o.value)}
                className={cn(
                  "w-full text-left rounded-md border border-border bg-secondary/40 hover:bg-secondary px-3 py-2 text-sm transition-colors disabled:opacity-50",
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
          <div className="flex gap-1 pt-2">
            {QUESTIONS.map((_, i) => (
              <div
                key={i}
                className={cn("h-1 flex-1 rounded-full", i <= step ? "bg-primary" : "bg-secondary")}
              />
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
