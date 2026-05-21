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
import { publishBot, defaultPhase, type PhaseConfig, type Strength } from "@/lib/botStore";
import { bytesToBase64 } from "@/lib/polyglot";

const PIN = "774152";
const STRENGTHS: { value: Strength; label: string }[] = [
  { value: "best", label: "Best move" },
  { value: "proportional", label: "Proportional random" },
  { value: "uniform", label: "Uniform random" },
  { value: "player", label: "Selected by the player" },
];

function PhaseEditor({
  value,
  onChange,
}: {
  value: PhaseConfig;
  onChange: (v: PhaseConfig) => void;
}) {
  const sliders: Array<[keyof PhaseConfig, string]> = [
    ["pawnMove", "To move a pawn"],
    ["advance", "Advance piece"],
    ["check", "Make check"],
    ["capture", "Capture"],
  ];
  return (
    <div className="space-y-4">
      <div>
        <Label className="text-xs text-muted-foreground">Strength</Label>
        <Select
          value={value.strength}
          onValueChange={(v) => onChange({ ...value, strength: v as Strength })}
        >
          <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
          <SelectContent>
            {STRENGTHS.map((s) => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {sliders.map(([key, label]) => (
        <div key={key}>
          <div className="flex items-center justify-between mb-1">
            <Label className="text-xs text-muted-foreground">{label}</Label>
            <span className="text-xs font-mono">{value[key] as number}</span>
          </div>
          <Slider
            min={0}
            max={100}
            step={1}
            value={[value[key] as number]}
            onValueChange={([v]) => onChange({ ...value, [key]: v })}
          />
        </div>
      ))}
    </div>
  );
}

export function OwnerPortal() {
  const [open, setOpen] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState("");

  // forge state
  const [name, setName] = useState("");
  const [elo, setElo] = useState(1500);
  const [avatar, setAvatar] = useState<string | undefined>();
  const [quote, setQuote] = useState("");
  const [category, setCategory] = useState<"Intermediate" | "Master">("Intermediate");
  const [middlegame, setMiddlegame] = useState<PhaseConfig>(defaultPhase());
  const [endgame, setEndgame] = useState<PhaseConfig>(defaultPhase());
  const [bookEnabled, setBookEnabled] = useState(false);
  const [bookBin, setBookBin] = useState<string | undefined>(undefined);
  const [bookName, setBookName] = useState<string | undefined>(undefined);
  const [bookSize, setBookSize] = useState<number>(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const binRef = useRef<HTMLInputElement>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  useEffect(() => {
    if (unlocked && !open) setOpen(true);
  }, [unlocked, open]);

  const tryUnlock = () => {
    if (pin === PIN) {
      setUnlocked(true);
      setPinOpen(false);
      setPin("");
      setPinError("");
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
      setBookBin(bytesToBase64(bytes));
      setBookName(f.name);
      setBookSize(bytes.byteLength);
    };
    r.readAsArrayBuffer(f);
  };

  const publish = async () => {
    if (!name.trim() || publishing) return;
    setPublishing(true);
    setPublishError(null);
    try {
      await publishBot({
        name: name.trim(),
        elo: Number(elo) || 1500,
        avatarFile,
        avatarDataUrl: avatar,
        quote: quote.trim(),
        category,
        middlegame,
        endgame,
        opening: { enabled: bookEnabled, bookBin, bookName },
      });
      setName(""); setQuote(""); setAvatar(undefined); setAvatarFile(null);
      setElo(1500);
      setMiddlegame(defaultPhase()); setEndgame(defaultPhase());
      setBookEnabled(false); setBookBin(undefined); setBookName(undefined); setBookSize(0);
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
                <div className="text-sm font-semibold">Bot Upload Forge</div>
                <Tabs defaultValue="general">
                  <TabsList className="grid grid-cols-4 w-full">
                    <TabsTrigger value="general">General Info</TabsTrigger>
                    <TabsTrigger value="middlegame">Middlegame</TabsTrigger>
                    <TabsTrigger value="endgame">Endgame</TabsTrigger>
                    <TabsTrigger value="opening">Opening</TabsTrigger>
                  </TabsList>

                  <TabsContent value="general" className="space-y-3 pt-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs">Bot Name</Label>
                        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Kasparov Jr." />
                      </div>
                      <div>
                        <Label className="text-xs">ELO</Label>
                        <Input type="number" value={elo} onChange={(e) => setElo(Number(e.target.value))} />
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
                        <Select value={category} onValueChange={(v) => setCategory(v as "Intermediate" | "Master")}>
                          <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Intermediate">Intermediate</SelectItem>
                            <SelectItem value="Master">Master</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs">Custom Quote</Label>
                      <Textarea value={quote} onChange={(e) => setQuote(e.target.value)} placeholder="Say something memorable…" rows={2} />
                    </div>
                  </TabsContent>

                  <TabsContent value="middlegame" className="pt-3">
                    <PhaseEditor value={middlegame} onChange={setMiddlegame} />
                  </TabsContent>
                  <TabsContent value="endgame" className="pt-3">
                    <PhaseEditor value={endgame} onChange={setEndgame} />
                  </TabsContent>

                  <TabsContent value="opening" className="space-y-3 pt-3">
                    <div className="flex items-center gap-2">
                      <Checkbox id="actBook" checked={bookEnabled} onCheckedChange={(v) => setBookEnabled(!!v)} />
                      <Label htmlFor="actBook" className="text-sm cursor-pointer">Activate Book</Label>
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
                          {bookName ? `${bookName} · ${(bookSize / 1024).toFixed(1)} KB` : "no file"}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-1.5">
                        Accepts Polyglot-format binary opening books (e.g. Lucas Chess exports). The bot will
                        consult this book each move until it leaves known theory, then hand off to the engine.
                      </p>
                    </div>
                  </TabsContent>
                </Tabs>

                <div className="flex items-center justify-end gap-3 pt-2">
                  {publishError && <span className="text-xs text-destructive">{publishError}</span>}
                  <Button
                    onClick={publish}
                    disabled={publishing}
                    className="bg-success text-primary-foreground hover:bg-success/90 font-bold"
                  >
                    <Rocket className="w-4 h-4 mr-2" /> {publishing ? "Publishing…" : "Publish Bot"}
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
