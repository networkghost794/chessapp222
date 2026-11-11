import { Chess, type Square, type PieceSymbol } from "chess.js";
import type { VerboseMove } from "@/lib/botStore";

export type ThoughtBreakdown = {
  scan: string; // Step 1: What your move attacked, opened, or left undefended
  tactics: string; // Step 2: C-C-T filter (Checks, Captures, Threats on the board)
  plan: string; // Step 3: Positional assessment (Weakest piece / strategic goal)
  decision: string; // Step 4: Final candidate decision (Why this move on this square)
  candidates: { moveSan: string; evalStr: string; note: string }[];
};

/**
 * Analyzes the board step-by-step after the player's move to show
 * exactly what the Grandmaster/Engine looks for.
 */
export function generateThoughtBreakdown(
  game: Chess,
  chosenMove:
    | VerboseMove
    | {
        from: string;
        to: string;
        san?: string;
        piece?: string;
        captured?: string;
        color?: string;
      },
  topMoves: { uci: string; cp?: number; mate?: number }[] = [],
): ThoughtBreakdown {
  const history = game.history({ verbose: true });
  const lastMove = history.length > 0 ? history[history.length - 1] : null;
  const botColor = (chosenMove as VerboseMove).color || game.turn();

  // =========================================================================
  // STEP 1: OPPONENT MOVE SCAN (What did they attack? What did they weaken?)
  // =========================================================================
  let scan = "Scanning board changes...";
  if (lastMove) {
    const pName = pieceName(lastMove.piece);
    const attacks: string[] = [];

    // Check what the moved piece is now attacking
    const playerAttackedSquares = getAttackedSquares(game, lastMove.to as Square, lastMove.piece);
    for (const sq of playerAttackedSquares) {
      const target = game.get(sq);
      if (target && target.color === botColor) {
        attacks.push(`${pieceName(target.type)} on ${sq}`);
      }
    }

    if (lastMove.san.includes("+")) {
      scan = `🚨 Check: Your ${pName} directly checks my King. King safety is my immediate priority.`;
    } else if (lastMove.captured) {
      scan = `⚔️ Capture on ${lastMove.to}: You took my ${pieceName(lastMove.captured)}. I must check if recapturing is required or if an in-between move (Zwischenzug) is stronger.`;
    } else if (attacks.length > 0) {
      scan = `🎯 New Threat: By moving to ${lastMove.to}, your ${pName} now attacks my ${attacks.slice(0, 2).join(" and ")}.`;
    } else if (["e4", "d4", "c4", "e5", "d5", "c5"].includes(lastMove.to)) {
      scan = `🛡️ Central Grab: Your ${pName} claimed ${lastMove.to}. You vacated ${lastMove.from}, weakening control of squares behind it.`;
    } else {
      scan = `👀 Positional shift: Your ${pName} moved ${lastMove.from}→${lastMove.to}. I'm checking if your departure left ${lastMove.from} or nearby pawns undefended.`;
    }
  }

  // =========================================================================
  // STEP 2: C-C-T TACTICAL FILTER (Checks, Captures, Threats)
  // =========================================================================
  const legalMoves = game.moves({ verbose: true });
  const checksAvailable = legalMoves.filter((m) => m.san.includes("+"));
  const capturesAvailable = legalMoves.filter((m) => m.captured);

  let tactics = "Scanning tactical forcing moves...";
  if (checksAvailable.length > 0) {
    tactics = `⚡ Forcing Checks: I calculated ${checksAvailable.length} check(s) on your king (e.g. ${checksAvailable[0].san}).`;
  } else if (capturesAvailable.length > 0) {
    const cap = capturesAvailable[0];
    tactics = `⚔️ Captures Found: I see ${capturesAvailable.length} capture option(s), evaluating if ${cap.san} wins material.`;
  } else {
    tactics = `🔒 Quiet Position: No direct checks or free captures. Transitioning to piece coordination.`;
  }

  // =========================================================================
  // STEP 3: POSITIONAL & CANDIDATE BREAKDOWN
  // =========================================================================
  const candidates: { moveSan: string; evalStr: string; note: string }[] = [];
  const topSlice = topMoves.slice(0, 3);

  for (let i = 0; i < topSlice.length; i++) {
    const tm = topSlice[i];
    const from = tm.uci.slice(0, 2) as Square;
    const to = tm.uci.slice(2, 4) as Square;
    const evalStr =
      typeof tm.mate === "number"
        ? `#${tm.mate}`
        : typeof tm.cp === "number"
          ? `${tm.cp > 0 ? "+" : ""}${(tm.cp / 100).toFixed(1)}`
          : "0.0";

    const isChosen = chosenMove.from === from && chosenMove.to === to;
    let note = "Secondary candidate.";
    if (isChosen) {
      note = "Best move: maximizes activity & controls key squares.";
    } else if (i === 1) {
      note = "Solid alternative, but gives you more defensive resources.";
    } else {
      note = "Passive line: allows you counterplay.";
    }

    candidates.push({
      moveSan: `${from}→${to}`,
      evalStr,
      note,
    });
  }

  const plan = `📊 Positional Plan: Improving my least active piece and staking claim on the center.`;

  // =========================================================================
  // STEP 4: FINAL DECISION (Why this piece to this square right now)
  // =========================================================================
  const chosenPiece = chosenMove.piece || game.get(chosenMove.from as Square)?.type;
  const pName = pieceName(chosenPiece);
  const moveSan = chosenMove.san || `${chosenMove.from}→${chosenMove.to}`;
  let decision = `I am playing ${moveSan} to maximize piece activity.`;

  if (chosenMove.captured) {
    decision = `Taking your ${pieceName(chosenMove.captured)} on ${chosenMove.to} because it was insufficiently guarded.`;
  } else if (moveSan.includes("#")) {
    decision = `Delivering Checkmate with ${moveSan}! All king escape squares are covered.`;
  } else if (moveSan.includes("+")) {
    decision = `Playing ${moveSan} to force your king or defender out of position and seize the initiative.`;
  } else if (chosenPiece === "n" && ["d5", "e5", "d4", "e4", "c5", "f5"].includes(chosenMove.to)) {
    decision = `Anchoring my Knight on the ${chosenMove.to} outpost where it cannot be easily evicted by pawns.`;
  } else if (chosenPiece === "r" && ["c", "d", "e", "f"].includes(chosenMove.to[0])) {
    decision = `Claiming the ${chosenMove.to[0]}-file with my Rook. Rooks must dominate open lines.`;
  } else if (moveSan === "O-O" || moveSan === "O-O-O") {
    decision = `Castling into safety so my King is sheltered and my Rooks can coordinate in the center.`;
  } else if (
    chosenPiece === "p" &&
    (chosenMove.to.startsWith("a") || chosenMove.to.startsWith("h"))
  ) {
    decision = `Prophylaxis with ${moveSan}: denying your pieces key outpost squares and avoiding back-rank problems.`;
  } else {
    decision = `Developing ${pName} to ${chosenMove.to} (${moveSan}) with tempo to restrict your counterplay.`;
  }

  return { scan, tactics, plan, decision, candidates };
}

function getAttackedSquares(game: Chess, from: Square, piece?: PieceSymbol): Square[] {
  const moves = game.moves({ square: from, verbose: true });
  return moves.map((m) => m.to as Square);
}

function pieceName(p?: string): string {
  switch (p) {
    case "p":
      return "Pawn";
    case "n":
      return "Knight";
    case "b":
      return "Bishop";
    case "r":
      return "Rook";
    case "q":
      return "Queen";
    case "k":
      return "King";
    default:
      return "Piece";
  }
}
