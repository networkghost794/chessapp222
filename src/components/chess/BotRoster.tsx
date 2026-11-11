import { useEffect, useMemo, useState } from "react";
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
import { botDisplayIdentity, useImmersive } from "@/lib/immersive";
import { useUiSettings } from "@/lib/appSettings";
import { TitleBadge } from "./ChessApp";
import {
  loadBots,
  subscribeBots,
  getActiveBotId,
  setActiveBotId,
  deleteBot,
  reorderCategory,
  updateBotPlacement,
  getTitleColor,
  loadTitleColors,
  subscribeTitleColors,
  refreshTitleColors,
  BOT_CATEGORIES,
  type BotConfig,
  type BotCategory,
} from "@/lib/botStore";

export function BotRoster({ onSelect }: { onSelect?: (bot: BotConfig) => void }) {
  const [immersive] = useImmersive();
  const { isOwner, user } = useAuth();
  const [bots, setBots] = useState<BotConfig[]>([]);
  const [activeId, setActive] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [dragOverCat, setDragOverCat] = useState<BotCategory | null>(null);

  const [, setColorTick] = useState(0);
  const ui = useUiSettings();
  const allSections = useMemo(() => {
    const list: { value: string; label: string }[] = [...BOT_CATEGORIES];
    const existing = new Set(list.map((c) => c.value));
    for (const ct of ui.customTiers ?? []) {
      if (!existing.has(ct.id)) {
        list.push({ value: ct.id, label: ct.name });
        existing.add(ct.id);
      }
    }
    for (const b of bots) {
      if (b.category && !existing.has(b.category)) {
        list.push({ value: b.category, label: b.category });
        existing.add(b.category);
      }
    }
    return list;
  }, [ui.customTiers, bots]);

  useEffect(() => {
    const refresh = () => {
      setBots(loadBots());
      setActive(getActiveBotId());
    };
    refresh();
    refreshTitleColors();
    const unsubBots = subscribeBots(refresh);
    const unsubColors = subscribeTitleColors(() => setColorTick((t) => t + 1));
    return () => {
      unsubBots();
      unsubColors();
    };
  }, []);
  void loadTitleColors;

  const handleDropOnBot = async (target: BotConfig) => {
    if (!isOwner || !dragId || dragId === target.id) {
      setDragId(null);
      setDragOverId(null);
      setDragOverCat(null);
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
    await reorderCategory(
      target.category,
      newOrder.map((b) => b.id),
    );
    setDragId(null);
    setDragOverId(null);
    setDragOverCat(null);
  };

  const handleDropOnCategory = async (cat: BotCategory) => {
    if (!isOwner || !dragId) {
      setDragOverCat(null);
      return;
    }
    const source = bots.find((b) => b.id === dragId);
    if (!source || source.category === cat) {
      setDragOverCat(null);
      setDragId(null);
      return;
    }
    const targetCount = bots.filter((b) => b.category === cat).length;
    await updateBotPlacement(source.id, cat, targetCount);
    setDragId(null);
    setDragOverId(null);
    setDragOverCat(null);
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
          {allSections.map((section) => {
            if (section.value === "Personal") {
              const hasAccess =
                user &&
                (isOwner || bots.some((b) => b.category === "Personal" && b.createdBy === user.id));
              if (!hasAccess) return null;
            }

            const list = bots
              .filter((b) => {
                if (b.category !== section.value) return false;
                if (section.value === "Personal") {
                  return isOwner || b.createdBy === user?.id;
                }
                return true;
              })
              .sort((a, b) => a.orderIndex - b.orderIndex);
            return (
              <AccordionItem key={section.value} value={section.value} className="border-border/60">
                <AccordionTrigger
                  className={cn(
                    "text-xs font-semibold py-2.5 hover:no-underline",
                    dragOverCat === section.value && "bg-primary/10 rounded-md",
                  )}
                  onDragOver={(e) => {
                    if (isOwner && dragId) {
                      e.preventDefault();
                      setDragOverCat(section.value);
                    }
                  }}
                  onDragLeave={() => setDragOverCat((c) => (c === section.value ? null : c))}
                  onDrop={(e) => {
                    e.preventDefault();
                    handleDropOnCategory(section.value);
                  }}
                >
                  <span className="flex items-center gap-2">
                    {section.label}
                    <span className="text-[10px] font-normal text-muted-foreground">
                      ({list.length})
                    </span>
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  {list.length === 0 ? (
                    <div
                      className={cn(
                        "text-[11px] text-muted-foreground px-2 py-3 rounded-md",
                        dragOverCat === section.value && "bg-primary/10 ring-1 ring-primary/30",
                      )}
                      onDragOver={(e) => {
                        if (isOwner && dragId) {
                          e.preventDefault();
                          setDragOverCat(section.value);
                        }
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        handleDropOnCategory(section.value);
                      }}
                    >
                      No bots in this category.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 pt-1">
                      {list.map((b) => (
                        <div
                          key={b.id}
                          draggable={isOwner}
                          onDragStart={() => isOwner && setDragId(b.id)}
                          onDragEnd={() => {
                            setDragId(null);
                            setDragOverId(null);
                            setDragOverCat(null);
                          }}
                          onDragOver={(e) => {
                            if (isOwner && dragId) {
                              e.preventDefault();
                              setDragOverId(b.id);
                            }
                          }}
                          onDragLeave={() => setDragOverId((id) => (id === b.id ? null : id))}
                          onDrop={(e) => {
                            e.preventDefault();
                            handleDropOnBot(b);
                          }}
                          className={cn(
                            "group relative flex flex-col items-center text-center gap-2 rounded-lg p-3 cursor-pointer transition-colors border border-transparent min-w-0",
                            activeId === b.id
                              ? "bg-primary/15 border-primary/40"
                              : "bg-secondary/30 hover:bg-secondary/60",
                            dragId === b.id && "opacity-50",
                            dragOverId === b.id &&
                              dragId &&
                              dragId !== b.id &&
                              "ring-1 ring-primary",
                          )}
                          onClick={() => {
                            setActiveBotId(b.id);
                            onSelect?.(b);
                          }}
                        >
                          {isOwner && (
                            <GripVertical className="w-3.5 h-3.5 text-muted-foreground/60 absolute top-1 left-1 cursor-grab" />
                          )}
                          <div className="w-12 h-12 rounded-md bg-secondary grid place-items-center overflow-hidden shrink-0 ring-1 ring-border">
                            {b.avatar ? (
                              <img
                                src={b.avatar}
                                alt={b.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <User className="w-5 h-5 text-muted-foreground" />
                            )}
                          </div>
                          <div className="w-full min-w-0">
                            <div className="text-xs font-semibold truncate inline-flex items-center gap-1 max-w-full">
                              {b.title && !immersive && (
                                <TitleBadge title={b.title} color={b.titleColor} size="sm" />
                              )}
                              <span className="truncate">
                                {botDisplayIdentity(b, immersive).name}
                              </span>
                            </div>
                            <div className="text-[10px] text-muted-foreground">ELO {b.elo}</div>
                          </div>
                          {isOwner && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="opacity-0 group-hover:opacity-100 h-6 w-6 absolute top-1 right-1"
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteBot(b.id);
                              }}
                            >
                              <Trash2 className="w-3 h-3" />
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
