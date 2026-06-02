import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Trash2, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/useAuth";
import {
  loadBots,
  subscribeBots,
  getActiveBotId,
  setActiveBotId,
  deleteBot,
  BOT_CATEGORIES,
  type BotConfig,
  type BotCategory,
} from "@/lib/botStore";

type Section = { key: string; label: string; filter: (b: BotConfig) => boolean };

const SECTIONS: Section[] = [
  ...BOT_CATEGORIES.filter((c) => c.value !== "Intermediate" || true).map<Section>((c) => ({
    key: c.value,
    label: c.label,
    filter: (b) => b.category === (c.value as BotCategory) && !b.createdBy,
  })),
  // Creator Bots = any bot with a creator
  { key: "Creator", label: "Creator Bots", filter: (b) => !!b.createdBy },
];

// Re-order so Creator Bots sits between SpecialEvent and TopPlayer
const ORDER = ["Beginner", "Intermediate", "Advanced", "SpecialEvent", "Creator", "TopPlayer", "Master"];
SECTIONS.sort((a, b) => ORDER.indexOf(a.key) - ORDER.indexOf(b.key));

export function BotRoster({ onSelect }: { onSelect?: (bot: BotConfig) => void }) {
  const { isOwner } = useAuth();
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

  return (
    <Card className="bg-card p-3">
      <div className="text-sm font-semibold mb-2 px-1">Bot Library</div>
      {bots.length === 0 ? (
        <div className="text-xs text-muted-foreground px-2 py-4">
          No bots yet. Use the Owner Control Portal to forge one.
        </div>
      ) : (
        <Accordion type="multiple" className="w-full">
          {SECTIONS.map((section) => {
            const list = bots.filter(section.filter);
            return (
              <AccordionItem key={section.key} value={section.key} className="border-border/60">
                <AccordionTrigger className="text-xs font-semibold py-2.5 hover:no-underline">
                  <span className="flex items-center gap-2">
                    {section.label}
                    <span className="text-[10px] font-normal text-muted-foreground">({list.length})</span>
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  {list.length === 0 ? (
                    <div className="text-[11px] text-muted-foreground px-2 py-2">No bots in this category.</div>
                  ) : (
                    <div className="space-y-1.5 pt-1">
                      {list.map((b) => (
                        <div
                          key={b.id}
                          className={cn(
                            "group flex items-center gap-2 rounded-md p-1.5 cursor-pointer transition-colors",
                            activeId === b.id
                              ? "bg-primary/15 ring-1 ring-primary/40"
                              : "hover:bg-secondary/50",
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
                          {b.createdBy && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="opacity-0 group-hover:opacity-100 h-7 w-7"
                              onClick={(e) => { e.stopPropagation(); deleteBot(b.id); }}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      )}
    </Card>
  );
}
