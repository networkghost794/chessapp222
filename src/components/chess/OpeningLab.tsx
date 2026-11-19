import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import { toast } from "sonner";
import {
  BookOpen,
  Download,
  Upload,
  Dna,
  ChevronLeft,
  RotateCcw,
  Trash2,
  Bot as BotIcon,
  Save,
  Undo2,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  analyzeGames,
  listPlayers,
  movesAt,
  splitPgn,
  type ColorFilter,
  type LabResult,
  type PgnGame,
  type PosStats,
  type ResultFilter,
} from "@/lib/openingLab";
import {
  botToInput,
  loadBots,
  refreshFromCloud,
  subscribeBots,
  updateBot,
  uploadBookFile,
  type BotConfig,
} from "@/lib/botStore";
import {
  botRepertoireToTree,
  countTreeStats,
  decodePolyglotToTree,
  opponentContinuationsAt,
  removeMoveFromTree,
  removeSideFromTree,
  treeToPolyglotBinary,
} from "@/lib/openingBookEditor";
import { base64ToBytes } from "@/lib/polyglot";

const GLYPH: Record<string, string> = {
  wk: "♔",
  wq: "♕",
  wr: "♖",
  wb: "♗",
  wn: "♘",
  wp: "♙",
  bk: "♚",
  bq: "♛",
  br: "♜",
  bb: "♝",
  bn: "♞",
  bp: "♟",
};
const STYLE_LABELS: Record<string, string> = {
  pawnAdvance: "Pawn advance",
  pieceDevelopment: "Piece development",
  capture: "Captures",
  check: "Checks",
  kingSafety: "King safety",
  positional: "Positional",
};
const EXP_LABELS: Record<string, string> = {
  keepBishopPair: "Keep bishop pair",
  advance: "Advance",
  check: "Check",
  capture: "Capture",
};

function MiniBoard({ fen, flipped = false }: { fen: string; flipped?: boolean }) {
  const squares = useMemo(() => {
    const flat = new Chess(fen).board().flat();
    return flipped ? [...flat].reverse() : flat;
  }, [fen, flipped]);
  return (
    <div className="grid grid-cols-8 w-full max-w-[320px] aspect-square rounded-md overflow-hidden ring-1 ring-border">
      {squares.map((sq, i) => {
        const dark = (Math.floor(i / 8) + i) % 2 === 1;
        return (
          <div
            key={i}
            className={cn(
              "grid place-items-center text-[26px] leading-none select-none",
              dark ? "bg-primary/40" : "bg-muted",
            )}
          >
            {sq ? (
              <span
                className={
                  sq.color === "w" ? "text-foreground drop-shadow" : "text-background drop-shadow"
                }
              >
                {GLYPH[sq.color + sq.type]}
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

const fmtSize = (n: number) =>
  n > 1024 * 1024 ? `${(n / 1048576).toFixed(2)} MB` : `${(n / 1024).toFixed(1)} KB`;

export function OpeningLab({
  initialBotId,
  initialBotRequest,
}: {
  initialBotId?: string;
  initialBotRequest?: { id: string; n: number } | null;
}) {
  // PGN Lab state
  const [games, setGames] = useState<PgnGame[]>([]);
  const [fileName, setFileName] = useState("");
  const [player, setPlayer] = useState("");
  const [color, setColor] = useState<ColorFilter>("both");
  const [result, setResult] = useState<ResultFilter>("wins");
  const [maxPly, setMaxPly] = useState(24);
  const [minCount, setMinCount] = useState(1);
  const [lab, setLab] = useState<LabResult | null>(null);
  const [path, setPath] = useState<string[]>([]);
  const [bots, setBots] = useState<BotConfig[]>(loadBots());
  const [botId, setBotId] = useState(initialBotRequest?.id || initialBotId || "");
  const [busy, setBusy] = useState(false);

  // Bot Book & Repertoire Editor state
  const [editorTree, setEditorTree] = useState<PosStats | null>(null);
  const [editorUndoStack, setEditorUndoStack] = useState<PosStats[]>([]);
  const [editorBin, setEditorBin] = useState<Uint8Array | null>(null);
  const [editorPath, setEditorPath] = useState<string[]>([]);
  const [perspective, setPerspective] = useState<"all" | "w" | "b">("all");
  const [removedCount, setRemovedCount] = useState(0);
  const [editorSource, setEditorSource] = useState<"book" | "repertoire" | "pgn" | null>(null);
  const [editorBusy, setEditorBusy] = useState(false);
  const autoLoadedRef = useRef<string>("");

  useEffect(() => {
    const u = subscribeBots(() => setBots(loadBots()));
    refreshFromCloud().then(setBots);
    return u;
  }, []);

  useEffect(() => {
    const reqId = initialBotRequest?.id || initialBotId;
    if (reqId) {
      setBotId(reqId);
      // Force reload when triggered explicitly from Bot Builder
      autoLoadedRef.current = "";
    }
  }, [initialBotId, initialBotRequest]);

  const players = useMemo(() => listPlayers(games), [games]);

  const bot = useMemo(() => bots.find((b) => b.id === botId), [bots, botId]);

  const loadBotBookForEditor = useCallback(
    async (targetBot: BotConfig, forceRepertoire = false) => {
      setEditorBusy(true);
      try {
        let tree: PosStats;
        let bin: Uint8Array;
        let src: "book" | "repertoire" = "repertoire";

        if (!forceRepertoire && targetBot.opening.bookUrl) {
          const res = await fetch(targetBot.opening.bookUrl);
          if (!res.ok) throw new Error(`HTTP ${res.status} fetching opening book`);
          const bytes = new Uint8Array(await res.arrayBuffer());
          tree = decodePolyglotToTree(bytes);
          bin = bytes;
          src = "book";
        } else if (!forceRepertoire && targetBot.opening.bookBin) {
          const bytes = base64ToBytes(targetBot.opening.bookBin);
          tree = decodePolyglotToTree(bytes);
          bin = bytes;
          src = "book";
        } else {
          tree = botRepertoireToTree(targetBot.id);
          bin = treeToPolyglotBinary(tree);
          src = "repertoire";
        }

        setEditorTree(tree);
        setEditorBin(bin);
        setEditorUndoStack([]);
        setRemovedCount(0);
        setEditorPath([]);
        setEditorSource(src);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to load bot opening book");
      } finally {
        setEditorBusy(false);
      }
    },
    [],
  );

  // Immediately load active book or built-in repertoire whenever a bot is selected
  useEffect(() => {
    if (!bot) {
      if (!botId) {
        setEditorTree(null);
        setEditorBin(null);
        setEditorUndoStack([]);
        setEditorPath([]);
        setRemovedCount(0);
        setEditorSource(null);
        autoLoadedRef.current = "";
      }
      return;
    }
    const reqKey = `${bot.id}:${initialBotRequest?.n ?? 0}`;
    if (autoLoadedRef.current === reqKey) return;
    autoLoadedRef.current = reqKey;
    void loadBotBookForEditor(bot);
  }, [bot, botId, initialBotRequest, loadBotBookForEditor]);

  const editorFen = useMemo(() => {
    const c = new Chess();
    for (const m of editorPath) c.move(m);
    return c.fen();
  }, [editorPath]);

  const editorTurn = editorFen.split(" ")[1] as "w" | "b";
  const editorMoves = useMemo(
    () => (editorTree ? movesAt(editorTree, editorFen) : []),
    [editorTree, editorFen],
  );
  const editorTotalWeight = useMemo(
    () => editorMoves.reduce((acc, m) => acc + m.count, 0),
    [editorMoves],
  );
  const editorOpponentBridges = useMemo(
    () => (editorTree ? opponentContinuationsAt(editorTree, editorFen) : []),
    [editorTree, editorFen],
  );
  const editorStats = useMemo(() => (editorTree ? countTreeStats(editorTree) : null), [editorTree]);

  const handleRemoveMove = (uci: string, san: string) => {
    if (!editorTree) return;
    setEditorUndoStack((prev) => [...prev.slice(-19), editorTree]);
    const updated = removeMoveFromTree(editorTree, editorFen, uci);
    const newBin = treeToPolyglotBinary(updated);
    setEditorTree(updated);
    setEditorBin(newBin);
    setRemovedCount((c) => c + 1);
    toast.success(`Removed ${san} (${uci}) and downstream lines from book`);
  };

  const handleStripSide = (side: "w" | "b") => {
    if (!editorTree) return;
    setEditorUndoStack((prev) => [...prev.slice(-19), editorTree]);
    const updated = removeSideFromTree(editorTree, side);
    const newBin = treeToPolyglotBinary(updated);
    setEditorTree(updated);
    setEditorBin(newBin);
    setEditorPath([]);
    setRemovedCount((c) => c + 1);
    toast.success(`Removed all ${side === "w" ? "White" : "Black"} opening moves from book`);
  };

  const handleUndoEdit = () => {
    if (!editorUndoStack.length) return;
    const prev = editorUndoStack[editorUndoStack.length - 1];
    setEditorUndoStack((s) => s.slice(0, -1));
    setEditorTree(prev);
    setEditorBin(treeToPolyglotBinary(prev));
    setRemovedCount((c) => Math.max(0, c - 1));
  };

  const downloadEditedBin = () => {
    if (!editorBin || !editorBin.length) return;
    const slug = (bot?.name || "edited_book").toLowerCase().replace(/\s+/g, "_");
    const url = URL.createObjectURL(
      new Blob([editorBin as BlobPart], { type: "application/octet-stream" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slug}_custom.bin`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const savePrunedBookToBot = async () => {
    if (!bot || !editorBin) return;
    if (editorBin.length === 0) {
      toast.error("Cannot save an empty opening book. Undo a removal or reset to repertoire.");
      return;
    }
    setEditorBusy(true);
    try {
      const customName = `${bot.name.toLowerCase().replace(/\s+/g, "_")}_custom.bin`;
      const url = await uploadBookFile(editorBin, customName);
      await updateBot(
        bot.id,
        botToInput(bot, {
          opening: {
            ...bot.opening,
            enabled: true,
            bookUrl: url,
            bookName: customName,
            bookSize: editorBin.length,
            bookBin: undefined,
          },
        }),
      );
      toast.success(`Saved customized opening book to ${bot.name} (${fmtSize(editorBin.length)})`);
      setRemovedCount(0);
      setEditorSource("book");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save opening book");
    } finally {
      setEditorBusy(false);
    }
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    const text = await f.text();
    const g = splitPgn(text);
    if (!g.length) {
      toast.error("No games found in that file. Make sure it's a .pgn file.");
      return;
    }
    setGames(g);
    setFileName(f.name);
    setLab(null);
    setPath([]);
    const top = listPlayers(g)[0];
    if (top) setPlayer(top.name);
    toast.success(`Loaded ${g.length} games`);
  };

  const run = () => {
    if (!games.length) return;
    setBusy(true);
    setTimeout(() => {
      try {
        const r = analyzeGames(games, { player, color, result, maxPly, minCount });
        setLab(r);
        setPath([]);
        if (!r.entries)
          toast.error("No moves matched your filters — try All results or another player.");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Analysis failed");
      }
      setBusy(false);
    }, 20);
  };

  const fen = useMemo(() => {
    const c = new Chess();
    for (const m of path) c.move(m);
    return c.fen();
  }, [path]);
  const moves = lab ? movesAt(lab.tree, fen) : [];
  const total = moves.reduce((a, m) => a + m.count, 0);
  const bookName = `${(player || fileName.replace(/\.pgn$/i, "") || "book").replace(/\s+/g, "_").toLowerCase()}.bin`;

  const download = () => {
    if (!lab) return;
    const url = URL.createObjectURL(
      new Blob([lab.book as BlobPart], { type: "application/octet-stream" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = bookName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const assignBook = async () => {
    if (!lab || !bot) return;
    if (!lab.entries) {
      toast.error("Book is empty.");
      return;
    }
    setBusy(true);
    try {
      const url = await uploadBookFile(lab.book, bookName);
      await updateBot(
        bot.id,
        botToInput(bot, {
          opening: {
            ...bot.opening,
            enabled: true,
            bookUrl: url,
            bookName,
            bookSize: lab.book.length,
            bookBin: undefined,
            maxBookDepth: maxPly,
          },
        }),
      );
      toast.success(
        `Polyglot Book ✓ ${bookName} saved to ${bot.name} (${fmtSize(lab.book.length)})`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the book");
    }
    setBusy(false);
  };

  const applyDna = async () => {
    if (!lab || !bot) return;
    setBusy(true);
    try {
      const d = lab.dna;
      await updateBot(
        bot.id,
        botToInput(bot, {
          middlegame: { ...bot.middlegame, style: d.style, expected: d.expected },
          endgame: {
            ...bot.endgame,
            style: { ...d.style, kingSafety: Math.max(20, d.style.kingSafety - 20) },
            expected: d.expected,
          },
          engine: { ...bot.engine, profile: d.engineProfile },
        }),
      );
      toast.success(`Style DNA applied to ${bot.name}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not apply DNA");
    }
    setBusy(false);
  };

  const loadLabTreeIntoEditor = () => {
    if (!lab) return;
    setEditorTree(lab.tree);
    setEditorBin(lab.book);
    setEditorUndoStack([]);
    setEditorPath([]);
    setRemovedCount(0);
    setEditorSource("pgn");
    toast.success("Loaded compiled PGN tree into Book Editor");
  };

  const sel = "h-8 w-full rounded-md bg-background border border-border px-2 text-xs";
  return (
    <div className="space-y-6">
      {/* Dedicated Bot Book & Repertoire Editor Panel */}
      <section className="rounded-xl border border-warning/40 bg-card/90 p-4 space-y-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <BotIcon className="w-5 h-5 text-warning" />
              <div>
                <h3 className="text-sm font-bold leading-tight">Bot Book & Repertoire Editor</h3>
                <p className="text-[11px] text-muted-foreground">
                  Inspect, prune unwanted opening lines, and save custom Polyglot `.bin` books
                </p>
              </div>
            </div>
            <select
              className="h-8 rounded-md bg-background border border-border px-3 text-xs min-w-[230px]"
              value={botId}
              onChange={(e) => {
                autoLoadedRef.current = "";
                setBotId(e.target.value);
              }}
            >
              <option value="">Select Bot to edit…</option>
              {bots.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.opening.bookName ? b.opening.bookName : "Built-in Repertoire"})
                </option>
              ))}
            </select>
            {bot && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => void loadBotBookForEditor(bot, true)}
                disabled={editorBusy}
                title="Reset editor back to this bot's default 6-opening built-in repertoire"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Reset to Built-in Repertoire
              </Button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Perspective Toggle */}
            <div className="inline-flex rounded-lg border border-border bg-background p-0.5 text-xs">
              {(
                [
                  ["all", "All Moves"],
                  ["w", "⚪ White Openings"],
                  ["b", "⚫ Black Openings"],
                ] as const
              ).map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setPerspective(val)}
                  className={cn(
                    "px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
                    perspective === val
                      ? "bg-warning/20 text-warning font-semibold"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            {editorUndoStack.length > 0 && (
              <Button size="sm" variant="outline" onClick={handleUndoEdit} disabled={editorBusy}>
                <Undo2 className="w-3.5 h-3.5" /> Undo
              </Button>
            )}

            {editorBin && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={downloadEditedBin}
                  disabled={!editorBin.length || editorBusy}
                >
                  <Download className="w-3.5 h-3.5" /> Download Edited .bin
                </Button>
                <Button
                  size="sm"
                  onClick={savePrunedBookToBot}
                  disabled={!bot || !editorBin.length || editorBusy}
                >
                  <Save className="w-3.5 h-3.5" /> Save Pruned Book to Bot
                </Button>
              </>
            )}
          </div>
        </div>

        {editorBusy ? (
          <div className="p-8 text-center text-xs text-muted-foreground">
            Decoding opening book…
          </div>
        ) : editorTree ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <div className="flex flex-wrap items-center gap-2">
                {bot && <span className="font-semibold text-foreground">Editing: {bot.name}</span>}
                <span className="px-2 py-0.5 rounded bg-muted text-foreground/90 font-medium">
                  Source:{" "}
                  {editorSource === "book"
                    ? bot?.opening.bookName || "Polyglot .bin"
                    : editorSource === "pgn"
                      ? "Compiled PGN Tree"
                      : "Built-in 6-Opening Repertoire"}
                </span>
                {editorStats && (
                  <span>
                    {editorStats.positions} positions · {editorStats.entries} moves (
                    {editorStats.whiteMoves} White / {editorStats.blackMoves} Black)
                  </span>
                )}
                {editorBin && <span>· {fmtSize(editorBin.length)}</span>}
                {removedCount > 0 && (
                  <span className="text-warning font-semibold">
                    · {removedCount} removal(s) unsaved
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                {editorStats && editorStats.whiteMoves > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-[11px]"
                    onClick={() => handleStripSide("w")}
                  >
                    Strip White Branch
                  </Button>
                )}
                {editorStats && editorStats.blackMoves > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-[11px]"
                    onClick={() => handleStripSide("b")}
                  >
                    Strip Black Branch
                  </Button>
                )}
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[330px_1fr]">
              <div className="space-y-3 bg-background/60 border border-border p-3.5 rounded-xl">
                <MiniBoard fen={editorFen} flipped={perspective === "b"} />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setEditorPath((p) => p.slice(0, -1))}
                    disabled={!editorPath.length}
                  >
                    <ChevronLeft className="w-3.5 h-3.5" /> Back
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setEditorPath([])}
                    disabled={!editorPath.length}
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> Start
                  </Button>
                </div>
                <div className="text-xs text-muted-foreground break-words font-mono bg-card/60 rounded-md p-2 border border-border/60">
                  {editorPath.length
                    ? editorPath.map((m, i) => (i % 2 === 0 ? `${i / 2 + 1}.${m}` : m)).join(" ")
                    : "1. Start position"}
                </div>
              </div>

              <div className="space-y-3 bg-background/60 border border-border p-3.5 rounded-xl">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
                  <h4 className="text-sm font-bold flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-warning" />
                    Moves Played as {editorTurn === "w" ? "White ⚪" : "Black ⚫"}
                    {perspective !== "all" && perspective !== editorTurn && (
                      <span className="text-[11px] font-normal text-muted-foreground">
                        (Click a move below to inspect {perspective === "w" ? "White" : "Black"}{" "}
                        replies)
                      </span>
                    )}
                  </h4>
                  <span className="text-xs text-muted-foreground">
                    {editorMoves.length} candidate move{editorMoves.length === 1 ? "" : "s"}
                  </span>
                </div>

                {editorMoves.length === 0 ? (
                  <div className="p-4 text-center text-xs text-muted-foreground space-y-3">
                    <p>
                      No opening book moves defined at this position for{" "}
                      {editorTurn === "w" ? "White" : "Black"}. The bot will calculate moves with
                      its engine here.
                    </p>
                    {editorOpponentBridges.length > 0 && (
                      <div className="pt-2 border-t border-border text-left">
                        <div className="text-[11px] font-medium text-foreground mb-1.5">
                          Legal {editorTurn === "w" ? "White" : "Black"} moves leading into book
                          lines:
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {editorOpponentBridges.map((opp) => (
                            <Button
                              key={opp.uci}
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              onClick={() => setEditorPath((p) => [...p, opp.san])}
                            >
                              {opp.san}
                            </Button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                    {editorMoves.map((m) => {
                      const pct =
                        editorTotalWeight > 0 ? Math.round((m.count / editorTotalWeight) * 100) : 0;
                      const isOtherPerspective =
                        perspective !== "all" && perspective !== editorTurn;
                      return (
                        <div
                          key={m.uci}
                          className={cn(
                            "flex items-center justify-between gap-3 p-2.5 rounded-lg border transition-colors",
                            isOtherPerspective
                              ? "border-border/60 bg-muted/20"
                              : "border-border hover:border-warning/50 bg-secondary/20",
                          )}
                        >
                          <button
                            type="button"
                            onClick={() => setEditorPath((p) => [...p, m.san])}
                            className="flex-1 text-left group"
                          >
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-bold text-sm text-foreground group-hover:underline flex items-center gap-2">
                                <span>{m.san}</span>
                                <span className="text-[11px] font-normal text-muted-foreground font-mono">
                                  ({m.uci})
                                </span>
                              </span>
                              <span className="text-muted-foreground font-mono">
                                wt {m.count} · {pct}%
                              </span>
                            </div>
                            <div className="mt-1.5 h-1.5 rounded bg-muted overflow-hidden">
                              <div
                                className="h-full bg-warning transition-all"
                                style={{ width: `${Math.max(4, pct)}%` }}
                              />
                            </div>
                          </button>

                          <Button
                            size="sm"
                            variant="destructive"
                            className="h-7 text-xs shrink-0 flex items-center gap-1"
                            onClick={() => handleRemoveMove(m.uci, m.san)}
                          >
                            <Trash2 className="w-3 h-3" /> Remove Move
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="p-6 text-center border border-dashed border-border rounded-xl text-muted-foreground text-xs">
            Select any bot above to immediately load its Polyglot `.bin` book or built-in repertoire
            for move-by-move editing and pruning.
          </div>
        )}
      </section>

      {/* PGN Book Builder & Style DNA */}
      <div className="grid gap-4 lg:grid-cols-[300px_1fr_340px]">
        {/* 1. Import & filters */}
        <section className="rounded-xl border border-border bg-card p-4 space-y-3">
          <h3 className="text-sm font-bold flex items-center gap-2">
            <Upload className="w-4 h-4 text-warning" /> 1. Import PGN
          </h3>
          <label className="block rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground cursor-pointer hover:border-warning/60">
            <input
              type="file"
              accept=".pgn,text/plain"
              className="hidden"
              onChange={(e) => onFile(e.target.files?.[0])}
            />
            {fileName ? (
              <>
                <b className="text-foreground">{fileName}</b>
                <br />
                {games.length} games
              </>
            ) : (
              "Click to choose a .pgn file"
            )}
          </label>
          {games.length > 0 && (
            <>
              <div className="space-y-1">
                <div className="text-[11px] text-muted-foreground">Player to learn</div>
                <select className={sel} value={player} onChange={(e) => setPlayer(e.target.value)}>
                  <option value="">— Any player —</option>
                  {players.slice(0, 200).map((p) => (
                    <option key={p.name} value={p.name}>
                      {p.name} ({p.count})
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <div className="text-[11px] text-muted-foreground">Color</div>
                  <select
                    className={sel}
                    value={color}
                    onChange={(e) => setColor(e.target.value as ColorFilter)}
                  >
                    <option value="both">Both</option>
                    <option value="white">White</option>
                    <option value="black">Black</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <div className="text-[11px] text-muted-foreground">Results</div>
                  <select
                    className={sel}
                    value={result}
                    onChange={(e) => setResult(e.target.value as ResultFilter)}
                    disabled={!player}
                  >
                    <option value="wins">Wins only</option>
                    <option value="winsDraws">Wins + draws</option>
                    <option value="all">All games</option>
                  </select>
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-[11px] text-muted-foreground flex justify-between">
                  <span>Book depth</span>
                  <b>
                    {maxPly} plies ({Math.ceil(maxPly / 2)} moves)
                  </b>
                </div>
                <input
                  type="range"
                  min={4}
                  max={40}
                  value={maxPly}
                  onChange={(e) => setMaxPly(+e.target.value)}
                  className="w-full"
                />
              </div>
              <div className="space-y-1">
                <div className="text-[11px] text-muted-foreground flex justify-between">
                  <span>Min. times played</span>
                  <b>{minCount}</b>
                </div>
                <input
                  type="range"
                  min={1}
                  max={5}
                  value={minCount}
                  onChange={(e) => setMinCount(+e.target.value)}
                  className="w-full"
                />
              </div>
              {!player && (
                <p className="text-[10px] text-muted-foreground">
                  Pick a player to use the result filter and get Style DNA.
                </p>
              )}
              <Button className="w-full" onClick={run} disabled={busy}>
                {busy ? "Working…" : "Analyze & compile book"}
              </Button>
            </>
          )}
          {lab && (
            <div className="grid grid-cols-2 gap-2 text-center text-[11px]">
              {[
                ["Games used", lab.used],
                ["Skipped", lab.skipped],
                ["Positions", lab.positions],
                ["Book moves", lab.entries],
              ].map(([l, v]) => (
                <div key={l as string} className="rounded-md bg-muted/50 p-2">
                  <div className="text-base font-bold">{v}</div>
                  <div className="text-muted-foreground">{l}</div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 2. Tree */}
        <section className="rounded-xl border border-border bg-card p-4 space-y-3">
          <h3 className="text-sm font-bold flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-warning" /> 2. Opening tree
          </h3>
          {!lab ? (
            <p className="text-xs text-muted-foreground">
              Import a PGN and compile to explore what the player plays.
            </p>
          ) : (
            <div className="grid gap-4 md:grid-cols-[320px_1fr]">
              <div className="space-y-2">
                <MiniBoard fen={fen} />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setPath((p) => p.slice(0, -1))}
                    disabled={!path.length}
                  >
                    <ChevronLeft className="w-3.5 h-3.5" /> Back
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setPath([])}
                    disabled={!path.length}
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> Start
                  </Button>
                </div>
                <div className="text-[11px] text-muted-foreground break-words">
                  {path.length
                    ? path.map((m, i) => (i % 2 === 0 ? `${i / 2 + 1}.${m}` : m)).join(" ")
                    : "Starting position"}
                </div>
              </div>
              <div className="space-y-1.5">
                {moves.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    No book moves for the player here (opponent's turn or out of book). Go back or
                    play the opponent's reply from another line.
                  </p>
                )}
                {moves.map((m) => {
                  const pct = Math.round((m.count / total) * 100);
                  const win = Math.round((m.wins / m.count) * 100);
                  return (
                    <button
                      key={m.uci}
                      onClick={() => setPath((p) => [...p, m.san])}
                      className="w-full text-left rounded-md border border-border hover:border-warning/60 p-2"
                    >
                      <div className="flex justify-between text-xs">
                        <b>{m.san}</b>
                        <span className="text-muted-foreground">
                          {m.count}× · {pct}% · win {win}%
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 rounded bg-muted overflow-hidden">
                        <div className="h-full bg-warning" style={{ width: `${pct}%` }} />
                      </div>
                    </button>
                  );
                })}
                {lab && moves.length === 0 && path.length > 0 && (
                  <OpponentReplies
                    lab={lab}
                    path={path}
                    onPick={(san) => setPath((p) => [...p, san])}
                  />
                )}
              </div>
            </div>
          )}
        </section>

        {/* 3. DNA & assignment */}
        <section className="rounded-xl border border-border bg-card p-4 space-y-3">
          <h3 className="text-sm font-bold flex items-center gap-2">
            <Dna className="w-4 h-4 text-warning" /> 3. Style DNA & assign
          </h3>
          {!lab ? (
            <p className="text-xs text-muted-foreground">Recommendations appear after analysis.</p>
          ) : (
            <>
              {lab.dna.samples === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Pick a player (or one color) to calculate Style DNA.
                </p>
              ) : (
                <>
                  <div className="space-y-1">
                    {lab.dna.facts.map((f) => (
                      <div key={f.label} className="flex justify-between text-[11px]">
                        <span className="text-muted-foreground">{f.label}</span>
                        <b>{f.value}</b>
                      </div>
                    ))}
                  </div>
                  <div className="text-[11px] font-semibold pt-1">Move type weights</div>
                  {Object.entries(lab.dna.style).map(([k, v]) => (
                    <div key={k}>
                      <div className="flex justify-between text-[11px]">
                        <span>{STYLE_LABELS[k]}</span>
                        <b>{v}</b>
                      </div>
                      <div className="h-1.5 rounded bg-muted overflow-hidden">
                        <div className="h-full bg-primary" style={{ width: `${v}%` }} />
                      </div>
                    </div>
                  ))}
                  <div className="text-[11px] font-semibold pt-1">Expected moves</div>
                  <div className="grid grid-cols-2 gap-1 text-[11px]">
                    {Object.entries(lab.dna.expected).map(([k, v]) => (
                      <div key={k} className="flex justify-between rounded bg-muted/50 px-2 py-1">
                        <span>{EXP_LABELS[k]}</span>
                        <b>{v}</b>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between text-[11px] rounded bg-muted/50 px-2 py-1">
                    <span>Engine style</span>
                    <b className="capitalize">{lab.dna.engineProfile}</b>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    These are estimates from move statistics. Strength, mistakes and depth are not
                    changed.
                  </p>
                </>
              )}
              <div className="border-t border-border pt-3 space-y-2">
                <select className={sel} value={botId} onChange={(e) => setBotId(e.target.value)}>
                  <option value="">Choose a bot…</option>
                  {bots.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.elo})
                    </option>
                  ))}
                </select>
                {bot?.opening.bookName && (
                  <p className="text-[10px] text-muted-foreground">
                    Current book: {bot.opening.bookName}
                    {bot.opening.bookSize ? ` · ${fmtSize(bot.opening.bookSize)}` : ""}
                  </p>
                )}
                <Button
                  className="w-full"
                  onClick={assignBook}
                  disabled={!bot || busy || !lab.entries}
                >
                  Assign {bookName} ({fmtSize(lab.book.length)})
                </Button>
                <Button
                  className="w-full"
                  variant="secondary"
                  onClick={applyDna}
                  disabled={!bot || busy || lab.dna.samples === 0}
                >
                  Apply Style DNA to bot
                </Button>
                <Button
                  className="w-full"
                  variant="outline"
                  onClick={loadLabTreeIntoEditor}
                  disabled={!lab.entries}
                >
                  <BookOpen className="w-4 h-4" /> Edit & Prune in Book Editor
                </Button>
                <Button
                  className="w-full"
                  variant="outline"
                  onClick={download}
                  disabled={!lab.entries}
                >
                  <Download className="w-4 h-4" /> Download .bin
                </Button>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

/** When it's the opponent's turn, list replies seen in the games so the tree can continue. */
function OpponentReplies({
  lab,
  path,
  onPick,
}: {
  lab: LabResult;
  path: string[];
  onPick: (san: string) => void;
}) {
  const replies = useMemo(() => {
    const c = new Chess();
    for (const m of path) c.move(m);
    const out: string[] = [];
    for (const mv of c.moves({ verbose: true })) {
      const n = new Chess(c.fen());
      n.move(mv.san);
      if (movesAt(lab.tree, n.fen()).length) out.push(mv.san);
    }
    return out;
  }, [lab, path]);
  if (!replies.length) return null;
  return (
    <div className="pt-2">
      <div className="text-[11px] text-muted-foreground mb-1">
        Opponent replies that continue the book:
      </div>
      <div className="flex flex-wrap gap-1">
        {replies.map((s) => (
          <Button key={s} size="sm" variant="outline" onClick={() => onPick(s)}>
            {s}
          </Button>
        ))}
      </div>
    </div>
  );
}
