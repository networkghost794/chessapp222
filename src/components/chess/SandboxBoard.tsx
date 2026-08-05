import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chess, type PieceSymbol, type Square } from "chess.js";
import { Board } from "./Board";
import { PromotionDialog } from "./PromotionDialog";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ArrowLeft, FlipHorizontal2, Grid3x3, RotateCcw, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { playMoveResultSound } from "@/lib/sounds";
import { evaluatePerspective, PERSPECTIVE_RATINGS, type MoveVerdict } from "@/lib/perspectiveEval";

/**
 * Sandbox Board — a free-play board where the user moves both sides.
 * No bot, no engine analysis. Optionally overlays the existing
 * "Play Through Their Eyes" perspective indicators.
 */
export function SandboxBoard({ onBack }: { onBack: () => void }) {
  const gameRef = useRef(new Chess());
  const game = gameRef.current;

  const [, setTick] = useState(0);
  const force = useCallback(() => setTick((t) => t + 1), []);

  const [flipped, setFlipped] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [lastMove, setLastMove] = useState<{ from: Square; to: Square } | null>(null);
  const [promotion, setPromotion] = useState<{ from: Square; to: Square } | null>(null);

  const [perspectiveOn, setPerspectiveOn] = useState(false);
  const [rating, setRating] = useState<number>(1200);
  const [indicators, setIndicators] = useState<Record<string, MoveVerdict> | null>(null);
  const [bestFrom, setBestFrom] = useState<string | null>(null);

  const finishMove = useCallback(
    (from: Square, to: Square, promo?: PieceSymbol) => {
      const m = game.move({ from, to, promotion: promo as "q" | "r" | "b" | "n" | undefined });
      if (!m) return false;
      playMoveResultSound(m);
      setHistory((h) => [...h, m.san]);
      setLastMove({ from, to });
      setIndicators(null);
      setBestFrom(null);
      force();
      return true;
    },
    [game, force],
  );

  const handleAttemptMove = useCallback(
    (from: Square, to: Square) => {
      const piece = game.get(from);
      if (!piece) return false;
      const legal = (game.moves({ square: from, verbose: true }) as Array<{ to: string; promotion?: string }>)
        .filter((m) => m.to === to);
      if (legal.length === 0) return false;
      if (legal.some((m) => m.promotion)) {
        setPromotion({ from, to });
        return true;
      }
      return finishMove(from, to);
    },
    [game, finishMove],
  );

  const reset = () => {
    game.reset();
    setHistory([]);
    setLastMove(null);
    setIndicators(null);
    setBestFrom(null);
    force();
  };

  const undo = () => {
    const m = game.undo();
    if (!m) return;
    setHistory((h) => h.slice(0, -1));
    setLastMove(null);
    setIndicators(null);
    setBestFrom(null);
    force();
  };

  // Perspective indicators — recomputed on every position change while enabled.
  useEffect(() => {
    if (!perspectiveOn || game.isGameOver()) {
      setIndicators(null);
      setBestFrom(null);
      return;
    }
    let cancelled = false;
    const fen = game.fen();
    void evaluatePerspective(fen, rating).then((res) => {
      if (cancelled) return;
      setIndicators(res.bySquare as Record<string, MoveVerdict>);
      const bestKey = Object.entries(res.byMove).find(([, v]) => v === "purple")?.[0] ?? null;
      setBestFrom(bestKey ? bestKey.slice(0, 2) : null);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perspectiveOn, rating, history.length, game]);

  const moveRows = useMemo(() => {
    const rows: Array<{ n: number; w: string; b?: string }> = [];
    for (let i = 0; i < history.length; i += 2) rows.push({ n: i / 2 + 1, w: history[i], b: history[i + 1] });
    return rows;
  }, [history]);

  const statusText = game.isCheckmate()
    ? `Checkmate — ${game.turn() === "w" ? "White" : "Black"} is mated`
    : game.isDraw()
      ? "Draw"
      : game.inCheck()
        ? `${game.turn() === "w" ? "White" : "Black"} is in check`
        : `${game.turn() === "w" ? "White" : "Black"} to move`;

  return (
    <div className="max-w-[1200px] mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3">
        <header className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-md bg-primary/15 grid place-items-center ring-1 ring-primary/30">
            <Grid3x3 className="w-5 h-5 text-primary" />
          </div>
          <div>
            <div className="text-xl font-bold leading-tight">Sandbox Board</div>
            <div className="text-xs text-muted-foreground">
              Play both sides freely — explore ideas, no opponent.
            </div>
          </div>
        </header>
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-1.5" /> Back
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] gap-6">
        <section className="space-y-3 min-w-0">
          <Card className="p-4 md:p-5 bg-card min-w-0">
            <div className="flex items-center justify-between mb-3 gap-2">
              <div className="text-sm font-medium truncate">{statusText}</div>
              <div className="flex items-center gap-1 shrink-0">
                <Button variant="ghost" size="sm" onClick={undo} disabled={history.length === 0}>
                  <Undo2 className="w-3.5 h-3.5" />
                </Button>
                <Button variant="ghost" size="sm" onClick={reset}>
                  <RotateCcw className="w-3.5 h-3.5" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setFlipped((f) => !f)}>
                  <FlipHorizontal2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
            <div className="mx-auto w-full max-w-[calc(min(65vh,560px)*var(--board-scale,1))]">
              <Board
                game={game}
                flipped={flipped}
                disabled={game.isGameOver()}
                lastMove={lastMove}
                onAttemptMove={handleAttemptMove}
                indicators={perspectiveOn ? indicators : null}
                bestFrom={perspectiveOn ? bestFrom : null}
              />
            </div>
          </Card>

          {perspectiveOn && (
            <Card className="bg-card p-3 flex flex-wrap items-center gap-4 text-[11px] text-muted-foreground">
              <span className="font-semibold text-foreground">Through the eyes of {rating}</span>
              <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-violet-500" /> Best move</span>
              <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-400" /> Strong</span>
              <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-400" /> Playable</span>
              <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-rose-500" /> Weak</span>
            </Card>
          )}
        </section>

        <aside className="flex flex-col gap-3">
          <Card className="bg-card p-3 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">Play Through Their Eyes</div>
                <div className="text-[11px] text-muted-foreground">
                  Show how a given strength would view the position.
                </div>
              </div>
              <Switch checked={perspectiveOn} onCheckedChange={setPerspectiveOn} />
            </div>
            {perspectiveOn && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {PERSPECTIVE_RATINGS.map((r) => (
                  <button
                    key={r}
                    onClick={() => setRating(r)}
                    className={cn(
                      "px-2.5 py-1 rounded-md text-xs font-semibold border transition-colors",
                      rating === r
                        ? "bg-primary/15 border-primary/40 text-foreground"
                        : "bg-secondary/30 border-transparent hover:bg-secondary/60 text-muted-foreground",
                    )}
                  >
                    {r}
                  </button>
                ))}
              </div>
            )}
          </Card>

          <Card className="bg-card p-3 flex-1 min-h-[220px]">
            <div className="text-sm font-semibold mb-2 px-1">Moves</div>
            <div className="max-h-[440px] overflow-auto scroll-thin rounded-md">
              {moveRows.length === 0 ? (
                <div className="text-xs text-muted-foreground px-2 py-4">No moves yet.</div>
              ) : (
                <table className="w-full text-sm">
                  <tbody>
                    {moveRows.map((r) => (
                      <tr key={r.n} className="odd:bg-secondary/20">
                        <td className="py-1 px-2 text-muted-foreground w-8">{r.n}.</td>
                        <td className="py-1 px-2 font-medium">{r.w}</td>
                        <td className="py-1 px-2 font-medium">{r.b ?? ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </Card>
        </aside>
      </div>

      <PromotionDialog
        open={!!promotion}
        color={game.turn()}
        onSelect={(p) => {
          if (promotion) finishMove(promotion.from, promotion.to, p);
          setPromotion(null);
        }}
      />
    </div>
  );
}
