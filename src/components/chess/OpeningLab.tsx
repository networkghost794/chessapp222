import { useEffect, useMemo, useState } from "react";
import { Chess } from "chess.js";
import { toast } from "sonner";
import { BookOpen, Download, Upload, Dna, ChevronLeft, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  analyzeGames, listPlayers, movesAt, splitPgn,
  type ColorFilter, type LabResult, type PgnGame, type ResultFilter,
} from "@/lib/openingLab";
import {
  botToInput, loadBots, refreshFromCloud, subscribeBots, updateBot, uploadBookFile, type BotConfig,
} from "@/lib/botStore";

const GLYPH: Record<string, string> = { wk: "♔", wq: "♕", wr: "♖", wb: "♗", wn: "♘", wp: "♙", bk: "♚", bq: "♛", br: "♜", bb: "♝", bn: "♞", bp: "♟" };
const STYLE_LABELS: Record<string, string> = {
  pawnAdvance: "Pawn advance", pieceDevelopment: "Piece development", capture: "Captures",
  check: "Checks", kingSafety: "King safety", positional: "Positional",
};
const EXP_LABELS: Record<string, string> = { keepBishopPair: "Keep bishop pair", advance: "Advance", check: "Check", capture: "Capture" };

function MiniBoard({ fen }: { fen: string }) {
  const board = useMemo(() => new Chess(fen).board(), [fen]);
  return (
    <div className="grid grid-cols-8 w-full max-w-[320px] aspect-square rounded-md overflow-hidden ring-1 ring-border">
      {board.flat().map((sq, i) => {
        const dark = (Math.floor(i / 8) + i) % 2 === 1;
        return (
          <div key={i} className={cn("grid place-items-center text-[26px] leading-none select-none", dark ? "bg-primary/40" : "bg-muted")}>
            {sq ? <span className={sq.color === "w" ? "text-foreground drop-shadow" : "text-background drop-shadow"}>{GLYPH[sq.color + sq.type]}</span> : null}
          </div>
        );
      })}
    </div>
  );
}

const fmtSize = (n: number) => (n > 1024 * 1024 ? `${(n / 1048576).toFixed(2)} MB` : `${(n / 1024).toFixed(1)} KB`);

export function OpeningLab() {
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
  const [botId, setBotId] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { const u = subscribeBots(() => setBots(loadBots())); refreshFromCloud().then(setBots); return u; }, []);
  const players = useMemo(() => listPlayers(games), [games]);

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    const text = await f.text();
    const g = splitPgn(text);
    if (!g.length) { toast.error("No games found in that file. Make sure it's a .pgn file."); return; }
    setGames(g); setFileName(f.name); setLab(null); setPath([]);
    const top = listPlayers(g)[0]; if (top) setPlayer(top.name);
    toast.success(`Loaded ${g.length} games`);
  };

  const run = () => {
    if (!games.length) return;
    setBusy(true);
    setTimeout(() => {
      try {
        const r = analyzeGames(games, { player, color, result, maxPly, minCount });
        setLab(r); setPath([]);
        if (!r.entries) toast.error("No moves matched your filters — try All results or another player.");
      } catch (e) { toast.error(e instanceof Error ? e.message : "Analysis failed"); }
      setBusy(false);
    }, 20);
  };

  const fen = useMemo(() => { const c = new Chess(); for (const m of path) c.move(m); return c.fen(); }, [path]);
  const moves = lab ? movesAt(lab.tree, fen) : [];
  const total = moves.reduce((a, m) => a + m.count, 0);
  const bookName = `${(player || fileName.replace(/\.pgn$/i, "") || "book").replace(/\s+/g, "_").toLowerCase()}.bin`;
  const bot = bots.find((b) => b.id === botId);

  const download = () => {
    if (!lab) return;
    const url = URL.createObjectURL(new Blob([lab.book], { type: "application/octet-stream" }));
    const a = document.createElement("a"); a.href = url; a.download = bookName; a.click(); URL.revokeObjectURL(url);
  };

  const assignBook = async () => {
    if (!lab || !bot) return;
    if (!lab.entries) { toast.error("Book is empty."); return; }
    setBusy(true);
    try {
      const url = await uploadBookFile(lab.book, bookName);
      await updateBot(bot.id, botToInput(bot, {
        opening: { ...bot.opening, enabled: true, bookUrl: url, bookName, bookSize: lab.book.length, bookBin: undefined, maxBookDepth: maxPly },
      }));
      toast.success(`Polyglot Book ✓ ${bookName} saved to ${bot.name} (${fmtSize(lab.book.length)})`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not save the book"); }
    setBusy(false);
  };

  const applyDna = async () => {
    if (!lab || !bot) return;
    setBusy(true);
    try {
      const d = lab.dna;
      await updateBot(bot.id, botToInput(bot, {
        middlegame: { ...bot.middlegame, style: d.style, expected: d.expected },
        endgame: { ...bot.endgame, style: { ...d.style, kingSafety: Math.max(20, d.style.kingSafety - 20) }, expected: d.expected },
        engine: { ...bot.engine, profile: d.engineProfile },
      }));
      toast.success(`Style DNA applied to ${bot.name}`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not apply DNA"); }
    setBusy(false);
  };

  const sel = "h-8 w-full rounded-md bg-background border border-border px-2 text-xs";
  return (
    <div className="grid gap-4 lg:grid-cols-[300px_1fr_340px]">
      {/* 1. Import & filters */}
      <section className="rounded-xl border border-border bg-card p-4 space-y-3">
        <h3 className="text-sm font-bold flex items-center gap-2"><Upload className="w-4 h-4 text-warning" /> 1. Import PGN</h3>
        <label className="block rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground cursor-pointer hover:border-warning/60">
          <input type="file" accept=".pgn,text/plain" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
          {fileName ? <><b className="text-foreground">{fileName}</b><br />{games.length} games</> : "Click to choose a .pgn file"}
        </label>
        {games.length > 0 && (<>
          <div className="space-y-1">
            <div className="text-[11px] text-muted-foreground">Player to learn</div>
            <select className={sel} value={player} onChange={(e) => setPlayer(e.target.value)}>
              <option value="">— Any player —</option>
              {players.slice(0, 200).map((p) => <option key={p.name} value={p.name}>{p.name} ({p.count})</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1"><div className="text-[11px] text-muted-foreground">Color</div>
              <select className={sel} value={color} onChange={(e) => setColor(e.target.value as ColorFilter)}>
                <option value="both">Both</option><option value="white">White</option><option value="black">Black</option>
              </select></div>
            <div className="space-y-1"><div className="text-[11px] text-muted-foreground">Results</div>
              <select className={sel} value={result} onChange={(e) => setResult(e.target.value as ResultFilter)} disabled={!player}>
                <option value="wins">Wins only</option><option value="winsDraws">Wins + draws</option><option value="all">All games</option>
              </select></div>
          </div>
          <div className="space-y-1"><div className="text-[11px] text-muted-foreground flex justify-between"><span>Book depth</span><b>{maxPly} plies ({Math.ceil(maxPly / 2)} moves)</b></div>
            <input type="range" min={4} max={40} value={maxPly} onChange={(e) => setMaxPly(+e.target.value)} className="w-full" /></div>
          <div className="space-y-1"><div className="text-[11px] text-muted-foreground flex justify-between"><span>Min. times played</span><b>{minCount}</b></div>
            <input type="range" min={1} max={5} value={minCount} onChange={(e) => setMinCount(+e.target.value)} className="w-full" /></div>
          {!player && <p className="text-[10px] text-muted-foreground">Pick a player to use the result filter and get Style DNA.</p>}
          <Button className="w-full" onClick={run} disabled={busy}>{busy ? "Working…" : "Analyze & compile book"}</Button>
        </>)}
        {lab && (
          <div className="grid grid-cols-2 gap-2 text-center text-[11px]">
            {[["Games used", lab.used], ["Skipped", lab.skipped], ["Positions", lab.positions], ["Book moves", lab.entries]].map(([l, v]) => (
              <div key={l as string} className="rounded-md bg-muted/50 p-2"><div className="text-base font-bold">{v}</div><div className="text-muted-foreground">{l}</div></div>
            ))}
          </div>
        )}
      </section>

      {/* 2. Tree */}
      <section className="rounded-xl border border-border bg-card p-4 space-y-3">
        <h3 className="text-sm font-bold flex items-center gap-2"><BookOpen className="w-4 h-4 text-warning" /> 2. Opening tree</h3>
        {!lab ? <p className="text-xs text-muted-foreground">Import a PGN and compile to explore what the player plays.</p> : (
          <div className="grid gap-4 md:grid-cols-[320px_1fr]">
            <div className="space-y-2">
              <MiniBoard fen={fen} />
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setPath((p) => p.slice(0, -1))} disabled={!path.length}><ChevronLeft className="w-3.5 h-3.5" /> Back</Button>
                <Button size="sm" variant="outline" onClick={() => setPath([])} disabled={!path.length}><RotateCcw className="w-3.5 h-3.5" /> Start</Button>
              </div>
              <div className="text-[11px] text-muted-foreground break-words">{path.length ? path.map((m, i) => (i % 2 === 0 ? `${i / 2 + 1}.${m}` : m)).join(" ") : "Starting position"}</div>
            </div>
            <div className="space-y-1.5">
              {moves.length === 0 && <p className="text-xs text-muted-foreground">No book moves for the player here (opponent's turn or out of book). Go back or play the opponent's reply from another line.</p>}
              {moves.map((m) => {
                const pct = Math.round((m.count / total) * 100);
                const win = Math.round((m.wins / m.count) * 100);
                return (
                  <button key={m.uci} onClick={() => setPath((p) => [...p, m.san])}
                    className="w-full text-left rounded-md border border-border hover:border-warning/60 p-2">
                    <div className="flex justify-between text-xs"><b>{m.san}</b><span className="text-muted-foreground">{m.count}× · {pct}% · win {win}%</span></div>
                    <div className="mt-1 h-1.5 rounded bg-muted overflow-hidden"><div className="h-full bg-warning" style={{ width: `${pct}%` }} /></div>
                  </button>
                );
              })}
              {lab && moves.length === 0 && path.length > 0 && <OpponentReplies lab={lab} path={path} onPick={(san) => setPath((p) => [...p, san])} />}
            </div>
          </div>
        )}
      </section>

      {/* 3. DNA & assignment */}
      <section className="rounded-xl border border-border bg-card p-4 space-y-3">
        <h3 className="text-sm font-bold flex items-center gap-2"><Dna className="w-4 h-4 text-warning" /> 3. Style DNA & assign</h3>
        {!lab ? <p className="text-xs text-muted-foreground">Recommendations appear after analysis.</p> : (<>
          {lab.dna.samples === 0 ? <p className="text-xs text-muted-foreground">Pick a player (or one color) to calculate Style DNA.</p> : (<>
            <div className="space-y-1">
              {lab.dna.facts.map((f) => <div key={f.label} className="flex justify-between text-[11px]"><span className="text-muted-foreground">{f.label}</span><b>{f.value}</b></div>)}
            </div>
            <div className="text-[11px] font-semibold pt-1">Move type weights</div>
            {Object.entries(lab.dna.style).map(([k, v]) => (
              <div key={k}><div className="flex justify-between text-[11px]"><span>{STYLE_LABELS[k]}</span><b>{v}</b></div>
                <div className="h-1.5 rounded bg-muted overflow-hidden"><div className="h-full bg-primary" style={{ width: `${v}%` }} /></div></div>
            ))}
            <div className="text-[11px] font-semibold pt-1">Expected moves</div>
            <div className="grid grid-cols-2 gap-1 text-[11px]">
              {Object.entries(lab.dna.expected).map(([k, v]) => <div key={k} className="flex justify-between rounded bg-muted/50 px-2 py-1"><span>{EXP_LABELS[k]}</span><b>{v}</b></div>)}
            </div>
            <div className="flex justify-between text-[11px] rounded bg-muted/50 px-2 py-1"><span>Engine style</span><b className="capitalize">{lab.dna.engineProfile}</b></div>
            <p className="text-[10px] text-muted-foreground">These are estimates from move statistics. Strength, mistakes and depth are not changed.</p>
          </>)}
          <div className="border-t border-border pt-3 space-y-2">
            <select className={sel} value={botId} onChange={(e) => setBotId(e.target.value)}>
              <option value="">Choose a bot…</option>
              {bots.map((b) => <option key={b.id} value={b.id}>{b.name} ({b.elo})</option>)}
            </select>
            {bot?.opening.bookName && <p className="text-[10px] text-muted-foreground">Current book: {bot.opening.bookName}{bot.opening.bookSize ? ` · ${fmtSize(bot.opening.bookSize)}` : ""}</p>}
            <Button className="w-full" onClick={assignBook} disabled={!bot || busy || !lab.entries}>Assign {bookName} ({fmtSize(lab.book.length)})</Button>
            <Button className="w-full" variant="secondary" onClick={applyDna} disabled={!bot || busy || lab.dna.samples === 0}>Apply Style DNA to bot</Button>
            <Button className="w-full" variant="outline" onClick={download} disabled={!lab.entries}><Download className="w-4 h-4" /> Download .bin</Button>
          </div>
        </>)}
      </section>
    </div>
  );
}

/** When it's the opponent's turn, list replies seen in the games so the tree can continue. */
function OpponentReplies({ lab, path, onPick }: { lab: LabResult; path: string[]; onPick: (san: string) => void }) {
  const replies = useMemo(() => {
    const c = new Chess(); for (const m of path) c.move(m);
    const out: string[] = [];
    for (const mv of c.moves({ verbose: true })) {
      const n = new Chess(c.fen()); n.move(mv.san);
      if (movesAt(lab.tree, n.fen()).length) out.push(mv.san);
    }
    return out;
  }, [lab, path]);
  if (!replies.length) return null;
  return (
    <div className="pt-2">
      <div className="text-[11px] text-muted-foreground mb-1">Opponent replies that continue the book:</div>
      <div className="flex flex-wrap gap-1">{replies.map((s) => <Button key={s} size="sm" variant="outline" onClick={() => onPick(s)}>{s}</Button>)}</div>
    </div>
  );
}
