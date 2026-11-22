import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chess, type Square } from "chess.js";
import { Board } from "./Board";
import { PromotionDialog } from "./PromotionDialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  analysisEngine,
  DEFAULT_BRIDGE_WS_URL,
  type EngineSettings,
  type EngineAnalysisState,
} from "@/lib/analysisEngine";
import {
  GameDetailsModal,
  DEFAULT_GAME_DETAILS,
  countryCodeToFlag,
  type GameDetailsData,
} from "./GameDetailsModal";
import {
  ArrowLeft,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Compass,
  Copy,
  Cpu,
  Download,
  FlipHorizontal2,
  FolderOpen,
  Minimize2,
  Maximize2,
  Pause,
  Pencil,
  Play,
  Plus,
  Save,
  Search,
  Settings,
  Star,
  User,
  Zap,
} from "lucide-react";
import { playMoveResultSound } from "@/lib/sounds";
import { AGGRESSIVE_TACTICAL_OPENINGS, OPENINGS } from "@/lib/repertoire";
import { fetchUserGamesCloud, formatStandardPgn, type GameHistoryEntry } from "@/lib/gameHistory";
import { useAuth } from "@/lib/useAuth";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

const ECO_MAP: Array<{ moves: string; eco: string; name: string }> = [
  { moves: "e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6", eco: "B90", name: "Sicilian Defense: Najdorf" },
  { moves: "e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6", eco: "B70", name: "Sicilian Defense: Dragon" },
  { moves: "e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3", eco: "B56", name: "Sicilian Defense: Open" },
  { moves: "e4 c5", eco: "B20", name: "Sicilian Defense" },
  { moves: "e4 e5 Nf3 Nc6 Bb5 a6", eco: "C70", name: "Ruy Lopez: Morphy Defense" },
  { moves: "e4 e5 Nf3 Nc6 Bb5 Nf6", eco: "C65", name: "Ruy Lopez: Berlin Defense" },
  { moves: "e4 e5 Nf3 Nc6 Bb5", eco: "C60", name: "Ruy Lopez" },
  { moves: "e4 e5 Nf3 Nc6 Bc4 Bc5", eco: "C50", name: "Italian Game: Giuoco Piano" },
  { moves: "e4 e5 Nf3 Nc6 Bc4 Nf6", eco: "C55", name: "Italian Game: Two Knights" },
  { moves: "e4 e5 Nf3 Nc6 Bc4", eco: "C50", name: "Italian Game" },
  { moves: "e4 e5 Nf3 Nc6 d4", eco: "C44", name: "Scotch Game" },
  { moves: "e4 e5 Nc3", eco: "C25", name: "Vienna Game" },
  { moves: "e4 e5 f4", eco: "C30", name: "King's Gambit" },
  { moves: "e4 e5", eco: "C20", name: "King's Pawn Game" },
  { moves: "e4 e6 d4 d5", eco: "C00", name: "French Defense" },
  { moves: "e4 c6 d4 d5", eco: "B12", name: "Caro-Kann Defense" },
  { moves: "e4 d5", eco: "B01", name: "Scandinavian Defense" },
  { moves: "d4 d5 c4 c6", eco: "D10", name: "Slav Defense" },
  { moves: "d4 d5 c4 e6", eco: "D30", name: "Queen's Gambit Declined" },
  { moves: "d4 d5 c4 dxc4", eco: "D20", name: "Queen's Gambit Accepted" },
  { moves: "d4 d5 c4", eco: "D06", name: "Queen's Gambit" },
  { moves: "d4 d5 Bf4", eco: "D02", name: "London System" },
  { moves: "d4 Nf6 c4 g6 Nc3 d5", eco: "D80", name: "Grunfeld Defense" },
  { moves: "d4 Nf6 c4 g6 Nc3 Bg7", eco: "E60", name: "King's Indian Defense" },
  { moves: "d4 Nf6 c4 e6 Nc3 Bb4", eco: "E20", name: "Nimzo-Indian Defense" },
  { moves: "d4 Nf6 c4 e6 g3", eco: "E00", name: "Catalan Opening" },
  { moves: "d4 f5", eco: "A80", name: "Dutch Defense" },
  { moves: "d4 d5", eco: "D00", name: "Queen's Pawn Game" },
  { moves: "c4 e5", eco: "A20", name: "English Opening: Reversed Sicilian" },
  { moves: "c4", eco: "A10", name: "English Opening" },
  { moves: "Nf3 d5", eco: "A06", name: "Reti Opening" },
  { moves: "e4", eco: "B00", name: "King's Pawn Opening" },
  { moves: "d4", eco: "A40", name: "Queen's Pawn Opening" },
];

const ARROW_PALETTE = [
  { id: "pv1", color: "#38bdf8", strokeWidth: 0.2, opacity: 0.9 },
  { id: "pv2", color: "#a3e635", strokeWidth: 0.16, opacity: 0.72 },
  { id: "pv3", color: "#fbbf24", strokeWidth: 0.14, opacity: 0.65 },
  { id: "pv4", color: "#c084fc", strokeWidth: 0.13, opacity: 0.55 },
  { id: "pv5", color: "#fb7185", strokeWidth: 0.12, opacity: 0.5 },
];

function sqToCoords(sq: string, flipped: boolean): { x: number; y: number } {
  const file = sq.charCodeAt(0) - 97;
  const rank = parseInt(sq[1], 10) - 1;
  const x = (flipped ? 7 - file : file) + 0.5;
  const y = (flipped ? rank : 7 - rank) + 0.5;
  return { x, y };
}

function shortenArrowEnd(
  from: { x: number; y: number },
  to: { x: number; y: number },
  trim = 0.24,
): { x: number; y: number } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len <= trim) return to;
  return {
    x: to.x - (dx / len) * trim,
    y: to.y - (dy / len) * trim,
  };
}

function detectOpening(movesAtPly: string[]): { eco: string; name: string } {
  if (movesAtPly.length === 0) return { eco: "A00", name: "Starting Position" };
  const lineStr = movesAtPly.join(" ");

  let bestEco: { eco: string; name: string; len: number } | null = null;
  for (const entry of ECO_MAP) {
    if (lineStr === entry.moves || lineStr.startsWith(entry.moves + " ")) {
      if (!bestEco || entry.moves.length > bestEco.len) {
        bestEco = { eco: entry.eco, name: entry.name, len: entry.moves.length };
      }
    }
  }
  if (bestEco) return { eco: bestEco.eco, name: bestEco.name };

  const allRepertoire = [...OPENINGS, ...AGGRESSIVE_TACTICAL_OPENINGS];
  for (const op of allRepertoire) {
    const prefix3 = op.moves.slice(0, 3).join(" ");
    if (lineStr.startsWith(prefix3)) {
      return { eco: op.side === "w" ? "C00" : "B00", name: op.name };
    }
  }

  return { eco: "A00", name: "Custom Position" };
}

type SidebarTab = "analysis" | "games" | "explore";

export function AnalysisBoard({
  initialFen,
  onBack,
}: {
  initialFen?: string;
  onBack?: () => void;
}) {
  const { profile } = useAuth();
  const [fenHistory, setFenHistory] = useState<string[]>([initialFen || START_FEN]);
  const [moveHistory, setMoveHistory] = useState<Array<{ san: string; from: Square; to: Square }>>(
    [],
  );
  const [historyIndex, setHistoryIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(true);
  const [promotion, setPromotion] = useState<{ from: Square; to: Square } | null>(null);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("analysis");

  const [engineState, setEngineState] = useState<EngineAnalysisState>({
    isAnalyzing: true,
    engineName: "Stockfish 18 NNUE",
    source: "browser",
    wsConnected: false,
    depth: 0,
    nps: 0,
    nodes: 0,
    lines: [],
  });

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [engineSettings, setEngineSettings] = useState<EngineSettings>(() =>
    analysisEngine.getSettings(),
  );

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [gameDetails, setGameDetails] = useState<GameDetailsData>(DEFAULT_GAME_DETAILS);

  const [pgnInput, setPgnInput] = useState("");
  const [savedGames, setSavedGames] = useState<GameHistoryEntry[]>([]);
  const [loadingGames, setLoadingGames] = useState(false);

  const moveListRef = useRef<HTMLDivElement | null>(null);

  const currentFen = fenHistory[historyIndex] ?? START_FEN;
  const game = useMemo(() => new Chess(currentFen), [currentFen]);
  const lastMove = useMemo(() => {
    if (historyIndex <= 0) return null;
    const m = moveHistory[historyIndex - 1];
    return m ? { from: m.from, to: m.to } : null;
  }, [historyIndex, moveHistory]);

  useEffect(() => {
    const unsub = analysisEngine.subscribe((st) => setEngineState(st));
    analysisEngine.evaluatePosition(initialFen || START_FEN);
    return () => {
      unsub();
      analysisEngine.stop();
    };
  }, [initialFen]);

  useEffect(() => {
    if (engineState.isAnalyzing) {
      analysisEngine.evaluatePosition(currentFen);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFen]);

  useEffect(() => {
    if (moveListRef.current && historyIndex === fenHistory.length - 1) {
      moveListRef.current.scrollTop = moveListRef.current.scrollHeight;
    }
  }, [historyIndex, fenHistory.length]);

  useEffect(() => {
    if (sidebarTab !== "games" || !profile?.id) return;
    let cancelled = false;
    setLoadingGames(true);
    void fetchUserGamesCloud(profile.id)
      .then((list) => {
        if (!cancelled) setSavedGames(list.slice(0, 30));
      })
      .finally(() => {
        if (!cancelled) setLoadingGames(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sidebarTab, profile?.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (settingsOpen || detailsOpen || saveOpen) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setHistoryIndex((i) => Math.max(0, i - 1));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setHistoryIndex((i) => Math.min(fenHistory.length - 1, i + 1));
      } else if (e.key === "Home") {
        e.preventDefault();
        setHistoryIndex(0);
      } else if (e.key === "End") {
        e.preventDefault();
        setHistoryIndex(fenHistory.length - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fenHistory.length, settingsOpen, detailsOpen, saveOpen]);

  const sanMovesAtPly = useMemo(
    () => moveHistory.slice(0, historyIndex).map((m) => m.san),
    [moveHistory, historyIndex],
  );

  const openingInfo = useMemo(() => detectOpening(sanMovesAtPly), [sanMovesAtPly]);

  const commitMove = useCallback(
    (from: Square, to: Square, promo?: "q" | "r" | "b" | "n") => {
      const testGame = new Chess(currentFen);
      const m = testGame.move({ from, to, promotion: promo });
      if (!m) return false;

      playMoveResultSound(m);
      const newFen = testGame.fen();
      const newFens = [...fenHistory.slice(0, historyIndex + 1), newFen];
      const newMoves = [
        ...moveHistory.slice(0, historyIndex),
        { san: m.san, from: m.from as Square, to: m.to as Square },
      ];

      setFenHistory(newFens);
      setMoveHistory(newMoves);
      setHistoryIndex(newFens.length - 1);
      return true;
    },
    [currentFen, fenHistory, historyIndex, moveHistory],
  );

  const handleAttemptMove = useCallback(
    (from: Square, to: Square) => {
      const legalMoves = game.moves({ verbose: true });
      const match = legalMoves.find((m) => m.from === from && m.to === to);
      if (!match) return false;

      if (match.promotion) {
        setPromotion({ from, to });
        return true;
      }

      return commitMove(from, to);
    },
    [game, commitMove],
  );

  const playUciSequence = useCallback(
    (uciList: string[], count = 1) => {
      const sim = new Chess(currentFen);
      const addedFens: string[] = [];
      const addedMoves: Array<{ san: string; from: Square; to: Square }> = [];
      let lastRes: { san: string; flags?: string; captured?: string } | null = null;

      for (let i = 0; i < Math.min(count, uciList.length); i++) {
        const uci = uciList[i];
        if (!uci || uci.length < 4) break;
        const from = uci.slice(0, 2) as Square;
        const to = uci.slice(2, 4) as Square;
        const promo = uci[4] as "q" | "r" | "b" | "n" | undefined;
        const res = sim.move({ from, to, promotion: promo });
        if (!res) break;
        addedFens.push(sim.fen());
        addedMoves.push({ san: res.san, from: res.from as Square, to: res.to as Square });
        lastRes = res;
      }

      if (addedFens.length === 0) return;
      if (lastRes) playMoveResultSound(lastRes);
      const newFens = [...fenHistory.slice(0, historyIndex + 1), ...addedFens];
      const newMoves = [...moveHistory.slice(0, historyIndex), ...addedMoves];
      setFenHistory(newFens);
      setMoveHistory(newMoves);
      setHistoryIndex(newFens.length - 1);
    },
    [currentFen, fenHistory, historyIndex, moveHistory],
  );

  const playSanMove = useCallback(
    (san: string) => {
      const sim = new Chess(currentFen);
      const res = sim.move(san);
      if (!res) return;
      playMoveResultSound(res);
      const newFens = [...fenHistory.slice(0, historyIndex + 1), sim.fen()];
      const newMoves = [
        ...moveHistory.slice(0, historyIndex),
        { san: res.san, from: res.from as Square, to: res.to as Square },
      ];
      setFenHistory(newFens);
      setMoveHistory(newMoves);
      setHistoryIndex(newFens.length - 1);
    },
    [currentFen, fenHistory, historyIndex, moveHistory],
  );

  const topScore = engineState.lines[0];
  const evalValue = useMemo(() => {
    if (game.isCheckmate()) {
      const winnerIsWhite = game.turn() === "b";
      return {
        label: winnerIsWhite ? "M0" : "-M0",
        whitePct: winnerIsWhite ? 100 : 0,
        whiteLeads: winnerIsWhite,
      };
    }
    if (!topScore) return { label: "0.0", whitePct: 50, whiteLeads: true };

    const turn = currentFen.split(" ")[1];
    let cp = topScore.scoreCp;
    let mate = topScore.scoreMate;

    if (turn === "b") {
      if (cp != null) cp = -cp;
      if (mate != null) mate = -mate;
    }

    if (mate != null) {
      const whiteLeads = mate > 0;
      const label = `${whiteLeads ? "" : "-"}M${Math.abs(mate)}`;
      return { label, whitePct: whiteLeads ? 100 : 0, whiteLeads };
    }

    const pawns = (cp ?? 0) / 100;
    const whitePct = Math.max(3, Math.min(97, 50 + 50 * (2 / (1 + Math.exp(-0.32 * pawns)) - 1)));
    const whiteLeads = pawns >= 0;
    const label = Math.abs(pawns) >= 10 ? pawns.toFixed(0) : pawns.toFixed(1);
    return {
      label: whiteLeads && pawns > 0 ? `+${label}` : label,
      whitePct,
      whiteLeads,
    };
  }, [topScore, currentFen, game]);

  const formatPvMoves = useCallback(
    (pv: string[]) => {
      try {
        const sim = new Chess(currentFen);
        const items: Array<{ prefix: string; san: string; plyCount: number }> = [];
        let moveNum = parseInt(currentFen.split(" ")[5] || "1", 10);
        let isWhite = currentFen.split(" ")[1] === "w";

        for (let i = 0; i < Math.min(10, pv.length); i++) {
          const uci = pv[i];
          if (!uci || uci.length < 4) break;
          const from = uci.slice(0, 2) as Square;
          const to = uci.slice(2, 4) as Square;
          const promo = uci[4] as "q" | "r" | "b" | "n" | undefined;
          const res = sim.move({ from, to, promotion: promo });
          if (!res) break;

          const prefix = isWhite ? `${moveNum}.` : i === 0 ? `${moveNum}...` : "";
          items.push({ prefix, san: res.san, plyCount: i + 1 });
          if (!isWhite) moveNum++;
          isWhite = !isWhite;
        }
        return items;
      } catch {
        return [];
      }
    },
    [currentFen],
  );

  const pvArrows = useMemo(() => {
    if (!engineState.isAnalyzing && engineState.lines.length === 0) return [];
    return engineState.lines
      .slice(0, 3)
      .map((line, idx) => {
        const uci = line.pv?.[0];
        if (!uci || uci.length < 4) return null;
        const from = sqToCoords(uci.slice(0, 2), flipped);
        const rawTo = sqToCoords(uci.slice(2, 4), flipped);
        const to = shortenArrowEnd(from, rawTo, idx === 0 ? 0.24 : 0.22);
        const style = ARROW_PALETTE[idx] ?? ARROW_PALETTE[0];
        return { ...style, from, to, key: `${line.multipv}-${uci}` };
      })
      .filter((a): a is NonNullable<typeof a> => a !== null)
      .reverse();
  }, [engineState.isAnalyzing, engineState.lines, flipped]);

  const buildCurrentPgn = useCallback(() => {
    const temp = new Chess();
    if (fenHistory[0] && fenHistory[0] !== START_FEN) {
      temp.load(fenHistory[0]);
    }
    for (const m of moveHistory) {
      try {
        temp.move(m.san);
      } catch {
        break;
      }
    }
    const headers: string[] = [
      `[Event "${gameDetails.event || "BotBoard Analysis"}"]`,
      `[Site "${gameDetails.location || "BotBoard"}"]`,
      `[Date "${(gameDetails.date || new Date().toISOString().slice(0, 10)).replace(/-/g, ".")}"]`,
      `[Round "${gameDetails.round || "1"}"]`,
      `[White "${gameDetails.white.name || "White"}"]`,
      `[Black "${gameDetails.black.name || "Black"}"]`,
      `[Result "${gameDetails.result || "*"}"]`,
    ];
    if (gameDetails.white.rating) headers.push(`[WhiteElo "${gameDetails.white.rating}"]`);
    if (gameDetails.black.rating) headers.push(`[BlackElo "${gameDetails.black.rating}"]`);
    if (gameDetails.timeControl) headers.push(`[TimeControl "${gameDetails.timeControl}"]`);
    if (gameDetails.termination) headers.push(`[Termination "${gameDetails.termination}"]`);
    if (gameDetails.eco || openingInfo.eco) {
      headers.push(`[ECO "${gameDetails.eco || openingInfo.eco}"]`);
    }
    if (fenHistory[0] && fenHistory[0] !== START_FEN) {
      headers.push(`[SetUp "1"]`, `[FEN "${fenHistory[0]}"]`);
    }

    const bodyMoves: string[] = [];
    for (let i = 0; i < moveHistory.length; i += 2) {
      const n = i / 2 + 1;
      const w = moveHistory[i]?.san ?? "";
      const b = moveHistory[i + 1]?.san;
      bodyMoves.push(b ? `${n}. ${w} ${b}` : `${n}. ${w}`);
    }
    const movesText = bodyMoves.length > 0 ? bodyMoves.join(" ") : "";
    return `${headers.join("\n")}\n\n${movesText ? `${movesText} ` : ""}${gameDetails.result || "*"}\n`;
  }, [fenHistory, moveHistory, gameDetails, openingInfo.eco]);

  const loadPgnOrFen = useCallback((rawText: string) => {
    const trimmed = rawText.trim();
    if (!trimmed) {
      toast.error("Paste a PGN or FEN first.");
      return;
    }

    try {
      const fenTest = new Chess(trimmed);
      setFenHistory([fenTest.fen()]);
      setMoveHistory([]);
      setHistoryIndex(0);
      setSidebarTab("analysis");
      toast.success("FEN position loaded");
      return;
    } catch {
      // Try PGN next
    }

    try {
      const pgnGame = new Chess();
      pgnGame.loadPgn(trimmed);
      const headers = pgnGame.header();
      const verboseMoves = pgnGame.history({ verbose: true });

      const replay = new Chess(headers.FEN || START_FEN);
      const fens = [replay.fen()];
      const moves: Array<{ san: string; from: Square; to: Square }> = [];

      for (const vm of verboseMoves) {
        const res = replay.move(vm.san);
        if (!res) break;
        fens.push(replay.fen());
        moves.push({ san: res.san, from: res.from as Square, to: res.to as Square });
      }

      setGameDetails({
        white: {
          name: headers.White && headers.White !== "?" ? headers.White : "",
          rating: headers.WhiteElo && headers.WhiteElo !== "?" ? headers.WhiteElo : "",
          title: headers.WhiteTitle || "",
          country: "",
          avatarUrl: "",
        },
        black: {
          name: headers.Black && headers.Black !== "?" ? headers.Black : "",
          rating: headers.BlackElo && headers.BlackElo !== "?" ? headers.BlackElo : "",
          title: headers.BlackTitle || "",
          country: "",
          avatarUrl: "",
        },
        result: headers.Result || "*",
        event: headers.Event && headers.Event !== "?" ? headers.Event : "",
        timeControl: headers.TimeControl && headers.TimeControl !== "?" ? headers.TimeControl : "",
        termination: headers.Termination && headers.Termination !== "?" ? headers.Termination : "",
        location: headers.Site && headers.Site !== "?" ? headers.Site : "",
        round: headers.Round && headers.Round !== "?" ? headers.Round : "",
        eco: headers.ECO && headers.ECO !== "?" ? headers.ECO : "",
        date:
          headers.Date && /^\d{4}\.\d{2}\.\d{2}$/.test(headers.Date)
            ? headers.Date.replace(/\./g, "-")
            : "",
      });

      setFenHistory(fens);
      setMoveHistory(moves);
      setHistoryIndex(fens.length - 1);
      setSidebarTab("analysis");
      toast.success(`Loaded game (${moves.length} plies)`);
    } catch {
      toast.error("Could not parse PGN or FEN.");
    }
  }, []);

  const explorerMoves = useMemo(() => {
    const allLines = [...OPENINGS, ...AGGRESSIVE_TACTICAL_OPENINGS];
    const currentPrefix = sanMovesAtPly.join(" ");
    const byNextMove = new Map<string, { san: string; openings: string[]; count: number }>();

    for (const op of allLines) {
      if (op.moves.length <= historyIndex) continue;
      const opPrefix = op.moves.slice(0, historyIndex).join(" ");
      if (opPrefix !== currentPrefix) continue;
      const nextSan = op.moves[historyIndex];
      const existing = byNextMove.get(nextSan);
      if (existing) {
        existing.count += 1;
        if (!existing.openings.includes(op.name)) existing.openings.push(op.name);
      } else {
        byNextMove.set(nextSan, { san: nextSan, openings: [op.name], count: 1 });
      }
    }

    return Array.from(byNextMove.values()).sort((a, b) => b.count - a.count);
  }, [sanMovesAtPly, historyIndex]);

  const moveRows = useMemo(() => {
    const rows: Array<{
      n: number;
      w?: { san: string; ply: number };
      b?: { san: string; ply: number };
    }> = [];
    for (let i = 0; i < moveHistory.length; i += 2) {
      rows.push({
        n: i / 2 + 1,
        w: moveHistory[i] ? { san: moveHistory[i].san, ply: i + 1 } : undefined,
        b: moveHistory[i + 1] ? { san: moveHistory[i + 1].san, ply: i + 2 } : undefined,
      });
    }
    return rows;
  }, [moveHistory]);

  const topPlayer = flipped ? gameDetails.white : gameDetails.black;
  const bottomPlayer = flipped ? gameDetails.black : gameDetails.white;
  const topDefaultName = flipped ? "White" : "Black";
  const bottomDefaultName = flipped ? "Black" : "White";

  const renderPlayerRow = (
    player: GameDetailsData["white"],
    fallbackName: string,
    side: "w" | "b",
  ) => {
    const flag = countryCodeToFlag(player.country);
    return (
      <div className="flex items-center justify-between text-xs text-neutral-300">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded bg-[#3a3835] border border-neutral-700/80 overflow-hidden flex items-center justify-center shrink-0">
            {player.avatarUrl ? (
              <img
                src={player.avatarUrl}
                alt={player.name || fallbackName}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            ) : (
              <User
                className={cn("h-4 w-4", side === "w" ? "text-neutral-300" : "text-neutral-500")}
              />
            )}
          </div>
          <div className="flex items-center gap-1.5 min-w-0">
            {player.title && (
              <span className="bg-[#7c2d12] text-[10px] font-bold px-1.5 py-0.5 rounded text-amber-100 shrink-0">
                {player.title}
              </span>
            )}
            <span className="font-semibold text-neutral-100 truncate">
              {player.name || fallbackName}
            </span>
            {player.rating && (
              <span className="text-neutral-400 tabular-nums shrink-0">({player.rating})</span>
            )}
            {flag && <span className="text-sm leading-none shrink-0">{flag}</span>}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setDetailsOpen(true)}
          className="text-neutral-400 hover:text-white p-1.5 rounded hover:bg-neutral-800/80 transition-colors shrink-0"
          title="Edit Game Details"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  };

  const resetBoard = () => {
    setFenHistory([START_FEN]);
    setMoveHistory([]);
    setHistoryIndex(0);
    setGameDetails(DEFAULT_GAME_DETAILS);
    toast.success("Started new analysis board");
  };

  const formatNps = (nps: number) => {
    if (!nps || nps <= 0) return "";
    if (nps >= 1_000_000) return `${(nps / 1_000_000).toFixed(1)}M n/s`;
    if (nps >= 1_000) return `${Math.round(nps / 1_000)}k n/s`;
    return `${nps} n/s`;
  };

  const boardWidthExpr = isFullscreen
    ? "min(calc(100dvh - 108px), calc(100% - 8px))"
    : "min(calc(100dvh - 124px), calc(100% - 8px))";

  return (
    <div
      className={cn(
        "flex flex-col lg:flex-row gap-0 overflow-hidden bg-[#262421] text-neutral-100 select-none",
        isFullscreen
          ? "fixed inset-0 z-40 w-screen h-[100dvh]"
          : "-mx-3 md:-mx-6 -my-3 md:-my-4 w-[calc(100%+1.5rem)] md:w-[calc(100%+3rem)] min-h-[640px] lg:h-[100dvh]",
      )}
    >
      {/* ─── LEFT: EDGE-TO-EDGE FULL-HEIGHT BOARD + EVAL BAR ─── */}
      <div className="flex-1 min-w-0 h-full flex flex-col items-center justify-between px-3 py-2 lg:px-6 lg:py-3 bg-[#302e2b] overflow-hidden">
        {/* Top Control & Top Player Row */}
        <div
          className="w-full flex items-center justify-between gap-3 shrink-0"
          style={{ maxWidth: boardWidthExpr }}
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {onBack && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onBack}
                className="text-neutral-300 hover:text-white hover:bg-neutral-800/70 px-2 h-8 shrink-0"
              >
                <ArrowLeft className="h-4 w-4 mr-1" />
                <span className="hidden sm:inline">Back</span>
              </Button>
            )}
            <div className="flex-1 min-w-0">
              {renderPlayerRow(topPlayer, topDefaultName, flipped ? "w" : "b")}
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className={cn(
                "text-[11px] font-semibold px-2.5 py-1 rounded border flex items-center gap-1.5 transition-colors",
                engineState.source === "local_ws" && engineState.wsConnected
                  ? "bg-purple-500/15 text-purple-300 border-purple-500/40"
                  : "bg-[#262421] text-neutral-300 border-neutral-700 hover:text-white",
              )}
              title="Open Engine Settings"
            >
              <span>{engineState.engineName}</span>
              <span className="text-neutral-500">·</span>
              <span className="font-mono tabular-nums">d{engineState.depth}</span>
            </button>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setIsFullscreen((f) => !f)}
              title={isFullscreen ? "Show navigation sidebar" : "Full-screen mode"}
              className="h-8 w-8 text-neutral-400 hover:text-white hover:bg-neutral-800/70"
            >
              {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setSettingsOpen(true)}
              title="Engine Settings"
              className="h-8 w-8 text-neutral-400 hover:text-white hover:bg-neutral-800/70"
            >
              <Settings className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Central Board & Flush Evaluation Bar */}
        <div className="flex-1 min-h-0 w-full flex items-center justify-center py-1">
          <div
            className="flex items-stretch gap-2 lg:gap-2.5 h-full"
            style={{ width: boardWidthExpr, maxHeight: "calc(100dvh - 108px)" }}
          >
            {/* Flush Vertical Evaluation Bar */}
            <div
              className={cn(
                "w-6 lg:w-7 bg-[#403d39] rounded-sm overflow-hidden flex relative shrink-0 border border-neutral-700/60 shadow-md",
                flipped ? "flex-col" : "flex-col-reverse",
              )}
              aria-label={`Engine evaluation ${evalValue.label}`}
            >
              <div
                className="w-full bg-[#f5f5f4] transition-all duration-300 ease-out"
                style={{ height: `${evalValue.whitePct}%` }}
              />
              <span
                className={cn(
                  "absolute inset-x-0 text-center text-[10px] font-mono font-bold tabular-nums z-10 pointer-events-none",
                  evalValue.whiteLeads
                    ? flipped
                      ? "top-1 text-neutral-900"
                      : "bottom-1 text-neutral-900"
                    : flipped
                      ? "bottom-1 text-white"
                      : "top-1 text-white",
                )}
              >
                {evalValue.label}
              </span>
            </div>

            {/* 2D Chessboard + SVG MultiPV Arrows */}
            <div className="flex-1 aspect-square relative self-center max-h-full">
              <Board
                force2D
                fillContainer
                game={game}
                flipped={flipped}
                disabled={false}
                lastMove={lastMove}
                onAttemptMove={handleAttemptMove}
              />

              {pvArrows.length > 0 && (
                <svg
                  viewBox="0 0 8 8"
                  className="absolute inset-0 w-full h-full pointer-events-none z-20"
                >
                  <defs>
                    {ARROW_PALETTE.map((ap) => (
                      <marker
                        key={ap.id}
                        id={`analysis-${ap.id}`}
                        viewBox="0 0 10 10"
                        refX="5.5"
                        refY="5"
                        markerWidth="4.2"
                        markerHeight="4.2"
                        orient="auto-start-reverse"
                      >
                        <path d="M 0 1.2 L 9.5 5 L 0 8.8 z" fill={ap.color} />
                      </marker>
                    ))}
                  </defs>
                  {pvArrows.map((arrow) => (
                    <line
                      key={arrow.key}
                      x1={arrow.from.x}
                      y1={arrow.from.y}
                      x2={arrow.to.x}
                      y2={arrow.to.y}
                      stroke={arrow.color}
                      strokeWidth={arrow.strokeWidth}
                      strokeLinecap="round"
                      opacity={arrow.opacity}
                      markerEnd={`url(#analysis-${arrow.id})`}
                    />
                  ))}
                </svg>
              )}
            </div>
          </div>
        </div>

        {/* Bottom Player Card + Live Speed */}
        <div
          className="w-full flex items-center justify-between gap-3 shrink-0"
          style={{ maxWidth: boardWidthExpr }}
        >
          <div className="flex-1 min-w-0 pl-8 lg:pl-9">
            {renderPlayerRow(bottomPlayer, bottomDefaultName, flipped ? "b" : "w")}
          </div>
          {engineState.nps > 0 && (
            <span className="text-[11px] font-mono tabular-nums text-neutral-400 shrink-0">
              {formatNps(engineState.nps)}
            </span>
          )}
        </div>
      </div>

      {/* ─── RIGHT: FULL-HEIGHT ANALYSIS SIDEBAR ─── */}
      <aside className="w-full lg:w-[420px] xl:w-[460px] h-full flex flex-col justify-between border-t lg:border-t-0 lg:border-l border-neutral-800 bg-[#262421] shrink-0">
        <div className="flex flex-col flex-1 min-h-0">
          {/* Header Tabs: Analysis | Games | Explore */}
          <div className="grid grid-cols-3 bg-[#1e1c19] border-b border-neutral-800 text-xs font-semibold shrink-0">
            {(
              [
                { id: "analysis", label: "Analysis", icon: Search },
                { id: "games", label: "Games", icon: FolderOpen },
                { id: "explore", label: "Explore", icon: Compass },
              ] as const
            ).map((tab) => {
              const Icon = tab.icon;
              const active = sidebarTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSidebarTab(tab.id)}
                  className={cn(
                    "py-2.5 flex flex-col items-center justify-center gap-1 border-b-2 transition-colors whitespace-nowrap",
                    active
                      ? "bg-[#262421] text-white border-sky-400"
                      : "text-neutral-400 hover:text-neutral-200 border-transparent",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* ─── TAB 1: ANALYSIS ─── */}
          {sidebarTab === "analysis" && (
            <div className="flex flex-col flex-1 min-h-0">
              {/* Live Engine Status Header */}
              <div className="flex items-center justify-between px-3.5 py-2.5 bg-[#2a2825] border-b border-neutral-800 gap-2 shrink-0">
                <div className="flex items-center gap-2 shrink-0">
                  <Switch
                    checked={engineState.isAnalyzing}
                    onCheckedChange={() => analysisEngine.toggleAnalysis()}
                    aria-label="Toggle Stockfish analysis"
                  />
                  <span className="text-xs font-semibold text-neutral-200">Analysis</span>
                  <button
                    type="button"
                    onClick={() => analysisEngine.toggleAnalysis()}
                    className="p-1 rounded hover:bg-neutral-700/70 text-neutral-300 hover:text-white transition-colors"
                    title={engineState.isAnalyzing ? "Pause engine" : "Resume engine"}
                  >
                    {engineState.isAnalyzing ? (
                      <Pause className="h-3.5 w-3.5" />
                    ) : (
                      <Play className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>

                <div className="flex items-center gap-1.5 text-[11px] text-neutral-400 min-w-0">
                  <span className="truncate font-mono tabular-nums">
                    depth={engineState.depth} | {engineState.engineName}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSettingsOpen(true)}
                    className="text-neutral-400 hover:text-white p-1 rounded hover:bg-neutral-700/70 shrink-0"
                    title="Engine Settings"
                  >
                    <Settings className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* MultiPV Candidate Move Lines */}
              <div className="p-2.5 space-y-1.5 border-b border-neutral-800 bg-[#23211e] shrink-0">
                {engineState.lines.length === 0 ? (
                  <div className="text-xs text-neutral-500 py-3 text-center">
                    {engineState.isAnalyzing
                      ? "Calculating candidate lines..."
                      : "Analysis paused — toggle Analysis to evaluate."}
                  </div>
                ) : (
                  engineState.lines.map((line, idx) => {
                    const cp = line.scoreCp;
                    const mate = line.scoreMate;
                    let scoreStr = "0.00";
                    let whitePositive = true;

                    if (mate != null) {
                      const turn = currentFen.split(" ")[1];
                      const signedMate = turn === "b" ? -mate : mate;
                      whitePositive = signedMate > 0;
                      scoreStr = `${whitePositive ? "" : "-"}M${Math.abs(signedMate)}`;
                    } else if (cp != null) {
                      const turn = currentFen.split(" ")[1];
                      const adj = turn === "b" ? -cp : cp;
                      whitePositive = adj >= 0;
                      scoreStr = `${adj >= 0 ? "+" : ""}${(adj / 100).toFixed(2)}`;
                    }

                    const pvItems = formatPvMoves(line.pv);
                    const dotColor = ARROW_PALETTE[idx]?.color ?? "#38bdf8";

                    return (
                      <div
                        key={line.multipv}
                        className="flex items-center gap-2 px-2 py-1.5 rounded bg-[#2d2b28] hover:bg-[#363430] border border-neutral-700/50 text-xs transition-colors"
                      >
                        <button
                          type="button"
                          onClick={() => playUciSequence(line.pv, 1)}
                          title="Play best move"
                          className={cn(
                            "font-mono font-bold tabular-nums px-1.5 py-0.5 rounded min-w-[50px] text-center shrink-0 border-l-2",
                            whitePositive
                              ? "bg-white text-neutral-900"
                              : "bg-neutral-900 text-neutral-100",
                          )}
                          style={{ borderLeftColor: dotColor }}
                        >
                          {scoreStr}
                        </button>

                        <div className="flex-1 min-w-0 overflow-hidden whitespace-nowrap text-ellipsis font-medium text-neutral-200">
                          {pvItems.map((tok) => (
                            <button
                              key={`${line.multipv}-${tok.plyCount}`}
                              type="button"
                              onClick={() => playUciSequence(line.pv, tok.plyCount)}
                              className="inline-flex items-baseline gap-0.5 mr-1.5 hover:text-sky-300 transition-colors"
                              title={`Play through ${tok.san}`}
                            >
                              {tok.prefix && (
                                <span className="text-neutral-400 text-[11px]">{tok.prefix}</span>
                              )}
                              <span>{tok.san}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Opening Recognition + Game Title */}
              <div className="border-b border-neutral-800 bg-[#211f1c] shrink-0">
                <div className="flex items-center justify-between px-3.5 py-2 border-b border-neutral-800/70 text-xs text-neutral-300">
                  <span className="truncate font-medium">
                    <span className="text-neutral-400 font-mono mr-1.5">
                      {gameDetails.eco || openingInfo.eco}
                    </span>
                    {openingInfo.name}
                  </span>
                  <BookOpen className="h-3.5 w-3.5 text-neutral-400 shrink-0" />
                </div>

                <button
                  type="button"
                  onClick={() => setDetailsOpen(true)}
                  className="w-full flex items-center justify-between px-3.5 py-2 text-xs font-semibold text-neutral-200 hover:bg-neutral-800/50 transition-colors text-left"
                >
                  <span className="truncate">
                    {gameDetails.white.name || "White"} - {gameDetails.black.name || "Black"}{" "}
                    <span className="text-neutral-400 font-normal">{gameDetails.result}</span>
                  </span>
                  <Pencil className="h-3.5 w-3.5 text-neutral-400 shrink-0" />
                </button>
              </div>

              {/* Scrollable Move Notation List */}
              <div ref={moveListRef} className="flex-1 overflow-y-auto px-3 py-2 min-h-0">
                {moveRows.length === 0 ? (
                  <div className="text-xs text-neutral-500 text-center py-6">
                    Make a move on the board or click an engine line to analyze.
                  </div>
                ) : (
                  <div className="space-y-0.5 text-xs">
                    {moveRows.map((row) => (
                      <div
                        key={row.n}
                        className="grid grid-cols-[36px_1fr_1fr] items-center rounded overflow-hidden odd:bg-[#2a2825]/60"
                      >
                        <span className="px-2 py-1 text-neutral-500 font-mono tabular-nums">
                          {row.n}.
                        </span>
                        {row.w ? (
                          <button
                            type="button"
                            onClick={() => setHistoryIndex(row.w!.ply)}
                            className={cn(
                              "text-left px-2 py-1 font-medium transition-colors rounded-sm",
                              historyIndex === row.w.ply
                                ? "bg-sky-500/25 text-sky-200 font-bold"
                                : "text-neutral-200 hover:bg-neutral-700/50",
                            )}
                          >
                            {row.w.san}
                          </button>
                        ) : (
                          <span />
                        )}
                        {row.b ? (
                          <button
                            type="button"
                            onClick={() => setHistoryIndex(row.b!.ply)}
                            className={cn(
                              "text-left px-2 py-1 font-medium transition-colors rounded-sm",
                              historyIndex === row.b.ply
                                ? "bg-sky-500/25 text-sky-200 font-bold"
                                : "text-neutral-200 hover:bg-neutral-700/50",
                            )}
                          >
                            {row.b.san}
                          </button>
                        ) : (
                          <span />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ─── TAB 2: GAMES (PGN/FEN IMPORTER & RECENT GAMES) ─── */}
          {sidebarTab === "games" && (
            <div className="flex-1 overflow-y-auto p-3.5 space-y-4 min-h-0">
              <div className="space-y-2">
                <div className="text-xs font-semibold text-neutral-200">Import PGN or FEN</div>
                <textarea
                  value={pgnInput}
                  onChange={(e) => setPgnInput(e.target.value)}
                  rows={4}
                  placeholder="Paste full PGN moves or a FEN position string..."
                  className="w-full rounded-md bg-[#1b1917] border border-neutral-700 p-2.5 text-xs font-mono text-neutral-100 placeholder:text-neutral-500 focus:outline-none focus:ring-1 focus:ring-sky-400"
                />
                <Button
                  type="button"
                  size="sm"
                  onClick={() => loadPgnOrFen(pgnInput)}
                  className="w-full bg-sky-600 hover:bg-sky-700 text-white font-semibold"
                >
                  Load into Analysis Board
                </Button>
              </div>

              <div className="space-y-2 pt-2 border-t border-neutral-800">
                <div className="text-xs font-semibold text-neutral-200">Recent BotBoard Games</div>
                {!profile ? (
                  <div className="text-xs text-neutral-500 py-3">
                    Sign in to load your saved match history.
                  </div>
                ) : loadingGames ? (
                  <div className="text-xs text-neutral-400 py-3">Loading saved games...</div>
                ) : savedGames.length === 0 ? (
                  <div className="text-xs text-neutral-500 py-3">
                    No saved games with move history yet.
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {savedGames.map((g) => (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => loadPgnOrFen(formatStandardPgn(g))}
                        className="w-full text-left p-2.5 rounded bg-[#2d2b28] hover:bg-[#383531] border border-neutral-800 transition-colors"
                      >
                        <div className="flex items-center justify-between text-xs font-semibold text-neutral-100">
                          <span className="truncate">
                            {g.white.name} vs {g.black.name}
                          </span>
                          <span className="font-mono text-neutral-400 ml-2 shrink-0">
                            {g.scoreWhite}-{g.scoreBlack}
                          </span>
                        </div>
                        <div className="text-[11px] text-neutral-400 mt-0.5 flex items-center gap-2">
                          <span>{g.moves} moves</span>
                          <span>·</span>
                          <span>{g.date}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ─── TAB 3: EXPLORE (OPENING BOOK CONTINUATIONS) ─── */}
          {sidebarTab === "explore" && (
            <div className="flex-1 overflow-y-auto p-3.5 space-y-3 min-h-0">
              <div className="text-xs text-neutral-400 flex items-center justify-between">
                <span>Opening Explorer</span>
                <span className="font-mono text-neutral-300">
                  {openingInfo.eco} · {openingInfo.name}
                </span>
              </div>

              {explorerMoves.length === 0 ? (
                <div className="text-xs text-neutral-500 py-8 text-center border border-dashed border-neutral-800 rounded-lg">
                  End of built-in opening lines for this variation. Use Stockfish Analysis to
                  explore further!
                </div>
              ) : (
                <div className="space-y-1.5">
                  {explorerMoves.map((item) => (
                    <button
                      key={item.san}
                      type="button"
                      onClick={() => playSanMove(item.san)}
                      className="w-full flex items-center justify-between p-2.5 rounded bg-[#2d2b28] hover:bg-[#383531] border border-neutral-800 text-xs transition-colors text-left"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="font-mono font-bold text-sky-300 w-12 shrink-0">
                          {item.san}
                        </span>
                        <span className="text-neutral-300 truncate">
                          {item.openings.slice(0, 2).join(", ")}
                        </span>
                      </div>
                      <span className="text-[11px] font-mono text-neutral-400 shrink-0 ml-2">
                        {item.count} {item.count === 1 ? "line" : "lines"}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ─── BOTTOM MOVE CONTROLS & ACTION BAR ─── */}
        <div className="p-3 border-t border-neutral-800 bg-[#211f1c] space-y-2 shrink-0">
          <div className="grid grid-cols-4 gap-1.5">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={historyIndex <= 0}
              onClick={() => setHistoryIndex(0)}
              aria-label="First move"
              className="bg-[#32302c] hover:bg-[#3e3c37] text-neutral-200 h-9"
            >
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={historyIndex <= 0}
              onClick={() => setHistoryIndex((i) => Math.max(0, i - 1))}
              aria-label="Previous move"
              className="bg-[#32302c] hover:bg-[#3e3c37] text-neutral-200 h-9"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={historyIndex >= fenHistory.length - 1}
              onClick={() => setHistoryIndex((i) => Math.min(fenHistory.length - 1, i + 1))}
              aria-label="Next move"
              className="bg-[#32302c] hover:bg-[#3e3c37] text-neutral-200 h-9"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={historyIndex >= fenHistory.length - 1}
              onClick={() => setHistoryIndex(fenHistory.length - 1)}
              aria-label="Last move"
              className="bg-[#32302c] hover:bg-[#3e3c37] text-neutral-200 h-9"
            >
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>

          <div className="grid grid-cols-4 gap-1 text-xs">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={resetBoard}
              className="text-neutral-300 hover:text-white hover:bg-neutral-800 whitespace-nowrap"
            >
              <Plus className="h-3.5 w-3.5 mr-1" /> New
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setSaveOpen(true)}
              className="text-neutral-300 hover:text-white hover:bg-neutral-800 whitespace-nowrap"
            >
              <Save className="h-3.5 w-3.5 mr-1" /> Save
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setFlipped((f) => !f)}
              className="text-neutral-300 hover:text-white hover:bg-neutral-800 whitespace-nowrap"
            >
              <FlipHorizontal2 className="h-3.5 w-3.5 mr-1" /> Flip
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled
              className="text-neutral-500 cursor-not-allowed whitespace-nowrap"
              title="Game Review (No game review yet)"
            >
              <Star className="h-3.5 w-3.5 mr-1" /> Review
            </Button>
          </div>
        </div>
      </aside>

      {/* Promotion Dialog */}
      <PromotionDialog
        open={!!promotion}
        color={game.turn()}
        onSelect={(p) => {
          if (promotion) commitMove(promotion.from, promotion.to, p);
          setPromotion(null);
        }}
      />

      {/* Game Details Modal */}
      <GameDetailsModal
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
        initialData={gameDetails}
        onSave={(data) => setGameDetails(data)}
      />

      {/* Save PGN / FEN Modal */}
      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="max-w-md bg-[#272522] text-neutral-100 border-neutral-700 p-6 rounded-xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-white">
              Save &amp; Share Position
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-xs mt-2">
            <div className="space-y-1.5">
              <span className="font-semibold text-neutral-300">Current FEN</span>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={currentFen}
                  className="flex-1 bg-[#1b1917] border border-neutral-700 rounded px-2.5 py-1.5 font-mono text-[11px] text-neutral-200"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    void navigator.clipboard.writeText(currentFen);
                    toast.success("FEN copied to clipboard");
                  }}
                >
                  <Copy className="h-3.5 w-3.5 mr-1" /> Copy
                </Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <span className="font-semibold text-neutral-300">PGN</span>
              <textarea
                readOnly
                rows={6}
                value={buildCurrentPgn()}
                className="w-full bg-[#1b1917] border border-neutral-700 rounded p-2.5 font-mono text-[11px] text-neutral-200"
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="flex-1"
                  onClick={() => {
                    void navigator.clipboard.writeText(buildCurrentPgn());
                    toast.success("PGN copied to clipboard");
                  }}
                >
                  <Copy className="h-3.5 w-3.5 mr-1.5" /> Copy PGN
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="flex-1 bg-[#81b64c] hover:bg-[#6c9a3f] text-white font-semibold"
                  onClick={() => {
                    const pgn = buildCurrentPgn();
                    const blob = new Blob([pgn], { type: "text/plain;charset=utf-8" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `analysis_${new Date().toISOString().slice(0, 10)}.pgn`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                    toast.success("Downloaded .pgn file");
                  }}
                >
                  <Download className="h-3.5 w-3.5 mr-1.5" /> Download .pgn
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Engine Configuration Dialog */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-w-md bg-[#272522] text-neutral-100 border-neutral-700 p-6 rounded-xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-white flex items-center gap-2">
              <Cpu className="h-4 w-4 text-sky-400" /> Engine Configuration
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 text-xs text-neutral-300 mt-2">
            {/* Engine Source */}
            <div className="space-y-2">
              <span className="font-semibold text-white block">Engine Source</span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const next = { ...engineSettings, source: "browser" as const };
                    setEngineSettings(next);
                    analysisEngine.useBrowserWasm();
                  }}
                  className={cn(
                    "p-3 rounded-lg border text-left transition-all",
                    engineSettings.source === "browser"
                      ? "border-sky-500 bg-sky-500/10 text-white font-semibold"
                      : "border-neutral-700 bg-[#1e1d1a] text-neutral-400 hover:text-neutral-200",
                  )}
                >
                  <div className="text-xs font-semibold">Built-in (WASM)</div>
                  <div className="text-[11px] text-neutral-400 font-normal mt-0.5">
                    Default · 100% Automatic
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const next = {
                      ...engineSettings,
                      source: "local_ws" as const,
                      wsUrl: engineSettings.wsUrl || DEFAULT_BRIDGE_WS_URL,
                      threads: engineSettings.threads || 13,
                      hashMb: engineSettings.hashMb < 512 ? 4096 : engineSettings.hashMb,
                    };
                    setEngineSettings(next);
                    analysisEngine.connectDesktopBridge(next.wsUrl);
                  }}
                  className={cn(
                    "p-3 rounded-lg border text-left transition-all",
                    engineSettings.source === "local_ws"
                      ? "border-purple-500 bg-purple-500/10 text-white font-semibold"
                      : "border-neutral-700 bg-[#1e1d1a] text-neutral-400 hover:text-neutral-200",
                  )}
                >
                  <div className="text-xs font-semibold flex items-center gap-1">
                    <Zap className="h-3.5 w-3.5 text-purple-400" /> My PC Stockfish
                  </div>
                  <div className="text-[11px] text-neutral-400 font-normal mt-0.5">
                    13 Threads · 4GB Hash
                  </div>
                </button>
              </div>
            </div>

            {/* Power-User Owner Bridge (Zero Terminal Commands) */}
            {engineSettings.source === "local_ws" && (
              <div className="space-y-3 p-3.5 rounded-lg bg-[#1e1c19] border border-neutral-800">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-white">Local Engine Status</span>
                  <span
                    className={cn(
                      "text-[11px] font-semibold",
                      engineState.wsConnected ? "text-emerald-400" : "text-amber-400",
                    )}
                  >
                    {engineState.wsConnected
                      ? `Connected (${engineSettings.threads} Threads Active)`
                      : "Not Connected"}
                  </span>
                </div>

                {!engineState.wsConnected && (
                  <p className="text-[11px] text-neutral-400 leading-relaxed">
                    Double-click <strong>BotBoard-Bridge.bat</strong> next to your local Stockfish
                    executable, then click Reconnect.
                  </p>
                )}

                <div className="flex items-center gap-2">
                  <a
                    href="/download/BotBoard-Bridge.bat"
                    download="BotBoard-Bridge.bat"
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-md bg-[#81b64c] hover:bg-[#6c9a3f] text-white text-xs font-semibold transition-colors whitespace-nowrap"
                  >
                    <Download className="h-3.5 w-3.5" /> Download 1-Click App
                  </a>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      const url = engineSettings.wsUrl || DEFAULT_BRIDGE_WS_URL;
                      analysisEngine.connectDesktopBridge(url);
                      toast.info("Connecting to local Stockfish...");
                    }}
                    className="bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold whitespace-nowrap"
                  >
                    Reconnect
                  </Button>
                </div>
              </div>
            )}

            {/* Infinite Analysis Toggle */}
            <div className="flex items-center justify-between py-1">
              <div>
                <div className="font-semibold text-white">Infinite Analysis</div>
                <div className="text-[11px] text-neutral-400">
                  Keep searching deeper continuously instead of stopping at depth 25.
                </div>
              </div>
              <Switch
                checked={engineSettings.infinite}
                onCheckedChange={(checked) => {
                  const next = { ...engineSettings, infinite: checked };
                  setEngineSettings(next);
                  analysisEngine.updateSettings(next);
                }}
              />
            </div>

            {/* MultiPV Lines */}
            <div className="space-y-2">
              <div className="flex justify-between">
                <span>Number of Lines (MultiPV)</span>
                <span className="font-bold text-white tabular-nums">{engineSettings.multiPv}</span>
              </div>
              <Slider
                value={[engineSettings.multiPv]}
                min={1}
                max={5}
                step={1}
                onValueChange={([val]) => {
                  const next = { ...engineSettings, multiPv: val };
                  setEngineSettings(next);
                  analysisEngine.updateSettings(next);
                }}
              />
            </div>

            {/* Threads (Local Desktop) */}
            {engineSettings.source === "local_ws" && (
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span>CPU Threads</span>
                  <span className="font-bold text-white tabular-nums">
                    {engineSettings.threads}
                  </span>
                </div>
                <Slider
                  value={[engineSettings.threads]}
                  min={1}
                  max={32}
                  step={1}
                  onValueChange={([val]) => {
                    const next = { ...engineSettings, threads: val };
                    setEngineSettings(next);
                    analysisEngine.updateSettings(next);
                  }}
                />
              </div>
            )}

            {/* Hash Size */}
            <div className="space-y-2">
              <div className="flex justify-between">
                <span>Hash Size</span>
                <span className="font-bold text-white tabular-nums">
                  {engineSettings.source === "local_ws"
                    ? engineSettings.hashMb
                    : Math.min(256, engineSettings.hashMb)}{" "}
                  MB
                </span>
              </div>
              <Slider
                value={[
                  engineSettings.source === "local_ws"
                    ? engineSettings.hashMb
                    : Math.min(256, engineSettings.hashMb),
                ]}
                min={16}
                max={engineSettings.source === "local_ws" ? 4096 : 256}
                step={16}
                onValueChange={([val]) => {
                  const next = { ...engineSettings, hashMb: val };
                  setEngineSettings(next);
                  analysisEngine.updateSettings(next);
                }}
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
