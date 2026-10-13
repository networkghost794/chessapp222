import { useMemo } from "react";
import { X, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type GameOutcome = "win" | "loss" | "draw";

const DEFAULT_LINES: Record<GameOutcome, string[]> = {
  win: ["Well played! You got me this time.", "Wow, I didn't see that coming.", "Nice game — I want a rematch!"],
  loss: ["Good game! Better luck next time.", "That was fun. Try again?", "Close one — you'll get me soon."],
  draw: ["A fair result. Good game!", "Nobody wins today. Again?", "Evenly matched!"],
};

export function GameOverModal({
  open, outcome, opponentName, opponentAvatar, reason, lines, onClose, onRematch, onNewGame,
}: {
  open: boolean;
  outcome: GameOutcome;
  opponentName: string;
  opponentAvatar?: string | null;
  reason: string;
  lines?: string[];
  onClose: () => void;
  onRematch: () => void;
  onNewGame: () => void;
}) {
  const quote = useMemo(() => {
    const pool = lines && lines.length ? lines : DEFAULT_LINES[outcome];
    return pool[Math.floor(Math.random() * pool.length)];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, outcome]);

  const confetti = useMemo(
    () => Array.from({ length: 60 }, (_, i) => ({
      left: Math.random() * 100,
      delay: Math.random() * 1.2,
      dur: 2.4 + Math.random() * 2,
      size: 5 + Math.random() * 7,
      round: i % 3 === 0,
    })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open],
  );

  if (!open) return null;

  const title =
    outcome === "win" ? `You Beat ${opponentName}!` : outcome === "loss" ? `${opponentName} Won` : "Draw";
  const icon = outcome === "win" ? "🏆" : outcome === "loss" ? "🏳️" : "🤝";

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-background/40 backdrop-blur-[2px] p-4" onClick={onClose}>
      {outcome === "win" && (
        <div className="pointer-events-none fixed inset-0 overflow-hidden">
          {confetti.map((c, i) => (
            <span
              key={i}
              className={cn("absolute top-0 bg-foreground/90 anim-confetti", c.round && "rounded-full")}
              style={{
                left: `${c.left}%`, width: c.size, height: c.size * (c.round ? 1 : 0.5),
                animationDelay: `${c.delay}s`, animationDuration: `${c.dur}s`,
              }}
            />
          ))}
        </div>
      )}
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-[400px] rounded-xl bg-card text-card-foreground shadow-2xl ring-1 ring-border p-5 anim-modal-in"
      >
        <button onClick={onClose} className="absolute top-3 right-3 text-muted-foreground hover:text-foreground" aria-label="Close">
          <X className="w-5 h-5" />
        </button>
        <div className="text-center">
          <h2 className="text-2xl font-extrabold tracking-tight">{icon} {title}</h2>
          <p className="mt-1 text-sm font-semibold text-muted-foreground">By {reason}</p>
        </div>

        <div className="mt-6 flex items-end gap-3">
          <div className="w-20 h-20 shrink-0 grid place-items-end">
            {opponentAvatar ? (
              <img src={opponentAvatar} alt={opponentName} className="max-h-full max-w-full object-contain object-bottom drop-shadow-lg" />
            ) : (
              <div className="w-16 h-16 rounded-full bg-secondary grid place-items-center"><User className="w-7 h-7 text-muted-foreground" /></div>
            )}
          </div>
          <div className="relative mb-3 flex-1 rounded-xl bg-foreground text-background px-4 py-3 text-sm font-medium">
            <span className="absolute -left-2 bottom-4 w-0 h-0 border-y-8 border-y-transparent border-r-8 border-r-foreground" />
            {quote}
          </div>
        </div>

        <Button
          onClick={onRematch}
          className="mt-5 w-full h-14 text-lg font-extrabold bg-success text-primary-foreground hover:bg-success/90 shadow-[0_4px_0_0_color-mix(in_oklab,var(--success)_60%,black)]"
        >
          Rematch
        </Button>
        <Button onClick={onNewGame} variant="secondary" className="mt-2 w-full h-11 font-bold">
          New Game
        </Button>
      </div>
    </div>
  );
}
