import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { ArrowLeft, Check, Gauge, Play, RotateCcw, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { BOT_CATEGORIES, loadBots, subscribeBots, type BotConfig } from "@/lib/botStore";
import { PERSPECTIVE_RATINGS, labelForRating, titleForRating } from "@/lib/perspectiveEval";
import { HumanVsBotMatch, type PlayerProfileLite } from "./HumanVsBotMatch";
import type { MatchResult } from "./BotVsBotMode";
import { TitleBadge } from "./ChessApp";
import { useAuth } from "@/lib/useAuth";
import { botDisplayIdentity, useImmersive } from "@/lib/immersive";
import type { Color } from "chess.js";

/**
 * Strength Simulator — a standalone game mode.
 * The player controls every move; a chosen rating perspective annotates
 * every legal destination square with a colored indicator.
 */
export function PerspectiveMode({ onBack }: { onBack: () => void }) {
  const { profile } = useAuth();
  const [bots, setBots] = useState<BotConfig[]>([]);
  useEffect(() => {
    setBots(loadBots());
    return subscribeBots(() => setBots(loadBots()));
  }, []);

  const [rating, setRating] = useState<number>(1400);
  const [botId, setBotId] = useState<string | null>(null);
  const [color, setColor] = useState<Color>("w");
  const [stage, setStage] = useState<"setup" | "match">("setup");
  const [matchKey, setMatchKey] = useState(0);
  const [result, setResult] = useState<MatchResult | null>(null);

  const bot = useMemo(() => bots.find((b) => b.id === botId) ?? null, [bots, botId]);

  const player: PlayerProfileLite = useMemo(
    () => ({
      name: profile?.username || "Player",
      avatar: profile?.avatar_url ?? null,
      elo: rating,
      title: titleForRating(rating),
      titleColor: null,
    }),
    [profile, rating],
  );

  if (stage === "match" && bot) {
    return (
      <div className="max-w-[1200px] mx-auto space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-semibold inline-flex items-center gap-2">
            <Gauge className="w-4 h-4 text-primary" /> Strength Simulator
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setResult(null);
                setMatchKey((k) => k + 1);
              }}
            >
              <RotateCcw className="w-4 h-4 mr-1.5" /> Restart
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setStage("setup");
                setResult(null);
              }}
            >
              <ArrowLeft className="w-4 h-4 mr-1.5" /> Exit
            </Button>
          </div>
        </div>

        <HumanVsBotMatch
          key={matchKey}
          bot={bot}
          player={player}
          playerColor={color}
          perspectiveRating={rating}
          onFinished={(r) => setResult(r)}
        />

        {result && (
          <Card className="bg-card p-4 text-sm font-semibold">
            {result.winner === "draw"
              ? `Draw — ${result.reason}`
              : `${result.winner === "white" ? "White" : "Black"} wins — ${result.reason}`}
          </Card>
        )}
      </div>
    );
  }

  const TIERS: { name: string; ratings: number[] }[] = [
    { name: "Club", ratings: [200, 400, 600, 800, 1000] },
    { name: "Intermediate", ratings: [1200, 1400, 1600] },
    { name: "Expert & Master", ratings: [1800, 2000, 2200] },
    { name: "Grandmaster", ratings: [2500, 2700, 2880] },
    { name: "Engine", ratings: [3500] },
  ];
  const known = new Set(TIERS.flatMap((t) => t.ratings));
  const extra = PERSPECTIVE_RATINGS.filter((r) => !known.has(r));
  if (extra.length) TIERS[1].ratings.push(...extra);
  const tierOf = TIERS.find((t) => t.ratings.includes(rating))?.name ?? "";

  const Section = ({ n, title, children }: { n: number; title: string; children: React.ReactNode }) => (
    <section className="rounded-xl border border-border/60 bg-card p-5 space-y-4">
      <div className="flex items-baseline gap-3">
        <span className="text-[10px] font-semibold tabular-nums text-muted-foreground">0{n}</span>
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
      </div>
      {children}
    </section>
  );

  return (
    <div className="max-w-[1100px] mx-auto space-y-5">
      <div className="flex items-start justify-between gap-3">
        <header className="space-y-1">
          <div className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">
            <Gauge className="w-3.5 h-3.5" /> Game Mode
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Strength Simulator</h1>
          <p className="text-sm text-muted-foreground max-w-xl">
            You make every move. The board quietly marks how a player of the chosen rating would judge each option.
          </p>
        </header>
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-1.5" /> Back
        </Button>
      </div>

      <Section n={1} title="Simulated rating">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {TIERS.map((t) => (
            <div key={t.name} className="space-y-2">
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{t.name}</div>
              <div className="flex flex-wrap gap-1.5">
                {t.ratings.map((r) => (
                  <button
                    key={r}
                    onClick={() => setRating(r)}
                    className={cn(
                      "min-w-[3.5rem] px-2.5 py-1.5 rounded-md text-xs font-semibold tabular-nums border transition-colors",
                      rating === r
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-secondary/40 border-border/50 text-muted-foreground hover:text-foreground hover:bg-secondary",
                    )}
                  >
                    {labelForRating(r)}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section n={2} title="Your side">
        <div className="grid grid-cols-2 gap-2 max-w-sm">
          {(["w", "b"] as Color[]).map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className={cn(
                "flex items-center gap-2.5 px-4 py-2.5 rounded-lg text-sm font-semibold border transition-colors",
                color === c
                  ? "border-primary bg-primary/10"
                  : "border-border/50 bg-secondary/30 text-muted-foreground hover:bg-secondary/60",
              )}
            >
              <span className={cn("w-3.5 h-3.5 rounded-full ring-1 ring-border", c === "w" ? "bg-board-light" : "bg-board-dark")} />
              {c === "w" ? "White" : "Black"}
            </button>
          ))}
        </div>
      </Section>

      <Section n={3} title="Opponent">
        <SingleBotPicker bots={bots} selectedId={botId} onPick={setBotId} />
      </Section>

      <div className="sticky bottom-3 flex flex-wrap items-center gap-4 rounded-xl border border-border/60 bg-card/95 backdrop-blur px-5 py-3">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs">
          <span><span className="text-muted-foreground">Rating </span><span className="font-semibold tabular-nums">{labelForRating(rating)}</span> <span className="text-muted-foreground">· {tierOf}</span></span>
          <span><span className="text-muted-foreground">Side </span><span className="font-semibold">{color === "w" ? "White" : "Black"}</span></span>
          <span className="inline-flex items-center gap-1.5">
            <span className="text-muted-foreground">Opponent </span>
            {bot ? (
              <>
                                <span className="font-semibold">{bot.name}</span>
                <span className="text-muted-foreground tabular-nums">({bot.elo})</span>
              </>
            ) : (
              <span className="text-muted-foreground italic">none selected</span>
            )}
          </span>
        </div>
        <Button
          className="ml-auto font-semibold"
          disabled={!bot}
          onClick={() => {
            setResult(null);
            setMatchKey((k) => k + 1);
            setStage("match");
          }}
        >
          <Play className="w-4 h-4 mr-1.5" /> Start Game
        </Button>
      </div>
    </div>
  );
}

function SingleBotPicker({
  bots,
  selectedId,
  onPick,
}: {
  bots: BotConfig[];
  selectedId: string | null;
  onPick: (id: string) => void;
}) {
  const [immersive] = useImmersive();
  return (
    <div>
      <Accordion type="multiple" defaultValue={BOT_CATEGORIES.map((c) => c.value)} className="w-full">
        {BOT_CATEGORIES.map((section) => {
          const list = bots
            .filter((b) => b.category === section.value)
            .sort((a, b) => a.orderIndex - b.orderIndex);
          return (
            <AccordionItem key={section.value} value={section.value} className="border-border/60">
              <AccordionTrigger className="text-xs font-semibold py-2.5 hover:no-underline">
                <span className="flex items-center gap-2">
                  {section.label}
                  <span className="text-[10px] font-normal text-muted-foreground">
                    ({list.length})
                  </span>
                </span>
              </AccordionTrigger>
              <AccordionContent>
                {list.length === 0 ? (
                  <div className="text-[11px] text-muted-foreground px-2 py-3">No bots here.</div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 pt-1">
                    {list.map((b) => {
                      const active = selectedId === b.id;
                      return (
                        <button
                          key={b.id}
                          onClick={() => onPick(b.id)}
                          className={cn(
                            "flex items-center gap-2 rounded-lg p-2 transition-colors border text-left min-w-0",
                            active
                              ? "bg-primary/15 border-primary/40"
                              : "bg-secondary/30 hover:bg-secondary/60 border-transparent",
                          )}
                        >
                          <div className="w-8 h-8 rounded-md bg-secondary grid place-items-center overflow-hidden ring-1 ring-border shrink-0">
                            {b.avatar ? (
                              <img
                                src={b.avatar}
                                alt={b.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <User className="w-4 h-4 text-muted-foreground" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-semibold truncate inline-flex items-center gap-1 max-w-full">
                              {b.title && !immersive && (
                                <TitleBadge title={b.title} color={b.titleColor} size="sm" />
                              )}
                              <span className="truncate">{botDisplayIdentity(b, immersive).name}</span>
                            </div>
                            <div className="text-[10px] text-muted-foreground">ELO {b.elo}</div>
                          </div>
                          {active && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}
