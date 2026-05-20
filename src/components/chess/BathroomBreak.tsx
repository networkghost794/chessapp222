import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

const QUOTES = [
  "“The winner of the game is the player who makes the next-to-last mistake.” — Savielly Tartakower",
  "“Chess is life in miniature. Chess is struggle, chess is battles.” — Garry Kasparov",
  "“When you see a good move, look for a better one.” — Emanuel Lasker",
  "“Chess teaches you control, patience, and the fact that one careless move can destroy everything.”",
  "Bobby Fischer once said: “I don't believe in psychology. I believe in good moves.”",
  "Fact: Mikhail Tal was known as “The Magician from Riga” because he attacked so fearlessly that opponents often collapsed under pressure even when his sacrifices were not fully correct.",
  "“A pawn is not just a pawn. One step at a time, it can become a queen.”",
  "A reminder that small progress becomes power over time.",
  "Fact: Magnus Carlsen became a grandmaster at only 13 years old, but spent thousands of hours studying losses, not just victories.",
  "“In chess, as in life, the king stays alive only when the whole army works together.”",
  "Fact: José Raúl Capablanca was so naturally talented that he reportedly learned chess simply by watching others play as a child.",
];

type Phase = "break" | "wash" | "lockout";

export function BathroomBreak({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [phase, setPhase] = useState<Phase>("break");
  const [qIdx, setQIdx] = useState(0);
  const [secs, setSecs] = useState(30);
  const [showAlert, setShowAlert] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setPhase("break"); setQIdx(0); setSecs(30); setShowAlert(false);
  }, [open]);

  useEffect(() => {
    if (!open || phase !== "break") return;
    const id = window.setInterval(() => setQIdx((i) => (i + 1) % QUOTES.length), 5500);
    return () => clearInterval(id);
  }, [open, phase]);

  useEffect(() => {
    if (phase !== "lockout") return;
    if (secs <= 0) { onClose(); return; }
    timerRef.current = window.setTimeout(() => setSecs((s) => s - 1), 1000);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [phase, secs, onClose]);

  if (!open) return null;

  return (
    <>
      {/* Blur overlay */}
      <div className="fixed inset-0 z-[100] backdrop-blur-md bg-background/70 animate-in fade-in duration-500" />

      <div className="fixed inset-0 z-[101] grid place-items-center p-4">
        <div className="w-full max-w-lg rounded-2xl bg-card border border-border/60 shadow-2xl p-8 text-center animate-in zoom-in-95 duration-300">
          <div className="text-7xl mb-4 drop-shadow-[0_0_25px_rgba(99,179,237,0.55)] animate-pulse">🚽</div>

          {phase === "break" && (
            <>
              <div className="text-xs uppercase tracking-[0.3em] text-primary mb-3">Bathroom Break</div>
              <p key={qIdx} className="text-base text-foreground/90 italic min-h-[5rem] leading-relaxed animate-in fade-in duration-700">
                {QUOTES[qIdx]}
              </p>
              <Button
                onClick={() => setPhase("wash")}
                className="mt-6 bg-success text-primary-foreground hover:bg-success/90 font-bold"
                size="lg"
              >
                🧼 I'm Back
              </Button>
            </>
          )}

          {phase === "wash" && (
            <>
              <h2 className="text-2xl font-bold mb-6">Did you wash your hands?</h2>
              <div className="flex justify-center gap-3">
                <Button
                  className="bg-success text-primary-foreground hover:bg-success/90 font-bold px-8"
                  onClick={() => onClose()}
                >
                  Yes
                </Button>
                <Button
                  variant="destructive"
                  className="font-bold px-8"
                  onClick={() => { setShowAlert(true); setPhase("lockout"); setSecs(30); }}
                >
                  No
                </Button>
              </div>
            </>
          )}

          {phase === "lockout" && (
            <>
              {showAlert && (
                <div className="rounded-md bg-destructive/15 border border-destructive/40 text-destructive px-3 py-2 text-sm font-semibold mb-4">
                  Go wash them! Hygiene first!
                </div>
              )}
              <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground mb-2">Locked</div>
              <div className="text-6xl font-black text-destructive tabular-nums">{secs}s</div>
              <p className="text-xs text-muted-foreground mt-3">Board stays locked until the timer ends.</p>
            </>
          )}
        </div>
      </div>
    </>
  );
}
