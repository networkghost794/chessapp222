import { useMemo, useState } from "react";
import { Chess, type Square } from "chess.js";
import { PieceImg } from "./pieces";
import { cn } from "@/lib/utils";

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;
const RANKS = [8, 7, 6, 5, 4, 3, 2, 1] as const;

export type PromotionRequest = { from: Square; to: Square };

interface BoardProps {
  game: Chess;
  flipped: boolean;
  disabled: boolean;
  lastMove: { from: Square; to: Square } | null;
  onAttemptMove: (from: Square, to: Square) => boolean;
}

export function Board({ game, flipped, disabled, lastMove, onAttemptMove }: BoardProps) {
  const [selected, setSelected] = useState<Square | null>(null);
  const [dragOver, setDragOver] = useState<Square | null>(null);

  const files = flipped ? [...FILES].reverse() : FILES;
  const ranks = flipped ? [...RANKS].reverse() : RANKS;

  const legalTargets = useMemo<Set<string>>(() => {
    if (!selected) return new Set();
    const moves = game.moves({ square: selected, verbose: true }) as Array<{ to: string }>;
    return new Set(moves.map((m) => m.to));
  }, [selected, game]);

  const inCheckSquare = useMemo<Square | null>(() => {
    if (!game.inCheck()) return null;
    const turn = game.turn();
    for (const rank of RANKS) {
      for (const file of FILES) {
        const sq = (file + rank) as Square;
        const p = game.get(sq);
        if (p && p.type === "k" && p.color === turn) return sq;
      }
    }
    return null;
  }, [game]);

  const handleDrop = (to: Square) => {
    if (!selected || disabled) return;
    if (onAttemptMove(selected, to)) {
      setSelected(null);
    }
    setDragOver(null);
  };

  const handleSquareClick = (sq: Square) => {
    if (disabled) return;
    const piece = game.get(sq);
    if (selected && selected !== sq) {
      if (onAttemptMove(selected, sq)) {
        setSelected(null);
        return;
      }
    }
    if (piece && piece.color === game.turn()) {
      setSelected(sq);
    } else {
      setSelected(null);
    }
  };

  return (
    <div className="aspect-square w-full max-w-[min(80vh,640px)] mx-auto select-none">
      <div className="grid grid-cols-8 grid-rows-8 w-full h-full rounded-xl overflow-hidden shadow-2xl ring-1 ring-border">
        {ranks.map((rank, rIdx) =>
          files.map((file, fIdx) => {
            const sq = (file + rank) as Square;
            const isDark = (rIdx + fIdx) % 2 === 1;
            const piece = game.get(sq);
            const isSelected = selected === sq;
            const isLegal = legalTargets.has(sq);
            const isLastFrom = lastMove?.from === sq;
            const isLastTo = lastMove?.to === sq;
            const isCheck = inCheckSquare === sq;
            const isDragOver = dragOver === sq;

            return (
              <div
                key={sq}
                onClick={() => handleSquareClick(sq)}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(sq);
                }}
                onDragLeave={() => setDragOver((d) => (d === sq ? null : d))}
                onDrop={(e) => {
                  e.preventDefault();
                  handleDrop(sq);
                }}
                className={cn(
                  "relative flex items-center justify-center transition-colors",
                  isDark ? "bg-board-dark" : "bg-board-light",
                )}
              >
                {(isLastFrom || isLastTo) && (
                  <div className="absolute inset-0 bg-board-move" />
                )}
                {isSelected && <div className="absolute inset-0 bg-board-highlight" />}
                {isCheck && <div className="absolute inset-0 bg-board-check" />}
                {isDragOver && <div className="absolute inset-0 ring-4 ring-primary/70 ring-inset" />}

                {/* coord labels */}
                {fIdx === 0 && (
                  <span className={cn(
                    "absolute top-0.5 left-1 text-[10px] font-semibold",
                    isDark ? "text-board-light" : "text-board-dark",
                  )}>
                    {rank}
                  </span>
                )}
                {rIdx === 7 && (
                  <span className={cn(
                    "absolute bottom-0.5 right-1 text-[10px] font-semibold",
                    isDark ? "text-board-light" : "text-board-dark",
                  )}>
                    {file}
                  </span>
                )}

                {isLegal && !piece && (
                  <div className="absolute w-1/3 h-1/3 rounded-full bg-primary/40" />
                )}
                {isLegal && piece && (
                  <div className="absolute inset-1 rounded-full ring-4 ring-primary/50" />
                )}

                {piece && (
                  <PieceImg
                    color={piece.color}
                    type={piece.type}
                    draggable={!disabled && piece.color === game.turn()}
                    onDragStart={() => setSelected(sq)}
                    className="relative w-[88%] h-[88%] drop-shadow-md cursor-grab active:cursor-grabbing"
                  />
                )}
              </div>
            );
          }),
        )}
      </div>
    </div>
  );
}
