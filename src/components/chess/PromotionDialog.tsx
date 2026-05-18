import type { Color, PieceSymbol } from "chess.js";
import { PieceImg } from "./pieces";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function PromotionDialog({
  open,
  color,
  onSelect,
}: {
  open: boolean;
  color: Color;
  onSelect: (p: Exclude<PieceSymbol, "p" | "k">) => void;
}) {
  const pieces: Array<Exclude<PieceSymbol, "p" | "k">> = ["q", "r", "b", "n"];
  return (
    <Dialog open={open}>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle>Promote pawn</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-4 gap-2">
          {pieces.map((p) => (
            <button
              key={p}
              onClick={() => onSelect(p)}
              className="aspect-square rounded-lg bg-secondary hover:bg-accent/30 transition-colors flex items-center justify-center"
            >
              <PieceImg color={color} type={p} draggable={false} className="w-4/5 h-4/5" />
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
