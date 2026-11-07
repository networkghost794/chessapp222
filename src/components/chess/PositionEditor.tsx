import { useMemo, useState } from "react";
import { Chess, type PieceSymbol, type Color, type Square } from "chess.js";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PieceImg } from "./pieces";
import { cn } from "@/lib/utils";
import { RotateCcw, Trash2 } from "lucide-react";

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;
const RANKS = [8, 7, 6, 5, 4, 3, 2, 1] as const;

type Board = Record<string, { color: Color; type: PieceSymbol } | null>;

const START_BOARD: Board = (() => {
  const g = new Chess();
  const b: Board = {};
  for (const rank of RANKS) {
    for (const file of FILES) {
      const sq = (file + rank) as Square;
      const p = g.get(sq);
      b[sq] = p ? { color: p.color, type: p.type } : null;
    }
  }
  return b;
})();

const EMPTY_BOARD: Board = (() => {
  const b: Board = {};
  for (const rank of RANKS) for (const file of FILES) b[file + rank] = null;
  return b;
})();

type PaletteItem = { kind: "piece"; color: Color; type: PieceSymbol } | { kind: "erase" };

const PALETTE_ORDER: PaletteItem[] = [
  { kind: "piece", color: "w", type: "k" },
  { kind: "piece", color: "w", type: "q" },
  { kind: "piece", color: "w", type: "r" },
  { kind: "piece", color: "w", type: "b" },
  { kind: "piece", color: "w", type: "n" },
  { kind: "piece", color: "w", type: "p" },
  { kind: "piece", color: "b", type: "k" },
  { kind: "piece", color: "b", type: "q" },
  { kind: "piece", color: "b", type: "r" },
  { kind: "piece", color: "b", type: "b" },
  { kind: "piece", color: "b", type: "n" },
  { kind: "piece", color: "b", type: "p" },
  { kind: "erase" },
];

function boardToFen(board: Board, turn: Color): string {
  const rows: string[] = [];
  for (const rank of RANKS) {
    let row = "";
    let empty = 0;
    for (const file of FILES) {
      const p = board[file + rank];
      if (!p) {
        empty++;
        continue;
      }
      if (empty > 0) {
        row += empty;
        empty = 0;
      }
      const ch = p.type;
      row += p.color === "w" ? ch.toUpperCase() : ch;
    }
    if (empty > 0) row += empty;
    rows.push(row);
  }
  return `${rows.join("/")} ${turn} - - 0 1`;
}

export type PositionEditorProps = {
  onCancel: () => void;
  onConfirm: (fen: string) => void;
};

export function PositionEditor({ onCancel, onConfirm }: PositionEditorProps) {
  const [board, setBoard] = useState<Board>({ ...START_BOARD });
  const [turn, setTurn] = useState<Color>("w");
  const [selected, setSelected] = useState<PaletteItem>(PALETTE_ORDER[0]);

  const fen = useMemo(() => boardToFen(board, turn), [board, turn]);
  const validation = useMemo(() => validateFen(fen), [fen]);

  const setSquare = (sq: string) => {
    setBoard((prev) => {
      const next = { ...prev };
      if (selected.kind === "erase") {
        next[sq] = null;
      } else {
        next[sq] = { color: selected.color, type: selected.type };
      }
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_260px] gap-4 items-start">
        {/* Board */}
        <Card className="p-3 bg-card">
          <div className="mx-auto w-full max-w-[min(60vh,500px)] aspect-square">
            <div className="grid grid-cols-8 grid-rows-8 w-full h-full rounded-md overflow-hidden ring-1 ring-border">
              {RANKS.map((rank, rIdx) =>
                FILES.map((file, fIdx) => {
                  const sq = (file + rank) as Square;
                  const isDark = (rIdx + fIdx) % 2 === 1;
                  const p = board[sq];
                  return (
                    <div
                      key={sq}
                      onClick={() => setSquare(sq)}
                      className={cn(
                        "relative flex items-center justify-center cursor-pointer transition-colors",
                        isDark ? "bg-board-dark" : "bg-board-light",
                        "hover:brightness-110",
                      )}
                    >
                      {p && (
                        <PieceImg
                          color={p.color}
                          type={p.type}
                          draggable={false}
                          className="w-[86%] h-[86%] pointer-events-none drop-shadow-md"
                        />
                      )}
                    </div>
                  );
                }),
              )}
            </div>
          </div>
        </Card>

        {/* Palette + controls */}
        <div className="space-y-3">
          <Card className="p-3 bg-card">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              Pieces
            </div>
            <div className="grid grid-cols-6 gap-1.5">
              {PALETTE_ORDER.map((item, idx) => {
                const key = item.kind === "piece" ? `${item.color}${item.type}` : "erase";
                const active =
                  (selected.kind === "erase" && item.kind === "erase") ||
                  (selected.kind === "piece" &&
                    item.kind === "piece" &&
                    selected.color === item.color &&
                    selected.type === item.type);
                return (
                  <button
                    key={idx}
                    onClick={() => setSelected(item)}
                    className={cn(
                      "aspect-square rounded-md flex items-center justify-center border transition-colors",
                      active
                        ? "bg-primary/15 border-primary/50"
                        : "bg-secondary/30 border-transparent hover:bg-secondary/60",
                    )}
                    title={key}
                  >
                    {item.kind === "piece" ? (
                      <PieceImg
                        color={item.color}
                        type={item.type}
                        draggable={false}
                        className="w-[80%] h-[80%]"
                      />
                    ) : (
                      <Trash2 className="w-4 h-4 text-muted-foreground" />
                    )}
                  </button>
                );
              })}
            </div>
            <div className="text-[10px] text-muted-foreground mt-2">
              Pick a piece then click any square to place. Choose the trash to erase.
            </div>
          </Card>

          <Card className="p-3 bg-card space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Side to move
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setTurn("w")}
                className={cn(
                  "rounded-md py-2 text-sm font-semibold border transition-colors",
                  turn === "w"
                    ? "bg-primary/15 border-primary/50 text-primary"
                    : "bg-secondary/30 border-transparent hover:bg-secondary/60",
                )}
              >
                ⚪ White
              </button>
              <button
                onClick={() => setTurn("b")}
                className={cn(
                  "rounded-md py-2 text-sm font-semibold border transition-colors",
                  turn === "b"
                    ? "bg-primary/15 border-primary/50 text-primary"
                    : "bg-secondary/30 border-transparent hover:bg-secondary/60",
                )}
              >
                ⚫ Black
              </button>
            </div>
          </Card>

          <Card className="p-3 bg-card space-y-2">
            <Button
              variant="secondary"
              size="sm"
              className="w-full"
              onClick={() => setBoard({ ...START_BOARD })}
            >
              <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> Reset to starting position
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => setBoard({ ...EMPTY_BOARD })}
            >
              Clear board
            </Button>
          </Card>

          <div className="text-[10px] font-mono text-muted-foreground break-all bg-secondary/30 rounded-md p-2">
            {fen}
          </div>
          {!validation.valid && (
            <div className="text-[11px] text-destructive font-medium">{validation.error}</div>
          )}
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          disabled={!validation.valid}
          onClick={() => onConfirm(fen)}
          className="bg-success text-primary-foreground hover:bg-success/90 font-bold"
        >
          Use this position
        </Button>
      </div>
    </div>
  );
}

function validateFen(fen: string): { valid: true } | { valid: false; error: string } {
  // Count kings.
  const pieces = fen.split(" ")[0];
  const wk = (pieces.match(/K/g) || []).length;
  const bk = (pieces.match(/k/g) || []).length;
  if (wk !== 1) return { valid: false, error: "Position needs exactly one White king." };
  if (bk !== 1) return { valid: false, error: "Position needs exactly one Black king." };
  try {
    const g = new Chess(fen);
    // Side not to move must not be in check.
    // chess.js accepts, but detect the illegal-check case ourselves.
    const turn = g.turn();
    // Flip to opponent's turn by editing FEN, check if their king is attacked.
    const parts = fen.split(" ");
    parts[1] = turn === "w" ? "b" : "w";
    const flipped = new Chess(parts.join(" "));
    if (flipped.inCheck())
      return { valid: false, error: "The side NOT to move is in check — illegal position." };
    return { valid: true };
  } catch (e) {
    return { valid: false, error: (e as Error).message || "Invalid position." };
  }
}
