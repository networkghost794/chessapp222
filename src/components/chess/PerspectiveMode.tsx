import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { ArrowLeft, Check, Eye, Play, RotateCcw, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { BOT_CATEGORIES, loadBots, subscribeBots, type BotConfig } from "@/lib/botStore";
import { PERSPECTIVE_RATINGS, titleForRating } from "@/lib/perspectiveEval";
import { HumanVsBotMatch, type PlayerProfileLite } from "./HumanVsBotMatch";
import type { MatchResult } from "./BotVsBotMode";
import { TitleBadge } from "./ChessApp";
import { useAuth } from "@/lib/useAuth";
import type { Color } from "chess.js";

/**
 * "Play Through Their Eyes" — a standalone game mode.
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
            <Eye className="w-4 h-4 text-primary" /> Play Through Their Eyes
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setResult(null); setMatchKey((k) => k + 1); }}
            >
              <RotateCcw className="w-4 h-4 mr-1.5" /> Restart
            </Button>
            <Button variant="ghost" size="sm" onClick={() => { setStage("setup"); setResult(null); }}>
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

  return (
    <div className="max-w-[1100px] mx-auto space-y-6">
      <div className="flex items-center justify-between gap-3">
        <header className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-md bg-primary/15 grid place-items-center ring-1 ring-primary/30">
            <Eye className="w-5 h-5 text-primary" />
          </div>
          <div>
            <div className="text-xl font-bold leading-tight">Play Through Their Eyes</div>
            <div className="text-xs text-muted-foreground">
              Experience chess from the perspective of different playing strengths — you still make every move.
            </div>
          </div>
        </header>
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-1.5" /> Back
        </Button>
      </div>

      <Card className="bg-card p-4 space-y-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Step 1 — Perspective rating
        </div>
        <div className="flex flex-wrap gap-2">
          {PERSPECTIVE_RATINGS.map((r) => (
            <button
              key={r}
              onClick={() => setRating(r)}
              className={cn(
                "px-3 py-1.5 rounded-md text-sm font-semibold border transition-colors",
                rating === r
                  ? "bg-primary/15 border-primary/40 text-foreground"
                  : "bg-secondary/30 border-transparent hover:bg-secondary/60 text-muted-foreground",
              )}
            >
              {r}
            </button>
          ))}
        </div>
        <div className="text-[11px] text-muted-foreground">
          Your identity this match:{" "}
          <span className="inline-flex items-center gap-1.5 align-middle">
            <TitleBadge title={titleForRating(rating)} color={null} size="sm" />
            <span className="font-semibold text-foreground">{player.name}</span>
            <span>({rating})</span>
          </span>
        </div>
      </Card>

      <Card className="bg-card p-4 space-y-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Step 2 — Your side
        </div>
        <div className="flex gap-2">
          {(["w", "b"] as Color[]).map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className={cn(
                "px-4 py-1.5 rounded-md text-sm font-semibold border transition-colors",
                color === c
                  ? "bg-primary/15 border-primary/40"
                  : "bg-secondary/30 border-transparent hover:bg-secondary/60 text-muted-foreground",
              )}
            >
              {c === "w" ? "White" : "Black"}
            </button>
          ))}
        </div>
      </Card>

      <div className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-1">
          Step 3 — Choose your opponent
        </div>
        <SingleBotPicker bots={bots} selectedId={botId} onPick={setBotId} />
      </div>

      <Button
        className="w-full font-bold"
        disabled={!bot}
        onClick={() => { setResult(null); setMatchKey((k) => k + 1); setStage("match"); }}
      >
        <Play className="w-4 h-4 mr-1.5" /> Start Game
      </Button>
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
  return (
    <Card className="bg-card p-3">
      <Accordion type="multiple" className="w-full">
        {BOT_CATEGORIES.map((section) => {
          const list = bots
            .filter((b) => b.category === section.value)
            .sort((a, b) => a.orderIndex - b.orderIndex);
          return (
            <AccordionItem key={section.value} value={section.value} className="border-border/60">
              <AccordionTrigger className="text-xs font-semibold py-2.5 hover:no-underline">
                <span className="flex items-center gap-2">
                  {section.label}
                  <span className="text-[10px] font-normal text-muted-foreground">({list.length})</span>
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
                              <img src={b.avatar} alt={b.name} className="w-full h-full object-cover" />
                            ) : (
                              <User className="w-4 h-4 text-muted-foreground" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-semibold truncate inline-flex items-center gap-1 max-w-full">
                              {b.title && <TitleBadge title={b.title} color={b.titleColor} size="sm" />}
                              <span className="truncate">{b.name}</span>
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
    </Card>
  );
}
