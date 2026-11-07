// Piece renderer — set chosen in Settings (default Neo)
import type React from "react";
import type { Color, PieceSymbol } from "chess.js";
import { useSettings, getSettings } from "@/lib/settings";
import { pieceUrl } from "@/lib/boardThemes";

export function pieceImage(color: Color, type: PieceSymbol, set?: string) {
  return pieceUrl(set ?? getSettings().pieceSet, (color === "w" ? "w" : "b") + type);
}

export function PieceImg({
  color,
  type,
  className,
  draggable = true,
  onDragStart,
  onPointerDown,
  set,
}: {
  color: Color;
  type: PieceSymbol;
  className?: string;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onPointerDown?: (e: React.PointerEvent) => void;
  set?: string;
}) {
  const [s] = useSettings();
  return (
    <img
      src={pieceUrl(set ?? s.pieceSet, (color === "w" ? "w" : "b") + type)}
      alt={`${color}${type}`}
      draggable={draggable}
      onDragStart={onDragStart}
      onPointerDown={onPointerDown}
      className={className}
      style={
        { userSelect: "none", WebkitUserDrag: "none", pointerEvents: "auto" } as React.CSSProperties
      }
    />
  );
}
