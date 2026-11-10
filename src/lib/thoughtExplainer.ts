import { Chess, type Square } from "chess.js";
import type { VerboseMove } from "@/lib/botStore";

export type ThoughtBreakdown = {
  scan: string;
  candidates: { moveSan: string; evalStr: string; note: string }[];
  decision: string;
};

/**
 * Analyzes the position, the player's last move, and the bot's candidate moves
 * to produce a plain-English grandmaster thinking process.
 */
export function generateThoughtBreakdown(
  game: Chess,
  chosenMove: VerboseMove,
  topMoves: { uci: string; cp?: number; mate?: number }[] = [],
): ThoughtBreakdown {
  const history = game.history({ verbose: true });
  const lastMove = history.length > 0 ? history[history.length - 1] : null;
  const isWhite = chosenMove.color === "w";

  // 1. Scan Opponent's Last Move
  let scan = "Scanning the position for threats and changes in the pawn structure...";
  if (lastMove) {
    const movedPieceName = pieceName(lastMove.piece);
    if (lastMove.captured) {
      scan = `You captured on ${lastMove.to} with your ${movedPieceName}. I need to evaluate recapturing vs maintaining initiative.`;
    } else if (lastMove.san.includes("+")) {
      scan = `Your ${movedPieceName} delivered check. My priority is king safety and active evasion.`;
    } else if (["e4", "d4", "c4", "e5", "d5", "c5"].includes(lastMove.to)) {
      scan = `You pushed your pawn to ${lastMove.to} to contest the center. I must decide whether to challenge or bypass it.`;
    } else {
      scan = `You played ${lastMove.san}, improving your ${movedPieceName}. I'm checking what squares you vacated and what you now attack.`;
    }
  }

  // 2. Candidate Moves Breakdown
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
    let note = "Playable alternative, but less active.";
    if (isChosen) {
      note = "Highest activity and strongest control of critical squares.";
    } else if (i === 1) {
      note = "Solid candidate, but slightly passive.";
    } else {
      note = "Calculated line, but gives you unnecessary counterplay.";
    }

    candidates.push({
      moveSan: `${from}→${to}`,
      evalStr,
      note,
    });
  }

  // 3. The Grandmaster Decision (Why this move on this square right now)
  const pName = pieceName(chosenMove.piece);
  let decision = `I'm playing ${chosenMove.san} to optimize my piece coordination.`;

  if (chosenMove.captured) {
    const capName = pieceName(chosenMove.captured);
    decision = `I'm capturing your ${capName} on ${chosenMove.to} right now to disrupt your structure and punish the undefended square.`;
  } else if (
    chosenMove.piece === "n" &&
    ["d5", "e5", "d4", "e4", "c5", "f5"].includes(chosenMove.to)
  ) {
    decision = `Placing my Knight on ${chosenMove.to} gives me an unchallengeable outpost that cramps your position.`;
  } else if (
    chosenMove.piece === "r" &&
    (chosenMove.to[0] === "c" || chosenMove.to[0] === "d" || chosenMove.to[0] === "e")
  ) {
    decision = `Seizing the ${chosenMove.to[0]}-file with my Rook before it opens up. Control of open files wins games.`;
  } else if (chosenMove.piece === "b" && chosenMove.san.includes("x")) {
    decision = `Trading my Bishop on ${chosenMove.to} damages your pawn chain and weakens your king's shelter.`;
  } else if (chosenMove.san === "O-O" || chosenMove.san === "O-O-O") {
    decision = `Tucking my king into safety and connecting my rooks so I can launch operations in the center.`;
  } else if (
    chosenMove.piece === "p" &&
    (chosenMove.to.startsWith("h") || chosenMove.to.startsWith("a"))
  ) {
    decision = `A prophylactic pawn move (${chosenMove.san}) to deny your pieces entry squares and prevent pins.`;
  } else {
    decision = `Developing the ${pName} to ${chosenMove.to} with tempo, increasing piece activity while limiting your options.`;
  }

  return { scan, candidates, decision };
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
