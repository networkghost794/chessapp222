import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, Lock, Rocket, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  publishBot,
  updateBot,
  loadBots,
  subscribeBots,
  defaultPhase,
  defaultErrorRules,
  defaultOpening,
  defaultEndgameTrigger,
  defaultMoveStyle,
  defaultExpectedMoves,
  defaultHumanMistake,
  defaultThinkingTime,
  DEFAULT_BUCKET_MAP,
  STRENGTH_LABELS,
  BOT_CATEGORIES,
  loadTitleColors,
  subscribeTitleColors,
  refreshTitleColors,
  setTitleColor as saveTitleColor,
  deleteTitleColor,
  getTitleColor,
  type PhaseConfig,
  type StrengthBucket,
  type MoveStyle,
  type ExpectedMoves,
  type ErrorRules,
  type OpeningConfig,
  type EndgameTrigger,
  type BucketMap,
  type BotCategory,
  type BotConfig,
  type HumanMistake,
  type ThinkingTime,
} from "@/lib/botStore";
import { bytesToBase64 } from "@/lib/polyglot";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/useAuth";
import { UpdateLogManager } from "./UpdateLogManager";
import { VerificationReviewPanel } from "./VerificationRequest";
import { Trash2 } from "lucide-react";


const STYLE_LABELS: Array<[keyof MoveStyle, string]> = [
  ["pawnAdvance", "Pawn advance %"],
  ["pieceDevelopment", "Piece development %"],
  ["capture", "Capture %"],
  ["check", "Check %"],
  ["kingSafety", "King safety %"],
  ["positional", "Positional improvement %"],
];

function StyleEditor({ value, onChange }: { value: MoveStyle; onChange: (v: MoveStyle) => void }) {
  return (
    <div className="space-y-4">
      {STYLE_LABELS.map(([key, label]) => (
        <div key={key}>
          <div className="flex items-center justify-between mb-1">
            <Label className="text-xs text-muted-foreground">{label}</Label>
            <span className="text-xs font-mono">{value[key]}</span>
          </div>
          <Slider
            min={0}
            max={100}
            step={1}
            value={[value[key]]}
            onValueChange={([v]) => onChange({ ...value, [key]: v })}
          />
        </div>
      ))}
    </div>
  );
}

const EXPECTED_LABELS: Array<[keyof ExpectedMoves, string]> = [
  ["keepBishopPair", "Keep the two bishops"],
  ["advance", "Advance"],
  ["check", "Make check"],
  ["capture", "Capture"],
];

function ExpectedEditor({ value, onChange }: { value: ExpectedMoves; onChange: (v: ExpectedMoves) => void }) {
  return (
    <div className="rounded-md border border-border/60 bg-background/30 p-3 space-y-2">
      <div className="text-xs font-semibold">In the expected moves</div>
      <p className="text-[10px] text-muted-foreground leading-relaxed">
        This section controls long-term move preferences and personality tendencies over multiple moves,
        similar to the Lucas Chess personality system. Higher values increase the likelihood of the bot
        preferring these move types strategically over time rather than only on the immediate next move.
      </p>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 pt-1">
        {EXPECTED_LABELS.map(([key, label]) => (
          <label key={key} className="flex items-center justify-between gap-2 text-xs">
            <span className="text-muted-foreground">{label}</span>
            <Input
              type="number"
              min={0}
              max={100}
              value={value[key]}
              onChange={(e) =>
                onChange({ ...value, [key]: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })
              }
              className="h-7 w-16 text-xs font-mono text-right px-1.5"
            />
          </label>
        ))}
      </div>
    </div>
  );
}

function PhaseEditor({ value, onChange }: { value: PhaseConfig; onChange: (v: PhaseConfig) => void }) {
  return (
    <div className="space-y-4">
      <div>
        <Label className="text-xs text-muted-foreground">Strength bucket</Label>
        <Select
          value={value.strength}
          onValueChange={(v) => onChange({ ...value, strength: v as StrengthBucket })}
        >
          <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
          <SelectContent>
            {STRENGTH_LABELS.map((s) => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="rounded-md border border-border/60 bg-background/30 p-3 space-y-3">
        <div className="text-xs font-semibold">In the next move</div>
        <StyleEditor value={value.style} onChange={(style) => onChange({ ...value, style })} />
      </div>
      <ExpectedEditor
        value={value.expected ?? defaultExpectedMoves()}
        onChange={(expected) => onChange({ ...value, expected })}
      />
    </div>
  );
}

export function OwnerPortal() {
  const { isOwner, refreshOwner } = useAuth();
  const unlocked = isOwner;
  const [open, setOpen] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState("");

  // forge state
  const [name, setName] = useState("");
  const [elo, setElo] = useState(1500);
  const [avatar, setAvatar] = useState<string | undefined>();
  const [quote, setQuote] = useState("");
  const [category, setCategory] = useState<BotCategory>("Intermediate");
  const [dialogueLinesText, setDialogueLinesText] = useState("");
  const [middlegame, setMiddlegame] = useState<PhaseConfig>(defaultPhase());
  const [endgame, setEndgame] = useState<PhaseConfig>(() => ({ ...defaultPhase(), style: defaultMoveStyle() }));
  const [errorRules, setErrorRules] = useState<ErrorRules>(defaultErrorRules());
  const [endgameTrigger, setEndgameTrigger] = useState<EndgameTrigger>(defaultEndgameTrigger());
  const [bucketMap, setBucketMap] = useState<BucketMap>({ ...DEFAULT_BUCKET_MAP });
  const [humanMistake, setHumanMistake] = useState<HumanMistake>(defaultHumanMistake());

  const [opening, setOpening] = useState<OpeningConfig>(defaultOpening());
  const [bookSize, setBookSize] = useState<number>(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const binRef = useRef<HTMLInputElement>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  // Title for this bot (string + optional per-bot color override)
  const [botTitle, setBotTitle] = useState<string>("");
  const [botTitleColor, setBotTitleColor] = useState<string>("");
  const [botCountry, setBotCountry] = useState<string>("");

  // Per-bot thinking delay (ms).
  const [thinking, setThinking] = useState<ThinkingTime>(defaultThinkingTime());

  // ---- Edit mode ----
  const [editingId, setEditingId] = useState<string | null>(null);
  const [allBots, setAllBots] = useState<BotConfig[]>(loadBots());
  useEffect(() => subscribeBots(() => setAllBots(loadBots())), []);

  const resetForm = () => {
    setName(""); setQuote(""); setAvatar(undefined); setAvatarFile(null);
    setElo(1500); setCategory("Intermediate");
    setDialogueLinesText("");
    setMiddlegame(defaultPhase());
    setEndgame({ ...defaultPhase(), style: defaultMoveStyle() });
    setOpening(defaultOpening()); setBookSize(0);
    setErrorRules(defaultErrorRules());
    setEndgameTrigger(defaultEndgameTrigger());
    setBucketMap({ ...DEFAULT_BUCKET_MAP });
    setHumanMistake(defaultHumanMistake());
    setBotTitle(""); setBotTitleColor(""); setBotCountry("");
    setThinking(defaultThinkingTime());
    setEditingId(null);
  };

  const loadBotIntoForm = (id: string) => {
    const b = allBots.find((x) => x.id === id);
    if (!b) return;
    setEditingId(b.id);
    setName(b.name);
    setElo(b.elo);
    setAvatar(b.avatar);
    setAvatarFile(null);
    setQuote(b.quote);
    setCategory(b.category);
    setDialogueLinesText((b.dialogueLines ?? []).join("\n"));
    setMiddlegame(b.middlegame);
    setEndgame(b.endgame);
    setOpening(b.opening);
    setErrorRules(b.errorRules);
    setEndgameTrigger(b.endgameTrigger);
    setBucketMap(b.bucketMap);
    setHumanMistake(b.humanMistake ?? defaultHumanMistake());
    setBotTitle(b.title ?? "");
    setBotTitleColor(b.titleColor ?? "");
    setBotCountry(b.country ?? "");
    setThinking(b.thinking ?? defaultThinkingTime());
  };

  useEffect(() => {
    if (unlocked && !open) setOpen(true);
  }, [unlocked, open]);

  const tryUnlock = async () => {
    setPinError("");
    // Server-side PIN verification + grants `owner` role for this user.
    const { data, error } = await supabase.rpc("claim_owner_role", { _pin: pin });
    if (error) { setPinError(error.message); return; }
    if (data === true) {
      await refreshOwner();
      setPinOpen(false);
      setOpen(true);
      setPin("");
    } else {
      setPinError("Incorrect PIN");
    }
  };


  const onAvatarFile = (f?: File) => {
    if (!f) return;
    setAvatarFile(f);
    const r = new FileReader();
    r.onload = () => setAvatar(typeof r.result === "string" ? r.result : undefined);
    r.readAsDataURL(f);
  };

  const onBinFile = (f?: File) => {
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      const ab = r.result as ArrayBuffer;
      const bytes = new Uint8Array(ab);
      setOpening((o) => ({ ...o, bookBin: bytesToBase64(bytes), bookName: f.name }));
      setBookSize(bytes.byteLength);
    };
    r.readAsArrayBuffer(f);
  };

  const publish = async () => {
    if (!name.trim() || publishing) return;
    setPublishing(true);
    setPublishError(null);
    try {
      const payload = {
        name: name.trim(),
        elo: Number(elo) || 1500,
        avatarFile,
        avatarDataUrl: avatar,
        quote: quote.trim(),
        category,
        dialogueLines: dialogueLinesText.split("\n").map((s) => s.trim()).filter(Boolean),
        middlegame,
        endgame,
        opening,
        errorRules,
        endgameTrigger,
        bucketMap,
        humanMistake,
        title: botTitle.trim() || null,
        titleColor: botTitleColor.trim() || null,
        country: botCountry.trim() || null,
        thinking,
      };
      if (editingId) await updateBot(editingId, payload);
      else await publishBot(payload);
      resetForm();
      setOpen(false);
    } catch (e) {
      setPublishError(e instanceof Error ? e.message : String(e));
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="max-w-[1400px] mx-auto mt-6 mb-4">
      <Collapsible open={open} onOpenChange={(v) => {
        if (v && !unlocked) { setPinOpen(true); return; }
        setOpen(v);
      }}>
        <div className="rounded-lg border border-border/60 bg-card/40">
          <CollapsibleTrigger asChild>
            <button className="w-full flex items-center justify-between px-4 py-2.5 text-left">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Lock className="w-3.5 h-3.5" />
                <span>🔐 Owner Control Portal</span>
                {unlocked && <span className="text-success">• unlocked</span>}
              </div>
              <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", open && "rotate-180")} />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            {unlocked && (
              <div className="px-4 pb-4 pt-2 space-y-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="text-sm font-semibold">
                    Bot Personality Forge — Lucas Chess engine
                    {editingId && <span className="ml-2 text-xs text-primary">· Editing</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Select value={editingId ?? ""} onValueChange={(v) => v && loadBotIntoForm(v)}>
                      <SelectTrigger className="h-8 w-[220px] text-xs">
                        <SelectValue placeholder="Edit existing bot…" />
                      </SelectTrigger>
                      <SelectContent>
                        {allBots.map((b) => (
                          <SelectItem key={b.id} value={b.id}>{b.name} · ELO {b.elo}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {editingId && (
                      <Button size="sm" variant="secondary" onClick={resetForm}>New bot</Button>
                    )}
                  </div>
                </div>
                <Tabs defaultValue="general">
                  <TabsList className="grid grid-cols-10 w-full">
                    <TabsTrigger value="general">General</TabsTrigger>
                    <TabsTrigger value="middlegame">Middlegame</TabsTrigger>
                    <TabsTrigger value="endgame">Endgame</TabsTrigger>
                    <TabsTrigger value="errors">Error rules</TabsTrigger>
                    <TabsTrigger value="mistakes">Mistakes</TabsTrigger>
                    <TabsTrigger value="opening">Opening</TabsTrigger>
                    <TabsTrigger value="buckets">Buckets</TabsTrigger>
                    <TabsTrigger value="titles">Titles</TabsTrigger>
                    <TabsTrigger value="updates">Updates</TabsTrigger>
                    <TabsTrigger value="verify">Verify</TabsTrigger>
                  </TabsList>


                  <TabsContent value="general" className="space-y-3 pt-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs">Bot Name</Label>
                        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Kasparov Jr." />
                      </div>
                      <div>
                        <Label className="text-xs">ELO (cosmetic only)</Label>
                        <Input type="number" value={elo} onChange={(e) => setElo(Number(e.target.value))} />
                        <p className="text-[10px] text-muted-foreground mt-1">Displayed on the bot card. Does not affect strength or rating.</p>
                      </div>
                      <div>
                        <Label className="text-xs">Profile Picture</Label>
                        <div className="flex items-center gap-2 mt-1">
                          {avatar && <img src={avatar} alt="avatar" className="w-10 h-10 rounded-full object-cover ring-1 ring-border" />}
                          <input ref={fileRef} type="file" accept="image/*" className="hidden"
                            onChange={(e) => onAvatarFile(e.target.files?.[0])} />
                          <Button type="button" size="sm" variant="secondary" onClick={() => fileRef.current?.click()}>
                            <Upload className="w-3.5 h-3.5 mr-1" /> Upload
                          </Button>
                        </div>
                      </div>
                      <div>
                        <Label className="text-xs">Category</Label>
                        <Select value={category} onValueChange={(v) => setCategory(v as BotCategory)}>
                          <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {BOT_CATEGORIES.map((c) => (
                              <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs">Title (optional)</Label>
                        <Input
                          value={botTitle}
                          onChange={(e) => setBotTitle(e.target.value)}
                          placeholder="GM, IM, FM, or custom"
                          maxLength={16}
                        />
                        <p className="text-[10px] text-muted-foreground mt-1">Shown before the bot name everywhere.</p>
                      </div>
                      <div>
                        <Label className="text-xs">Country Flag (optional)</Label>
                        <Input
                          value={botCountry}
                          onChange={(e) => setBotCountry(e.target.value)}
                          placeholder="Paste a flag emoji, e.g. 🇨🇦"
                          maxLength={8}
                        />
                        <p className="text-[10px] text-muted-foreground mt-1">Shown next to the bot's name and rating.</p>
                      </div>
                      <div>
                        <Label className="text-xs">Title Color Override (optional)</Label>
                        <div className="flex items-center gap-2 mt-1">
                          <input
                            type="color"
                            value={botTitleColor || "#a78bfa"}
                            onChange={(e) => setBotTitleColor(e.target.value)}
                            className="h-9 w-12 rounded border border-border bg-transparent cursor-pointer"
                          />
                          <Input
                            value={botTitleColor}
                            onChange={(e) => setBotTitleColor(e.target.value)}
                            placeholder="leave empty to use global"
                          />
                          {botTitleColor && (
                            <Button type="button" size="sm" variant="ghost" onClick={() => setBotTitleColor("")}>Clear</Button>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="rounded-md border border-border/60 bg-background/30 p-3">
                      <div className="text-xs font-semibold mb-1">Thinking Time</div>
                      <p className="text-[10px] text-muted-foreground mb-2">
                        Before each move the bot pauses a random duration between min and max. Cosmetic pacing only — does not affect playing strength.
                      </p>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label className="text-xs">Minimum (seconds)</Label>
                          <Input
                            type="number" min={0} max={30} step={0.1}
                            value={(thinking.minMs / 1000).toFixed(1)}
                            onChange={(e) => {
                              const s = Math.max(0, Number(e.target.value) || 0);
                              setThinking((t) => ({ ...t, minMs: Math.round(s * 1000) }));
                            }}
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Maximum (seconds)</Label>
                          <Input
                            type="number" min={0} max={30} step={0.1}
                            value={(thinking.maxMs / 1000).toFixed(1)}
                            onChange={(e) => {
                              const s = Math.max(0, Number(e.target.value) || 0);
                              setThinking((t) => ({ ...t, maxMs: Math.round(s * 1000) }));
                            }}
                          />
                        </div>
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs">Custom Quote</Label>
                      <Textarea value={quote} onChange={(e) => setQuote(e.target.value)} placeholder="Say something memorable…" rows={2} />
                    </div>
                    <div>
                      <Label className="text-xs">Bot Dialogue Lines</Label>
                      <Textarea
                        value={dialogueLinesText}
                        onChange={(e) => setDialogueLinesText(e.target.value)}
                        placeholder={"One line per row.\nExample:\nInteresting position…\nYou missed something there.\nLet's see how you handle this."}
                        rows={4}
                        className="font-mono text-xs"
                      />
                      <p className="text-[10px] text-muted-foreground mt-1">
                        Randomly chosen and shown as a speech bubble above the bot panel during active matches.
                      </p>
                    </div>
                  </TabsContent>

                  <TabsContent value="middlegame" className="pt-3">
                    <PhaseEditor value={middlegame} onChange={setMiddlegame} />
                  </TabsContent>
                  <TabsContent value="endgame" className="pt-3 space-y-4">
                    <PhaseEditor value={endgame} onChange={setEndgame} />
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <Label className="text-xs text-muted-foreground">Endgame trigger — max non-king/pawn pieces</Label>
                        <span className="text-xs font-mono">{endgameTrigger.maxMajorMinor}</span>
                      </div>
                      <Slider min={2} max={12} step={1} value={[endgameTrigger.maxMajorMinor]}
                        onValueChange={([v]) => setEndgameTrigger({ maxMajorMinor: v })} />
                    </div>
                  </TabsContent>

                  <TabsContent value="errors" className="pt-3 space-y-4">
                    <div className="flex items-center gap-2">
                      <Checkbox id="forceMate" checked={errorRules.forceMate} onCheckedChange={(v) => setErrorRules({ ...errorRules, forceMate: !!v })} />
                      <Label htmlFor="forceMate" className="text-sm cursor-pointer">Force best move when mate exists</Label>
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <Label className="text-xs text-muted-foreground">Max centipawn loss (0 = off)</Label>
                        <span className="text-xs font-mono">{errorRules.maxCpLoss}</span>
                      </div>
                      <Slider min={0} max={600} step={10} value={[errorRules.maxCpLoss]}
                        onValueChange={([v]) => setErrorRules({ ...errorRules, maxCpLoss: v })} />
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox id="noBlunder" checked={errorRules.noBlunderWhenWinning} onCheckedChange={(v) => setErrorRules({ ...errorRules, noBlunderWhenWinning: !!v })} />
                      <Label htmlFor="noBlunder" className="text-sm cursor-pointer">No blunders when winning</Label>
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <Label className="text-xs text-muted-foreground">Winning threshold (cp)</Label>
                        <span className="text-xs font-mono">{errorRules.winningThresholdCp}</span>
                      </div>
                      <Slider min={50} max={800} step={10} value={[errorRules.winningThresholdCp]}
                        onValueChange={([v]) => setErrorRules({ ...errorRules, winningThresholdCp: v })} />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <Label className="text-xs text-muted-foreground">Max loss when winning (cp)</Label>
                        <span className="text-xs font-mono">{errorRules.winningMaxLossCp}</span>
                      </div>
                      <Slider min={0} max={200} step={5} value={[errorRules.winningMaxLossCp]}
                        onValueChange={([v]) => setErrorRules({ ...errorRules, winningMaxLossCp: v })} />
                    </div>
                  </TabsContent>

                  <TabsContent value="mistakes" className="pt-3 space-y-4">
                    <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-[11px] text-muted-foreground leading-relaxed">
                      <span className="font-semibold text-primary">🧠 Human Mistake Layer (ELO Simulation).</span>{" "}
                      Realistic human-like errors applied AFTER engine filtering. These
                      directly affect move selection and create real Elo differences between bots.
                    </div>
                    {([
                      ["blunderChance", "🎲 Blunder Chance %", "Chance the bot plays a clearly bad move (hangs piece / misses tactic)."],
                      ["missedCaptureChance", "👀 Missed Capture Chance %", "Chance the bot ignores a free or winning capture."],
                      ["blindSpotChance", "💤 Blind Spot Chance %", "Chance the bot fails to see an immediate threat (check / fork / hanging piece)."],
                      ["randomMoveChance", "🎯 Random Move Injection %", "Chance the bot plays a non-optimal but legal random move from the full move list."],
                    ] as Array<[keyof HumanMistake, string, string]>).map(([key, label, hint]) => (
                      <div key={key}>
                        <div className="flex items-center justify-between mb-1">
                          <Label className="text-xs text-muted-foreground">{label}</Label>
                          <span className="text-xs font-mono">{humanMistake[key]}</span>
                        </div>
                        <Slider min={0} max={100} step={1} value={[humanMistake[key]]}
                          onValueChange={([v]) => setHumanMistake({ ...humanMistake, [key]: v })} />
                        <p className="text-[10px] text-muted-foreground mt-1">{hint}</p>
                      </div>
                    ))}
                  </TabsContent>

                  <TabsContent value="opening" className="space-y-3 pt-3">
                    <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-[11px] text-muted-foreground leading-relaxed">
                      The Polyglot book only <b>suggests</b> opening moves. The bot's strength, style and human-mistake settings still decide the final move — even at 100% influence nothing is forced.
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox id="actBook" checked={opening.enabled} onCheckedChange={(v) => setOpening({ ...opening, enabled: !!v })} />
                      <Label htmlFor="actBook" className="text-sm cursor-pointer">Activate Polyglot Book</Label>
                    </div>
                    <div>
                      <Label className="text-xs">Polyglot Book (.bin)</Label>
                      <div className="flex items-center gap-2 mt-1">
                        <input ref={binRef} type="file" accept=".bin,application/octet-stream" className="hidden"
                          onChange={(e) => onBinFile(e.target.files?.[0])} />
                        <Button type="button" size="sm" variant="secondary" onClick={() => binRef.current?.click()}>
                          <Upload className="w-3.5 h-3.5 mr-1" /> Upload .bin
                        </Button>
                        <span className="text-xs text-muted-foreground truncate">
                          {opening.bookName ? `${opening.bookName}${bookSize ? ` · ${(bookSize / 1024).toFixed(1)} KB` : ""}` : "no file"}
                        </span>
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs">Selection mode</Label>
                      <div className="mt-1 text-xs rounded-md border border-border/60 px-3 py-2 bg-secondary/30">Proportional random (by book weights)</div>
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <Label className="text-xs text-muted-foreground">Book influence %</Label>
                        <span className="text-xs font-mono">{opening.influence}</span>
                      </div>
                      <Slider min={0} max={100} step={1} value={[opening.influence]}
                        onValueChange={([v]) => setOpening({ ...opening, influence: v })} />
                      <p className="text-[10px] text-muted-foreground mt-1">How strongly book moves are preferred among the moves the bot would already consider. Not "force the book move".</p>
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <Label className="text-xs text-muted-foreground">Maximum book depth (plies)</Label>
                        <span className="text-xs font-mono">{opening.maxBookDepth}</span>
                      </div>
                      <Slider min={2} max={40} step={1} value={[opening.maxBookDepth]}
                        onValueChange={([v]) => setOpening({ ...opening, maxBookDepth: v })} />
                    </div>
                  </TabsContent>

                  <TabsContent value="buckets" className="pt-3 space-y-3">
                    <p className="text-[11px] text-muted-foreground">
                      Editable centipawn tolerance per strength bucket. Lower = closer to best move.
                    </p>
                    <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-[11px] text-muted-foreground leading-relaxed">
                      <span className="font-semibold text-primary">Strength &gt; Personality:</span> the
                      bot's ELO first builds a limited candidate-move pool (top moves + depth + blunder
                      probability). Personality buckets and style weights then pick within that pool ONLY.
                      Even if personality prefers a GM-level move, if the move is not inside the ELO pool
                      it is never played.
                    </div>
                    {STRENGTH_LABELS.filter((s) => s.value !== "worst").map((s) => (
                      <div key={s.value}>
                        <div className="flex items-center justify-between mb-1">
                          <Label className="text-xs text-muted-foreground">{s.label}</Label>
                          <span className="text-xs font-mono">{bucketMap[s.value]} cp</span>
                        </div>
                        <Slider min={0} max={500} step={5} value={[bucketMap[s.value]]}
                          onValueChange={([v]) => setBucketMap({ ...bucketMap, [s.value]: v })} />
                      </div>
                    ))}
                  </TabsContent>

                  <TabsContent value="titles" className="pt-3">
                    <TitleColorsManager />
                  </TabsContent>

                  <TabsContent value="updates" className="pt-3">
                    <UpdateLogManager />
                  </TabsContent>
                  <TabsContent value="verify" className="pt-3">
                    <VerificationReviewPanel />
                  </TabsContent>
                </Tabs>


                <div className="flex items-center justify-end gap-3 pt-2">
                  {publishError && <span className="text-xs text-destructive">{publishError}</span>}
                  <Button
                    onClick={publish}
                    disabled={publishing}
                    className="bg-success text-primary-foreground hover:bg-success/90 font-bold"
                  >
                    <Rocket className="w-4 h-4 mr-2" /> {publishing ? (editingId ? "Saving…" : "Publishing…") : (editingId ? "Save Changes" : "Publish Bot")}
                  </Button>
                </div>
              </div>
            )}
          </CollapsibleContent>
        </div>
      </Collapsible>

      <Dialog open={pinOpen} onOpenChange={setPinOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Enter Owner PIN</DialogTitle>
            <DialogDescription>Restricted area. Authorized personnel only.</DialogDescription>
          </DialogHeader>
          <Input
            type="password"
            inputMode="numeric"
            value={pin}
            onChange={(e) => { setPin(e.target.value); setPinError(""); }}
            onKeyDown={(e) => e.key === "Enter" && tryUnlock()}
            placeholder="••••••"
            autoFocus
          />
          {pinError && <p className="text-xs text-destructive">{pinError}</p>}
          <Button onClick={tryUnlock} className="w-full">Unlock</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TitleColorsManager() {
  const [map, setMap] = useState<Record<string, string>>(loadTitleColors());
  const [newTitle, setNewTitle] = useState("");
  const [newColor, setNewColor] = useState("#b8860b");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    refreshTitleColors().then(setMap);
    return subscribeTitleColors(() => setMap({ ...loadTitleColors() }));
  }, []);

  const add = async () => {
    if (!newTitle.trim()) return;
    setBusy(true);
    await saveTitleColor(newTitle.trim(), newColor);
    setNewTitle(""); setBusy(false);
  };

  const update = async (title: string, color: string) => {
    await saveTitleColor(title, color);
  };

  const entries = Object.entries(map).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-[11px] text-muted-foreground">
        Colors here apply globally to every bot using that title (e.g. GM, IM, FM, or custom titles). Individual bots can override via the Title Color in the General tab.
      </div>
      <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-end">
        <div>
          <Label className="text-xs">New title</Label>
          <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="e.g. CM" maxLength={16} />
        </div>
        <div>
          <Label className="text-xs">Color</Label>
          <input type="color" value={newColor} onChange={(e) => setNewColor(e.target.value)} className="h-9 w-14 rounded border border-border cursor-pointer block" />
        </div>
        <Button onClick={add} disabled={busy || !newTitle.trim()} size="sm">Add</Button>
      </div>
      <div className="space-y-2">
        {entries.length === 0 && <p className="text-xs text-muted-foreground">No titles configured yet.</p>}
        {entries.map(([title, color]) => (
          <div key={title} className="flex items-center gap-3 rounded-md border border-border/60 bg-secondary/30 px-3 py-2">
            <span className="font-black uppercase tracking-wider text-sm w-16" style={{ color }}>{title}</span>
            <input
              type="color"
              value={color}
              onChange={(e) => update(title, e.target.value)}
              className="h-8 w-12 rounded border border-border cursor-pointer"
            />
            <span className="text-xs font-mono text-muted-foreground flex-1">{color}</span>
            <Button variant="ghost" size="icon" onClick={() => deleteTitleColor(title)}>
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-muted-foreground">Used by <code>getTitleColor</code> on every screen that shows a bot title.</p>
    </div>
  );
}

// keep imports referenced
void getTitleColor;


