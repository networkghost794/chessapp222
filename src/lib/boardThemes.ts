// Cosmetic board color themes and piece sets.
export type BoardTheme = { id: string; name: string; light: string; dark: string };

export const BOARD_THEMES: BoardTheme[] = [
  { id: "green", name: "Green", light: "#ebecd0", dark: "#739552" },
  { id: "wood", name: "Wood", light: "#f0d9b5", dark: "#b58863" },
  { id: "brown", name: "Brown", light: "#edd6b0", dark: "#b88762" },
  { id: "blue", name: "Blue", light: "#eae9d2", dark: "#4b7399" },
  { id: "ice", name: "Icy Sea", light: "#d9e4e8", dark: "#7a9db2" },
  { id: "slate", name: "Slate", light: "#dee3e6", dark: "#8ca2ad" },
  { id: "grey", name: "Grey", light: "#e8e8e8", dark: "#9e9e9e" },
  { id: "charcoal", name: "Charcoal", light: "#777777", dark: "#363636" },
  { id: "night", name: "Night", light: "#9fa4b0", dark: "#4b5160" },
  { id: "lilac", name: "Lilac", light: "#efecf6", dark: "#8877b7" },
  { id: "rose", name: "Bubblegum", light: "#f5d5de", dark: "#c35875" },
  { id: "forest", name: "Forest", light: "#d4e3cb", dark: "#2b5a38" },
  { id: "orange", name: "Orange", light: "#fbe0bd", dark: "#d18b47" },
  { id: "red", name: "Red", light: "#f0d0cc", dark: "#b94a48" },
  { id: "sand", name: "Sand", light: "#f4ecd8", dark: "#c9b38b" },
];

export type PieceSet = { id: string; name: string };
export const PIECE_SETS: PieceSet[] = [
  { id: "neo", name: "Neo" },
  { id: "classic", name: "Classic" },
  { id: "alpha", name: "Alpha" },
  { id: "wood", name: "Wood" },
  { id: "vintage", name: "Vintage" },
  { id: "club", name: "Club" },
  { id: "tournament", name: "Tournament" },
  { id: "glass", name: "Glass" },
  { id: "metal", name: "Metal" },
  { id: "marble", name: "Marble" },
  { id: "modern", name: "Modern" },
  { id: "book", name: "Book" },
  { id: "newspaper", name: "Newspaper" },
  { id: "bases", name: "Bases" },
  { id: "game_room", name: "Game Room" },
  { id: "icy_sea", name: "Icy Sea" },
  { id: "ocean", name: "Ocean" },
  { id: "sky", name: "Sky" },
  { id: "nature", name: "Nature" },
  { id: "neon", name: "Neon" },
  { id: "light", name: "Light" },
  { id: "dash", name: "Dash" },
  { id: "8_bit", name: "8-Bit" },
  { id: "lolz", name: "Lolz" },
];

export function pieceUrl(set: string, code: string) {
  return `https://images.chesscomfiles.com/chess-themes/pieces/${set}/150/${code}.png`;
}

export function findBoardTheme(id: string) {
  return BOARD_THEMES.find((t) => t.id === id) ?? BOARD_THEMES[0];
}
