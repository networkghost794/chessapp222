import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Trash2, User, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/useAuth";
import {
  loadBots,
  subscribeBots,
  getActiveBotId,
  setActiveBotId,
  deleteBot,
  reorderCategory,
  updateBotPlacement,
  BOT_CATEGORIES,
  type BotConfig,
  type BotCategory,
} from "@/lib/botStore";

export function BotRoster({ onSelect }: { onSelect?: (bot: BotConfig) => void }) {
  const { isOwner } = useAuth();
  const [bots, setBots] = useState<BotConfig[]>([]);
  const [activeId, setActive] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [dragOverCat, setDragOverCat] = useState<BotCategory | null>(null);

  useEffect(() => {
    const refresh = () => {
      setBots(loadBots());
      setActive(getActiveBotId());
    };
    refresh();
    return subscribeBots(refresh);
  }, []);

  const handleDropOnBot = async (target: BotConfig) => {
    if (!isOwner || !dragId || dragId === target.id) {
      setDragId(null); setDragOverId(null); setDragOverCat(null);
      return;
    }
    const source = bots.find((b) => b.id === dragId);
    if (!source) return;
    // Reorder within target's category (also moves cross-category).
    const targetList = bots
      .filter((b) => b.category === target.category && b.id !== source.id)
      .sort((a, b) => a.orderIndex - b.orderIndex);
    const targetIdx = targetList.findIndex((b) => b.id === target.id);
    const insertAt = targetIdx < 0 ? targetList.length : targetIdx;
    const newOrder = [...targetList.slice(0, insertAt), source, ...targetList.slice(insertAt)];
    await reorderCategory(target.category, newOrder.map((b) => b.id));
    setDragId(null); setDragOverId(null); setDragOverCat(null);
  };

  const handleDropOnCategory = async (cat: BotCategory) => {
    if (!isOwner || !dragId) { setDragOverCat(null); return; }
    const source = bots.find((b) => b.id === dragId);
    if (!source || source.category === cat) { setDragOverCat(null); setDragId(null); return; }
    const targetCount = bots.filter((b) => b.category === cat).length;
    await updateBotPlacement(source.id, cat, targetCount);
    setDragId(null); setDragOverId(null); setDragOverCat(null);
  };

  return (
    <Card className="bg-card p-3">
      <div className="text-sm font-semibold mb-2 px-1">Bot Library</div>
      {bots.length === 0 ? (
        <div className="text-xs text-muted-foreground px-2 py-4">
          No bots yet. Use the Owner Control Portal to forge one.
        </div>
      ) : (
        <Accordion type="multiple" className="w-full">
          {BOT_CATEGORIES.map((section) => {
            const list = bots
              .filter((b) => b.category === section.value)
              .sort((a, b) => a.orderIndex - b.orderIndex);
            return (
              <AccordionItem key={section.value} value={section.value} className="border-border/60">
                <AccordionTrigger
                  className={cn(
                    "text-xs font-semibold py-2.5 hover:no-underline",
                    dragOverCat === section.value && "bg-primary/10 rounded-md",
                  )}
                  onDragOver={(e) => { if (isOwner && dragId) { e.preventDefault(); setDragOverCat(section.value); } }}
                  onDragLeave={() => setDragOverCat((c) => (c === section.value ? null : c))}
                  onDrop={(e) => { e.preventDefault(); handleDropOnCategory(section.value); }}
                >
                  <span className="flex items-center gap-2">
                    {section.label}
                    <span className="text-[10px] font-normal text-muted-foreground">({list.length})</span>
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  {list.length === 0 ? (
                    <div
                      className={cn(
                        "text-[11px] text-muted-foreground px-2 py-3 rounded-md",
                        dragOverCat === section.value && "bg-primary/10 ring-1 ring-primary/30",
                      )}
                      onDragOver={(e) => { if (isOwner && dragId) { e.preventDefault(); setDragOverCat(section.value); } }}
                      onDrop={(e) => { e.preventDefault(); handleDropOnCategory(section.value); }}
                    >
                      No bots in this category.
                    </div>
                  ) : (
                    <div className="space-y-1.5 pt-1">
                      {list.map((b) => (
                        <div
                          key={b.id}
                          draggable={isOwner}
                          onDragStart={() => isOwner && setDragId(b.id)}
                          onDragEnd={() => { setDragId(null); setDragOverId(null); setDragOverCat(null); }}
                          onDragOver={(e) => { if (isOwner && dragId) { e.preventDefault(); setDragOverId(b.id); } }}
                          onDragLeave={() => setDragOverId((id) => (id === b.id ? null : id))}
                          onDrop={(e) => { e.preventDefault(); handleDropOnBot(b); }}
                          className={cn(
                            "group flex items-center gap-2 rounded-md p-1.5 cursor-pointer transition-colors",
                            activeId === b.id
                              ? "bg-primary/15 ring-1 ring-primary/40"
                              : "hover:bg-secondary/50",
                            dragId === b.id && "opacity-50",
                            dragOverId === b.id && dragId && dragId !== b.id && "ring-1 ring-primary",
                          )}
                          onClick={() => { setActiveBotId(b.id); onSelect?.(b); }}
                        >
                          {isOwner && (
                            <GripVertical className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0 cursor-grab" />
                          )}
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
                          {isOwner && (
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
