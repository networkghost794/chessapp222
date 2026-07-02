// Wikipedia-style SVG chess pieces (Cburnett set, public domain)
import type { Color, PieceSymbol } from "chess.js";

const pieceMap: Record<string, string> = {
  wK: "https://upload.wikimedia.org/wikipedia/commons/4/42/Chess_klt45.svg",
  wQ: "https://upload.wikimedia.org/wikipedia/commons/1/15/Chess_qlt45.svg",
  wR: "https://upload.wikimedia.org/wikipedia/commons/7/72/Chess_rlt45.svg",
  wB: "https://upload.wikimedia.org/wikipedia/commons/b/b1/Chess_blt45.svg",
  wN: "https://upload.wikimedia.org/wikipedia/commons/7/70/Chess_nlt45.svg",
  wP: "https://upload.wikimedia.org/wikipedia/commons/4/45/Chess_plt45.svg",
  bK: "https://upload.wikimedia.org/wikipedia/commons/f/f0/Chess_kdt45.svg",
  bQ: "https://upload.wikimedia.org/wikipedia/commons/4/47/Chess_qdt45.svg",
  bR: "https://upload.wikimedia.org/wikipedia/commons/f/ff/Chess_rdt45.svg",
  bB: "https://upload.wikimedia.org/wikipedia/commons/9/98/Chess_bdt45.svg",
  bN: "https://upload.wikimedia.org/wikipedia/commons/e/ef/Chess_ndt45.svg",
  bP: "https://upload.wikimedia.org/wikipedia/commons/c/c7/Chess_pdt45.svg",
};

export function pieceImage(color: Color, type: PieceSymbol) {
  const key = (color === "w" ? "w" : "b") + type.toUpperCase();
  return pieceMap[key];
}

export function PieceImg({
  color,
  type,
  className,
  draggable = true,
  onDragStart,
  onPointerDown,
}: {
  color: Color;
  type: PieceSymbol;
  className?: string;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onPointerDown?: (e: React.PointerEvent) => void;
}) {
  return (
    <img
      src={pieceImage(color, type)}
      alt={`${color}${type}`}
      draggable={draggable}
      onDragStart={onDragStart}
      onPointerDown={onPointerDown}
      className={className}
      style={{ userSelect: "none", WebkitUserDrag: "none", pointerEvents: "auto" } as React.CSSProperties}
    />
  );
}
