import { useEffect, useState } from "react";
import { Crown, Play, User, Bot as BotIcon, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/useAuth";
import { cn } from "@/lib/utils";
import { botDisplayIdentity, useImmersive } from "@/lib/immersive";
import {
  loadBots, subscribeBots, getActiveBotId, setActiveBotId, deleteBot,
  BOT_CATEGORIES, type BotConfig, type BotCategory,
} from "@/lib/botStore";

export type SideChoice = "white" | "black" | "random";

/** Chess.com-style bot picker: showcase portrait, tier accordions, 5-col grid, win crowns. */
export function PlayBotsPanel({
  colorChoice, setColorChoice, onPlay,
}: { colorChoice: SideChoice; setColorChoice: (c: SideChoice) => void; onPlay: () => void }) {
  const { user, isOwner } = useAuth();
  const [immersive] = useImmersive();
  const [bots, setBots] = useState<BotConfig[]>([]);
  const [activeId, setActive] = useState<string | null>(null);
  const [open, setOpen] = useState<BotCategory | null>(null);
  const [beaten, setBeaten] = useState<Set<string>>(new Set());

  useEffect(() => {
    const refresh = () => { setBots(loadBots()); setActive(getActiveBotId()); };
    refresh();
    return subscribeBots(refresh);
  }, []);

  useEffect(() => {
    if (!user) return;
    supabase.from("bot_stats").select("bot_id,wins").eq("user_id", user.id).gt("wins", 0)
      .then(({ data }) => setBeaten(new Set((data ?? []).map((r) => String(r.bot_id)))));
  }, [user]);

  const active = bots.find((b) => b.id === activeId) ?? null;

  // Open the tier of the selected bot (or the first non-empty tier) on load.
  useEffect(() => {
    if (open || bots.length === 0) return;
    setOpen(active?.category ?? bots[0].category);
  }, [bots, active, open]);

  const pick = (b: BotConfig) => { setActiveBotId(b.id); setActive(b.id); };
  const ident = active ? botDisplayIdentity(active, immersive) : null;

  return (
    <div className="flex flex-col rounded-lg bg-card border border-border/60 overflow-hidden h-full max-h-[calc(100vh-3rem)]">
      <div className="flex items-center justify-center gap-2 py-3 border-b border-border/60 bg-secondary/30">
        <BotIcon className="w-5 h-5 text-primary" />
        <span className="font-extrabold">Play Bots</span>
      </div>

      {/* Showcase — no box, character floats on the panel */}
      <div className="px-5 pt-4 pb-3">
        {active ? (
          <>
            <div className="h-28 w-28">
              {active.avatar
                ? <img src={active.avatar} alt={active.name} className="h-full w-full object-contain drop-shadow-[0_6px_10px_rgba(0,0,0,0.35)]" />
                : <User className="h-full w-full text-muted-foreground/60" />}
            </div>
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <span className="font-bold text-lg">{ident?.name}</span>
              <span className="text-muted-foreground">{active.elo}</span>
              {active.country && !immersive && <span className="text-lg leading-none">{active.country}</span>}
              {beaten.has(active.id) && <Crown className="w-4 h-4 text-[color:var(--sim-ok)] fill-current" />}
            </div>
            {active.quote && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">“{active.quote}”</p>}
          </>
        ) : (
          <div className="text-sm text-muted-foreground py-8 text-center">Pick a bot below to challenge.</div>
        )}
      </div>

      {/* Tiers */}
      <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-2">
        {BOT_CATEGORIES.map((section) => {
          const list = bots.filter((b) => b.category === section.value).sort((a, b) => a.orderIndex - b.orderIndex);
          const isOpen = open === section.value;
          const cover = list[0]?.avatar;
          return (
            <div key={section.value} className="rounded-md bg-secondary/40">
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : section.value)}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-left"
              >
                {!isOpen && (
                  <span className="h-9 w-9 shrink-0">
                    {cover ? <img src={cover} alt="" className="h-full w-full object-contain" /> : null}
                  </span>
                )}
                <span className="font-bold flex-1">{section.label}</span>
                <span className="text-xs text-muted-foreground">{list.length} bots</span>
              </button>
              {isOpen && (
                <div className="grid grid-cols-5 gap-2 px-3 pb-3">
                  {list.length === 0 && <div className="col-span-5 text-xs text-muted-foreground py-2">No bots yet.</div>}
                  {list.map((b) => {
                    const sel = b.id === activeId;
                    return (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => pick(b)}
                        onDoubleClick={() => { pick(b); onPlay(); }}
                        title={`${botDisplayIdentity(b, immersive).name} (${b.elo})`}
                        className={cn(
                          "group relative aspect-square rounded-md bg-background/40 overflow-hidden ring-2 transition",
                          sel ? "ring-success" : "ring-transparent hover:ring-border",
                        )}
                      >
                        {b.avatar
                          ? <img src={b.avatar} alt={b.name} className="h-full w-full object-cover" />
                          : <User className="w-1/2 h-1/2 m-auto mt-[25%] text-muted-foreground" />}
                        {beaten.has(b.id) && (
                          <Crown className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-4 h-4 text-[color:var(--sim-ok)] fill-current drop-shadow" />
                        )}
                        {isOwner && (
                          <span
                            role="button"
                            onClick={(e) => { e.stopPropagation(); if (confirm(`Delete ${b.name}?`)) deleteBot(b.id); }}
                            className="absolute top-0.5 right-0.5 hidden group-hover:grid place-items-center h-5 w-5 rounded bg-background/80"
                          >
                            <Trash2 className="w-3 h-3" />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Launch bar */}
      <div className="border-t border-border/60 p-3 space-y-2 bg-secondary/20">
        <div className="grid grid-cols-3 gap-1.5">
          {([
            { v: "white" as const, label: "White" },
            { v: "random" as const, label: "Random" },
            { v: "black" as const, label: "Black" },
          ]).map((o) => (
            <button
              key={o.v}
              type="button"
              onClick={() => setColorChoice(o.v)}
              className={cn(
                "text-xs font-semibold py-2 rounded-md border transition-colors",
                colorChoice === o.v ? "bg-success/15 border-success text-success" : "bg-secondary/40 border-border/60 text-muted-foreground hover:bg-secondary",
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          disabled={!active}
          onClick={onPlay}
          className="w-full h-14 rounded-lg bg-success text-primary-foreground text-xl font-extrabold shadow-[0_4px_0_0_color-mix(in_oklab,var(--color-success)_60%,black)] hover:brightness-110 active:translate-y-0.5 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <Play className="w-5 h-5 fill-current" /> Play
        </button>
      </div>
    </div>
  );
}
