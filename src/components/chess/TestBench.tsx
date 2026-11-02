import { useEffect, useRef, useState } from "react";
import { Chess } from "chess.js";
import { chooseBotMove, loadBots, subscribeBots, type BotConfig } from "@/lib/botStore";
import { engineBestMove } from "@/lib/stockfishEngine";
import { cn } from "@/lib/utils";

/** Stockfish 10 Skill Level anchors. Elo values are rough estimates, not measured. */
export const ANCHORS = [
  { skill: 0, depth: 1, elo: 1100 },
  { skill: 3, depth: 3, elo: 1350 },
  { skill: 6, depth: 5, elo: 1600 },
  { skill: 9, depth: 7, elo: 1850 },
  { skill: 12, depth: 9, elo: 2100 },
  { skill: 15, depth: 11, elo: 2350 },
  { skill: 18, depth: 13, elo: 2600 },
  { skill: 20, depth: 15, elo: 2850 },
];

/** Performance rating from score fraction vs an anchor (clamped to avoid infinities). */
export function performanceRating(anchorElo: number, score: number, games: number): number {
  if (games === 0) return anchorElo;
  const s = Math.min(0.98, Math.max(0.02, score / games));
  return Math.round(anchorElo - 400 * Math.log10(1 / s - 1));
}

type Result = { anchorElo: number; skill: number; w: number; l: number; d: number };

export function TestBench() {
  const [bots, setBots] = useState<BotConfig[]>(() => loadBots());
  useEffect(() => subscribeBots(() => setBots(loadBots())), []);
  const [botId, setBotId] = useState<string>("");
  const [anchorIdx, setAnchorIdx] = useState<number[]>([2, 4, 6]);
  const [games, setGames] = useState(10);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<Result[]>([]);
  const [live, setLive] = useState<{ fen: string; label: string; ply: number } | null>(null);
  const stopRef = useRef(false);
  const bot = bots.find((b) => b.id === botId) ?? null;

  async function playGame(b: BotConfig, a: (typeof ANCHORS)[number], botWhite: boolean, label: string) {
    const g = new Chess();
    while (!g.isGameOver() && g.history().length < 200 && !stopRef.current) {
      const botTurn = (g.turn() === "w") === botWhite;
      if (botTurn) {
        const r = await chooseBotMove(g, b);
        if (!r) break;
        g.move({ from: r.move.from, to: r.move.to, promotion: r.move.promotion });
      } else {
        const uci = await engineBestMove(g.fen(), a.skill, a.depth);
        if (!uci) break;
        try { g.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }); } catch { break; }
      }
      setLive({ fen: g.fen(), label, ply: g.history().length });
    }
    if (g.isCheckmate()) {
      const loserWhite = g.turn() === "w";
      return loserWhite === botWhite ? "l" : "w";
    }
    return "d";
  }

  async function run() {
    if (!bot) return;
    stopRef.current = false;
    setRunning(true);
    const list = anchorIdx.map((i) => ANCHORS[i]);
    const res: Result[] = list.map((a) => ({ anchorElo: a.elo, skill: a.skill, w: 0, l: 0, d: 0 }));
    setResults([...res]);
    for (let ai = 0; ai < list.length && !stopRef.current; ai++) {
      for (let n = 0; n < games && !stopRef.current; n++) {
        const label = `Game ${n + 1}/${games} vs Stockfish Level ${list[ai].skill} (~${list[ai].elo}) — bot plays ${n % 2 === 0 ? "White" : "Black"}`;
        const r = await playGame(bot, list[ai], n % 2 === 0, label);
        res[ai] = { ...res[ai], [r]: res[ai][r as "w" | "l" | "d"] + 1 };
        setResults([...res]);
      }
    }
    setRunning(false);
    setLive(null);
  }

  const totals = results.reduce(
    (acc, r) => {
      const n = r.w + r.l + r.d;
      if (n === 0) return acc;
      return { sum: acc.sum + performanceRating(r.anchorElo, r.w + r.d / 2, n) * n, n: acc.n + n };
    },
    { sum: 0, n: 0 },
  );
  const calibrated = totals.n ? Math.round(totals.sum / totals.n) : null;

  return (
    <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
      <div className="rounded-lg border border-border bg-card p-4 space-y-4">
        <div className="text-sm font-bold">Test Bench</div>
        <label className="block text-xs space-y-1">
          <span className="text-muted-foreground">Bot to test</span>
          <select value={botId} onChange={(e) => setBotId(e.target.value)} disabled={running}
            className="w-full h-9 rounded-md bg-background border border-border px-2 text-sm">
            <option value="">Choose a bot…</option>
            {bots.map((b) => <option key={b.id} value={b.id}>{b.name} ({b.elo})</option>)}
          </select>
        </label>
        <div className="text-xs space-y-1">
          <div className="text-muted-foreground">Stockfish opponents (Skill Level · approx. Elo)</div>
          <div className="grid grid-cols-2 gap-1">
            {ANCHORS.map((a, i) => {
              const on = anchorIdx.includes(i);
              return (
                <button key={i} disabled={running}
                  onClick={() => setAnchorIdx((s) => on ? s.filter((x) => x !== i) : [...s, i].sort((x, y) => x - y))}
                  className={cn("h-8 rounded-md text-xs border", on ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground")}>
                  Level {a.skill} · ~{a.elo}
                </button>
              );
            })}
          </div>
        </div>
        <label className="block text-xs space-y-1">
          <span className="text-muted-foreground">Games per opponent (colors alternate)</span>
          <select value={games} onChange={(e) => setGames(Number(e.target.value))} disabled={running}
            className="w-full h-9 rounded-md bg-background border border-border px-2 text-sm">
            {[2, 10, 20, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        {running ? (
          <button onClick={() => { stopRef.current = true; }} className="w-full h-10 rounded-md bg-destructive text-destructive-foreground font-semibold text-sm">Stop</button>
        ) : (
          <button onClick={run} disabled={!bot || anchorIdx.length === 0} className="w-full h-10 rounded-md bg-primary text-primary-foreground font-semibold text-sm disabled:opacity-50">Run test</button>
        )}
        <p className="text-[11px] text-muted-foreground">
          Opponents are Stockfish 10 at fixed Skill Levels. Their Elo numbers are rough estimates, so treat the result as a guide, not an official rating. Games over 200 moves count as draws.
        </p>
      </div>

      <div className="space-y-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">Now playing</div>
          <div className="text-sm font-semibold mt-1">{live ? live.label : running ? "Starting…" : "Idle"}</div>
          {live && <div className="text-xs text-muted-foreground mt-1">Half-move {live.ply}</div>}
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground text-left">
              <tr><th className="py-1">Opponent</th><th>W</th><th>L</th><th>D</th><th>Score</th><th>Performance</th></tr>
            </thead>
            <tbody>
              {results.map((r) => {
                const n = r.w + r.l + r.d;
                return (
                  <tr key={r.skill} className="border-t border-border">
                    <td className="py-1.5">Stockfish Level {r.skill} (~{r.anchorElo})</td>
                    <td>{r.w}</td><td>{r.l}</td><td>{r.d}</td>
                    <td>{n ? `${Math.round(((r.w + r.d / 2) / n) * 100)}%` : "—"}</td>
                    <td>{n ? performanceRating(r.anchorElo, r.w + r.d / 2, n) : "—"}</td>
                  </tr>
                );
              })}
              {results.length === 0 && <tr><td colSpan={6} className="py-4 text-center text-muted-foreground text-xs">No results yet</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="rounded-lg border border-border bg-card p-4 flex items-center justify-between">
          <div>
            <div className="text-xs text-muted-foreground">Estimated real strength</div>
            <div className="text-3xl font-black">{calibrated ?? "—"}</div>
          </div>
          {bot && <div className="text-right text-xs text-muted-foreground">Shown rating<div className="text-xl font-bold text-foreground">{bot.elo}</div></div>}
        </div>
      </div>
    </div>
  );
}
