// Neo-style piece set
import type React from "react";
import type { Color, PieceSymbol } from "chess.js";

const NEO = "https://images.chesscomfiles.com/chess-themes/pieces/neo/150/";
const pieceMap: Record<string, string> = Object.fromEntries(
  ["w", "b"].flatMap((c) => ["k", "q", "r", "b", "n", "p"].map((t) => [c + t.toUpperCase(), `${NEO}${c}${t}.png`])),
);

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
