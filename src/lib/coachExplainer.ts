import { Chess, type Square } from "chess.js";

export function generateCoachExplanation(
  game: Chess,
  move: { from: string; to: string; san?: string; piece?: string; captured?: string },
): string {
  const history = game.history({ verbose: true });
  const lastPlayerMove = history.length > 0 ? history[history.length - 1] : null;
  const p = move.piece || (game.get(move.from as Square)?.type ?? "p");
  const pName = pieceName(p);
  const moveSan = move.san || `${move.from} to ${move.to}`;

  // 1. Checkmate or Decisive Threats
  if (moveSan.includes("#")) {
    return `Checkmate! Your king ran out of escape squares because my pieces coordinated to cover all exits.`;
  }
  if (moveSan.includes("+")) {
    return `Checking your king with my ${pName} (${moveSan}). Forcing you to react gives me the initiative.`;
  }

  // 2. Punishing opponent's tactical mistake / captures
  if (move.captured) {
    const capName = pieceName(move.captured);
    if (lastPlayerMove && lastPlayerMove.to === move.to) {
      return `Recapturing your ${capName} on ${move.to} right away to maintain material balance and keep piece activity.`;
    }
    return `Winning your ${capName} on ${move.to}. You left it without enough defenders, so I took it to gain material advantage.`;
  }

  // 3. Central Knight Outposts
  if (p === "n" && ["d5", "e5", "d4", "e4", "c5", "f5"].includes(move.to)) {
    return `Placing my Knight on ${move.to}. This is a dominant outpost in your territory that your pawns can't easily chase away.`;
  }

  // 4. Rook Open Files
  if (p === "r" && ["c", "d", "e", "f"].includes(move.to[0])) {
    return `Bringing my Rook to the ${move.to[0]}-file (${moveSan}). Rooks belong on open and semi-open files where they exert maximum pressure.`;
  }

  // 5. King Safety / Castling
  if (moveSan === "O-O" || moveSan === "O-O-O") {
    return `Castling my king into safety and bringing my rook into the game. Never leave your king in the center when lines open up.`;
  }

  // 6. Prophylaxis / Pawn Push
  if (p === "p" && (move.to.startsWith("h") || move.to.startsWith("a"))) {
    return `Playing ${moveSan} as a prophylactic move. It takes away key landing squares from your pieces and prevents back-rank issues later.`;
  }

  // 7. Central Pawn Control
  if (p === "p" && ["e4", "d4", "c4", "e5", "d5", "c5"].includes(move.to)) {
    return `Pushing my pawn to ${move.to} to fight for central space and open diagonals for my bishops.`;
  }

  // 8. General Active Development
  return `Developing my ${pName} to ${move.to} (${moveSan}). Active piece placement that controls key squares beats passive defense every time.`;
}

function pieceName(p: string): string {
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
