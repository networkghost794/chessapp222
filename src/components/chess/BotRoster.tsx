import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Trash2, User } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  loadBots,
  subscribeBots,
  getActiveBotId,
  setActiveBotId,
  deleteBot,
  type BotConfig,
} from "@/lib/botStore";

export function BotRoster({ onSelect }: { onSelect?: (bot: BotConfig) => void }) {
  const [bots, setBots] = useState<BotConfig[]>([]);
  const [activeId, setActive] = useState<string | null>(null);

  useEffect(() => {
    const refresh = () => {
      setBots(loadBots());
      setActive(getActiveBotId());
    };
    refresh();
    return subscribeBots(refresh);
  }, []);

  const tiers: Array<"Intermediate" | "Master"> = ["Master", "Intermediate"];

  return (
    <Card className="bg-card p-3">
      <div className="text-sm font-semibold mb-2 px-1">Bot Roster</div>
      {bots.length === 0 ? (
        <div className="text-xs text-muted-foreground px-2 py-4">
          No custom bots yet. Use the Owner Control Portal to forge one.
        </div>
      ) : (
        <div className="space-y-3">
          {tiers.map((tier) => {
            const list = bots.filter((b) => b.category === tier);
            if (list.length === 0) return null;
            return (
              <div key={tier}>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground px-1 mb-1">
                  {tier}
                </div>
                <div className="space-y-1.5">
                  {list.map((b) => (
                    <div
                      key={b.id}
                      className={cn(
                        "group flex items-center gap-2 rounded-md p-1.5 cursor-pointer transition-colors",
                        activeId === b.id ? "bg-primary/15 ring-1 ring-primary/40" : "hover:bg-secondary/50",
                      )}
                      onClick={() => { setActiveBotId(b.id); onSelect?.(b); }}
                    >
                      <div className="w-9 h-9 rounded-full bg-secondary grid place-items-center overflow-hidden shrink-0">
                        {b.avatar ? (
                          <img src={b.avatar} alt={b.name} className="w-full h-full object-cover" />
                        ) : (
                          <User className="w-4 h-4 text-muted-foreground" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{b.name}</div>
                        <div className="text-[11px] text-muted-foreground">ELO {b.elo}</div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="opacity-0 group-hover:opacity-100 h-7 w-7"
                        onClick={(e) => { e.stopPropagation(); deleteBot(b.id); }}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
