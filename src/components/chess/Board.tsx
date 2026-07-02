import { useEffect, useMemo, useRef, useState } from "react";
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

type DragState = {
  from: Square;
  // pointer position in board-local px
  x: number;
  y: number;
  // square size in px (dynamic)
  size: number;
  // pointer id for release
  pointerId: number;
  moved: boolean;
};

export function Board({ game, flipped, disabled, lastMove, onAttemptMove }: BoardProps) {
  const [selected, setSelected] = useState<Square | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [hoverSq, setHoverSq] = useState<Square | null>(null);
  const boardRef = useRef<HTMLDivElement | null>(null);

  const files = flipped ? [...FILES].reverse() : FILES;
  const ranks = flipped ? [...RANKS].reverse() : RANKS;

  const legalTargets = useMemo<Set<string>>(() => {
    const src = drag?.from ?? selected;
    if (!src) return new Set();
    const moves = game.moves({ square: src, verbose: true }) as Array<{ to: string }>;
    return new Set(moves.map((m) => m.to));
  }, [selected, drag, game]);

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

  // Convert client coords -> square using current file/rank order
  const squareAt = (clientX: number, clientY: number): Square | null => {
    const board = boardRef.current;
    if (!board) return null;
    const rect = board.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    if (x < 0 || y < 0 || x >= rect.width || y >= rect.height) return null;
    const fIdx = Math.min(7, Math.max(0, Math.floor((x / rect.width) * 8)));
    const rIdx = Math.min(7, Math.max(0, Math.floor((y / rect.height) * 8)));
    return (files[fIdx] + ranks[rIdx]) as Square;
  };

  const beginDrag = (sq: Square, e: React.PointerEvent) => {
    if (disabled) return;
    const piece = game.get(sq);
    if (!piece || piece.color !== game.turn()) return;
    const board = boardRef.current;
    if (!board) return;
    const rect = board.getBoundingClientRect();
    setSelected(sq);
    setHoverSq(sq);
    setDrag({
      from: sq,
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      size: rect.width / 8,
      pointerId: e.pointerId,
      moved: false,
    });
    // Prevent native image drag ghost and text selection
    e.preventDefault();
  };

  // Global pointer tracking while dragging
  useEffect(() => {
    if (!drag) return;
    const onMove = (e: PointerEvent) => {
      if (e.pointerId !== drag.pointerId) return;
      const board = boardRef.current;
      if (!board) return;
      const rect = board.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      setDrag((d) => (d ? { ...d, x, y, size: rect.width / 8, moved: true } : d));
      setHoverSq(squareAt(e.clientX, e.clientY));
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerId !== drag.pointerId) return;
      const target = squareAt(e.clientX, e.clientY);
      const from = drag.from;
      setDrag(null);
      setHoverSq(null);
      if (target && target !== from) {
        if (onAttemptMove(from, target)) {
          setSelected(null);
        }
      } else if (!drag.moved) {
        // treat as click-select (already selected)
      }
    };
    const onCancel = () => {
      setDrag(null);
      setHoverSq(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag?.pointerId]);

  const handleSquareClick = (sq: Square) => {
    if (disabled || drag) return;
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
      <div
        ref={boardRef}
        className="relative grid grid-cols-8 grid-rows-8 w-full h-full rounded-xl overflow-hidden shadow-2xl ring-1 ring-border touch-none"
      >
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
            const isDragOver = drag && hoverSq === sq && sq !== drag.from;
            const isDragSource = drag?.from === sq;

            return (
              <div
                key={sq}
                onClick={() => handleSquareClick(sq)}
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
                    "absolute top-0.5 left-1 text-[10px] font-semibold pointer-events-none",
                    isDark ? "text-board-light" : "text-board-dark",
                  )}>
                    {rank}
                  </span>
                )}
                {rIdx === 7 && (
                  <span className={cn(
                    "absolute bottom-0.5 right-1 text-[10px] font-semibold pointer-events-none",
                    isDark ? "text-board-light" : "text-board-dark",
                  )}>
                    {file}
                  </span>
                )}

                {isLegal && !piece && (
                  <div className="absolute w-1/3 h-1/3 rounded-full bg-primary/40 pointer-events-none" />
                )}
                {isLegal && piece && (
                  <div className="absolute inset-1 rounded-full ring-4 ring-primary/50 pointer-events-none" />
                )}

                {piece && !isDragSource && (
                  <PieceImg
                    color={piece.color}
                    type={piece.type}
                    draggable={false}
                    onPointerDown={(e) => beginDrag(sq, e)}
                    className={cn(
                      "relative w-[88%] h-[88%] drop-shadow-md",
                      !disabled && piece.color === game.turn()
                        ? "cursor-grab active:cursor-grabbing"
                        : "cursor-default",
                      "transition-transform duration-150 ease-out",
                    )}
                  />
                )}
                {/* Empty placeholder while source piece is being dragged (keeps square selectable) */}
                {piece && isDragSource && (
                  <div className="w-[88%] h-[88%] opacity-30">
                    <PieceImg color={piece.color} type={piece.type} draggable={false} className="w-full h-full" />
                  </div>
                )}
              </div>
            );
          }),
        )}

        {/* Floating dragged piece overlay */}
        {drag && (() => {
          const piece = game.get(drag.from);
          if (!piece) return null;
          return (
            <div
              className="absolute pointer-events-none z-50"
              style={{
                left: drag.x - drag.size / 2,
                top: drag.y - drag.size / 2,
                width: drag.size,
                height: drag.size,
                transform: "scale(1.15)",
                transformOrigin: "center",
                filter: "drop-shadow(0 8px 14px rgba(0,0,0,0.45))",
                willChange: "left, top",
              }}
            >
              <PieceImg color={piece.color} type={piece.type} draggable={false} className="w-full h-full" />
            </div>
          );
        })()}
      </div>
    </div>
  );
}
