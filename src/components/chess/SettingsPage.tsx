import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/lib/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  Palette,
  Gamepad2,
  User,
  Volume2,
  Sparkles,
  MessageSquare,
  Monitor,
  Sun,
  Moon,
  Eye,
  Camera,
  Trash2,
  Clock,
  Check,
  AlertCircle,
} from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { VerificationCard } from "./VerificationRequest";
import { useSettings, type ThemeMode } from "@/lib/settings";
import { BOARD_THEMES, PIECE_SETS, findBoardTheme, pieceUrl } from "@/lib/boardThemes";

const EMOJIS = [
  "♞",
  "♛",
  "♚",
  "♜",
  "♝",
  "♟",
  "🔥",
  "⚡",
  "🧠",
  "🦅",
  "🐺",
  "🦁",
  "🐲",
  "👑",
  "🎯",
  "🛡️",
  "⚔️",
  "🌟",
];
const STANDARD_TITLES = ["GM", "IM", "FM", "CM", "NM", "WGM"];
const CRTR = "👑 CRTR";
const CREATOR_CODE = "ChessUP2";

export function SettingsPage({
  initialTab = "board",
}: {
  initialTab?: "board" | "gameplay" | "account";
}) {
  const { profile, user, refreshProfile, claimOwner } = useAuth();

  const [settings, update] = useSettings();
  const [tab, setTab] = useState<"board" | "gameplay" | "account">(initialTab);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  const [savingIcon, setSavingIcon] = useState(false);
  const [titleClaimOpen, setTitleClaimOpen] = useState<string | null>(null);
  const [creatorOpen, setCreatorOpen] = useState(false);
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarMsg, setAvatarMsg] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const [usernameInput, setUsernameInput] = useState(profile?.username ?? "");
  const [savingUsername, setSavingUsername] = useState(false);
  const [usernameMsg, setUsernameMsg] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    if (profile?.username) {
      setUsernameInput(profile.username);
    }
  }, [profile?.username]);

  if (!profile || !user) {
    return (
      <div className="max-w-xl mx-auto pt-12 text-sm text-muted-foreground">Loading settings…</div>
    );
  }

  // 15 days cooldown calculation
  const COOLDOWN_DAYS = 15;
  const COOLDOWN_MS = COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
  const usernameLastChangedKey = `chess_username_last_changed_${user.id}`;
  const lastChangedRaw =
    typeof window !== "undefined" ? localStorage.getItem(usernameLastChangedKey) : null;
  const lastChangedTime = lastChangedRaw ? new Date(lastChangedRaw).getTime() : null;
  const timeSinceChange = lastChangedTime ? Date.now() - lastChangedTime : Infinity;
  const isUsernameLocked = timeSinceChange < COOLDOWN_MS;
  const daysRemaining = isUsernameLocked
    ? Math.max(1, Math.ceil((COOLDOWN_MS - timeSinceChange) / (24 * 60 * 60 * 1000)))
    : 0;
  const nextAvailableDate = lastChangedTime
    ? new Date(lastChangedTime + COOLDOWN_MS).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "";

  const saveIcon = async (next: string) => {
    setSavingIcon(true);
    await supabase.from("profiles").update({ profile_icon: next }).eq("id", user.id);
    await refreshProfile();
    setSavingIcon(false);
  };

  const tryCreatorUnlock = async () => {
    if (code === CREATOR_CODE) {
      await claimOwner(code);
      setCreatorOpen(false);
      setCode("");
      setCodeError("");
    } else {
      setCodeError("Invalid Master Override Code.");
    }
  };

  const clearTitle = async () => {
    await supabase.from("profiles").update({ title_badge: null }).eq("id", user.id);
    await refreshProfile();
  };

  const handleAvatarFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setAvatarMsg({ type: "error", text: "Please select an image file (PNG, JPG, WebP)." });
      return;
    }
    setUploadingAvatar(true);
    setAvatarMsg(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      const img = new Image();
      img.onload = async () => {
        try {
          const maxDim = 240;
          let width = img.width;
          let height = img.height;
          if (width > height) {
            if (width > maxDim) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            }
          } else {
            if (height > maxDim) {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }

          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx?.drawImage(img, 0, 0, width, height);
          const optimizedDataUrl = canvas.toDataURL("image/jpeg", 0.85);

          const { error } = await supabase
            .from("profiles")
            .update({ avatar_url: optimizedDataUrl })
            .eq("id", user.id);

          if (error) {
            setAvatarMsg({ type: "error", text: "Failed to save profile picture." });
          } else {
            await refreshProfile();
            setAvatarMsg({ type: "success", text: "Profile picture updated!" });
          }
        } catch {
          setAvatarMsg({ type: "error", text: "Failed to process image." });
        } finally {
          setUploadingAvatar(false);
        }
      };
      img.onerror = () => {
        setAvatarMsg({ type: "error", text: "Invalid image format." });
        setUploadingAvatar(false);
      };
      img.src = dataUrl;
    };
    reader.onerror = () => {
      setAvatarMsg({ type: "error", text: "Failed to read image file." });
      setUploadingAvatar(false);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const removeAvatar = async () => {
    setUploadingAvatar(true);
    setAvatarMsg(null);
    const { error } = await supabase
      .from("profiles")
      .update({ avatar_url: null })
      .eq("id", user.id);
    if (!error) {
      await refreshProfile();
      setAvatarMsg({ type: "success", text: "Profile picture removed." });
    }
    setUploadingAvatar(false);
  };

  const handleSaveUsername = async () => {
    const trimmed = usernameInput.trim();
    if (trimmed.length < 3) {
      setUsernameMsg({ type: "error", text: "Username must be at least 3 characters." });
      return;
    }
    if (trimmed.length > 25) {
      setUsernameMsg({ type: "error", text: "Username cannot exceed 25 characters." });
      return;
    }
    if (trimmed === profile.username) {
      setUsernameMsg({ type: "error", text: "Username is unchanged." });
      return;
    }
    if (isUsernameLocked) {
      setUsernameMsg({
        type: "error",
        text: `You can change your username again in ${daysRemaining} days (on ${nextAvailableDate}).`,
      });
      return;
    }

    setSavingUsername(true);
    setUsernameMsg(null);
    const { error } = await supabase
      .from("profiles")
      .update({ username: trimmed })
      .eq("id", user.id);
    if (error) {
      setUsernameMsg({ type: "error", text: error.message || "Failed to update username." });
    } else {
      localStorage.setItem(usernameLastChangedKey, new Date().toISOString());
      await refreshProfile();
      setUsernameMsg({ type: "success", text: "Username successfully changed!" });
    }
    setSavingUsername(false);
  };

  const TABS = [
    { key: "board", label: "Board & Pieces", icon: Palette },
    { key: "gameplay", label: "Gameplay & Audio", icon: Gamepad2 },
    { key: "account", label: "Profile & Title", icon: User },
  ] as const;
  const theme = findBoardTheme(settings.boardTheme);
  const preview = ["br", "bn", "bb", "bq", "bk", "bb", "bn", "br"];

  return (
    <div className="max-w-4xl mx-auto pt-10 md:pt-16 pb-12 flex flex-col md:flex-row gap-6">
      <nav className="md:w-52 shrink-0 flex md:flex-col gap-1">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm text-left transition-colors",
                tab === t.key
                  ? "bg-primary/15 text-primary font-medium"
                  : "text-muted-foreground hover:bg-secondary",
              )}
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          );
        })}
      </nav>
      <div className="flex-1 min-w-0 space-y-6">
        {tab === "board" && (
          <>
            <Card className="bg-card">
              <CardHeader className="pb-4">
                <CardTitle className="text-base">Board & Pieces</CardTitle>
                <CardDescription>Changes apply instantly to every board.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="mx-auto w-full max-w-[280px] grid grid-cols-8 rounded overflow-hidden shadow">
                  {Array.from({ length: 32 }).map((_, i) => {
                    const r = Math.floor(i / 8),
                      c = i % 8;
                    const dark = (r + c) % 2 === 1;
                    const code = r === 0 ? preview[c] : r === 1 ? "bp" : r === 2 ? null : "wp";
                    return (
                      <div
                        key={i}
                        className="aspect-square"
                        style={{ background: dark ? theme.dark : theme.light }}
                      >
                        {code && (
                          <img
                            src={pieceUrl(settings.pieceSet, code)}
                            alt=""
                            className="w-full h-full"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Board</Label>
                  <div className="mt-2 grid grid-cols-5 gap-2">
                    {BOARD_THEMES.map((b) => (
                      <button
                        key={b.id}
                        onClick={() => update("boardTheme", b.id)}
                        title={b.name}
                        className={cn(
                          "rounded-md border p-1 transition-colors",
                          settings.boardTheme === b.id
                            ? "border-primary ring-2 ring-primary/50"
                            : "border-border/60 hover:bg-secondary",
                        )}
                      >
                        <div className="grid grid-cols-2 aspect-square rounded-sm overflow-hidden">
                          <span style={{ background: b.light }} />
                          <span style={{ background: b.dark }} />
                          <span style={{ background: b.dark }} />
                          <span style={{ background: b.light }} />
                        </div>
                        <div className="text-[10px] mt-1 truncate text-muted-foreground">
                          {b.name}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Pieces</Label>
                  <div className="mt-2 grid grid-cols-6 gap-2">
                    {PIECE_SETS.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => update("pieceSet", p.id)}
                        title={p.name}
                        className={cn(
                          "rounded-md border p-1 transition-colors",
                          settings.pieceSet === p.id
                            ? "border-primary ring-2 ring-primary/50"
                            : "border-border/60 bg-secondary/40 hover:bg-secondary",
                        )}
                      >
                        <img
                          src={pieceUrl(p.id, "wn")}
                          alt={p.name}
                          className="w-full aspect-square"
                          loading="lazy"
                        />
                        <div className="text-[10px] truncate text-muted-foreground">{p.name}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card">
              <CardHeader className="pb-4">
                <div className="flex items-center gap-2">
                  <Palette className="w-4 h-4 text-primary" />
                  <CardTitle className="text-base">Appearance</CardTitle>
                </div>
                <CardDescription>Visual customization options.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div>
                  <Label className="text-xs text-muted-foreground">UI Theme</Label>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {(
                      [
                        { key: "dark", label: "Dark", icon: Moon },
                        { key: "light", label: "Light", icon: Sun },
                        { key: "auto", label: "Auto", icon: Monitor },
                      ] as const
                    ).map((t) => {
                      const Icon = t.icon;
                      const active = settings.theme === (t.key as ThemeMode);
                      return (
                        <button
                          key={t.key}
                          onClick={() => update("theme", t.key as ThemeMode)}
                          className={cn(
                            "flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors",
                            active
                              ? "bg-primary/15 border-primary/50 text-primary font-medium"
                              : "bg-secondary/40 border-border/60 text-muted-foreground hover:bg-secondary",
                          )}
                        >
                          <Icon className="w-3.5 h-3.5" />
                          {t.label}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-2">
                    Auto follows your operating system theme and updates automatically.
                  </p>
                </div>

                <Separator />

                <div>
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-muted-foreground">Board Size</Label>
                    <span className="text-xs font-mono text-foreground">{settings.boardSize}%</span>
                  </div>
                  <div className="mt-3 flex items-center gap-3">
                    <span className="text-[11px] text-muted-foreground shrink-0">Small</span>
                    <Slider
                      value={[settings.boardSize]}
                      min={60}
                      max={130}
                      step={5}
                      onValueChange={(v) => update("boardSize", v[0] ?? 100)}
                      className="flex-1"
                    />
                    <span className="text-[11px] text-muted-foreground shrink-0">Large</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <p className="text-[11px] text-muted-foreground">
                      Applies to every board: matches, Bot vs Bot, tournaments, sandbox and replays.
                    </p>
                    <Button variant="ghost" size="sm" onClick={() => update("boardSize", 100)}>
                      Reset
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {tab === "gameplay" && (
          <Card className="bg-card">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2">
                <Gamepad2 className="w-4 h-4 text-primary" />
                <CardTitle className="text-base">Gameplay</CardTitle>
              </div>
              <CardDescription>In-game experience preferences.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Volume2 className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <div className="text-sm font-medium">Sound Effects</div>
                    <div className="text-[11px] text-muted-foreground">
                      Move, capture and check sounds.
                    </div>
                  </div>
                </div>
                <Switch checked={settings.sound} onCheckedChange={(v) => update("sound", v)} />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Sparkles className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <div className="text-sm font-medium">Board Animations</div>
                    <div className="text-[11px] text-muted-foreground">
                      Smooth piece movement and transitions.
                    </div>
                  </div>
                </div>
                <Switch
                  checked={settings.animations}
                  onCheckedChange={(v) => update("animations", v)}
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <MessageSquare className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <div className="text-sm font-medium">Bot Speech</div>
                    <div className="text-[11px] text-muted-foreground">
                      Show bot chat bubbles during matches.
                    </div>
                  </div>
                </div>
                <Switch
                  checked={settings.botSpeech}
                  onCheckedChange={(v) => update("botSpeech", v)}
                />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Eye className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <div className="text-sm font-medium">Immersive Bot Names</div>
                    <div className="text-[11px] text-muted-foreground">
                      Show bots as realistic online usernames and hide their titles. Strength and
                      behaviour are unchanged.
                    </div>
                  </div>
                </div>
                <Switch
                  checked={settings.immersive}
                  onCheckedChange={(v) => update("immersive", v)}
                />
              </div>
            </CardContent>
          </Card>
        )}

        {tab === "account" && (
          <Card className="bg-card">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-primary" />
                <CardTitle className="text-base">Profile & Titles</CardTitle>
              </div>
              <CardDescription>
                Customize your profile picture, username, title badge, and profile icon.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Profile Picture Upload from local device */}
              <div>
                <Label className="text-xs font-semibold text-foreground">Profile Picture</Label>
                <p className="text-[11px] text-muted-foreground mt-0.5 mb-3">
                  Upload a photo from your device to personalize your avatar across the arena.
                </p>
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 md:w-20 md:h-20 rounded-lg bg-secondary grid place-items-center overflow-hidden shrink-0 ring-1 ring-border shadow-xs">
                    {profile.avatar_url ? (
                      <img
                        src={profile.avatar_url}
                        alt={profile.username}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <User className="w-8 h-8 text-muted-foreground" />
                    )}
                  </div>
                  <div className="space-y-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleAvatarFileSelect}
                    />
                    <div className="flex items-center gap-2 flex-wrap">
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploadingAvatar}
                        className="h-8 text-xs font-semibold"
                      >
                        <Camera className="w-3.5 h-3.5 mr-1.5" />
                        {uploadingAvatar ? "Uploading…" : "Upload Photo"}
                      </Button>
                      {profile.avatar_url && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={removeAvatar}
                          disabled={uploadingAvatar}
                          className="h-8 text-xs text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Remove
                        </Button>
                      )}
                    </div>
                    {avatarMsg && (
                      <p
                        className={cn(
                          "text-[11px] font-medium flex items-center gap-1",
                          avatarMsg.type === "success" ? "text-success" : "text-destructive",
                        )}
                      >
                        {avatarMsg.type === "success" ? (
                          <Check className="w-3 h-3" />
                        ) : (
                          <AlertCircle className="w-3 h-3" />
                        )}
                        {avatarMsg.text}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <Separator />

              {/* Username with 15-day cooldown */}
              <div>
                <Label className="text-xs font-semibold text-foreground">Username</Label>
                <p className="text-[11px] text-muted-foreground mt-0.5 mb-2">
                  You can change your username once every 15 days.
                </p>

                {isUsernameLocked ? (
                  <div className="space-y-2 max-w-md">
                    <Input
                      value={profile.username}
                      disabled
                      className="h-9 font-medium bg-muted/40 cursor-not-allowed"
                    />
                    <div className="rounded-md bg-amber-500/10 border border-amber-500/25 px-3 py-2 flex items-start gap-2.5 text-xs text-amber-500">
                      <Clock className="w-4 h-4 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-semibold">Username Cooldown Active</div>
                        <div className="text-[11px] opacity-90 mt-0.5">
                          You can change your username again in{" "}
                          <span className="font-bold">{daysRemaining} days</span> (on{" "}
                          {nextAvailableDate}).
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2 max-w-md">
                    <div className="flex gap-2">
                      <Input
                        value={usernameInput}
                        maxLength={25}
                        onChange={(e) => setUsernameInput(e.target.value)}
                        placeholder="Enter new username"
                        className="h-9"
                      />
                      <Button
                        size="sm"
                        onClick={handleSaveUsername}
                        disabled={savingUsername || usernameInput.trim() === profile.username}
                        className="h-9 px-4 font-semibold text-xs shrink-0"
                      >
                        {savingUsername ? "Saving…" : "Save Username"}
                      </Button>
                    </div>
                    {usernameMsg && (
                      <p
                        className={cn(
                          "text-[11px] font-medium flex items-center gap-1",
                          usernameMsg.type === "success" ? "text-success" : "text-destructive",
                        )}
                      >
                        {usernameMsg.type === "success" ? (
                          <Check className="w-3 h-3" />
                        ) : (
                          <AlertCircle className="w-3 h-3" />
                        )}
                        {usernameMsg.text}
                      </p>
                    )}
                  </div>
                )}
              </div>

              <Separator />

              <div>
                <Label className="text-xs text-muted-foreground font-semibold">Profile Icon</Label>
                <div className="mt-2 grid grid-cols-9 gap-1.5">
                  {EMOJIS.map((e) => (
                    <button
                      key={e}
                      onClick={() => saveIcon(e)}
                      className={cn(
                        "h-9 rounded-md border text-lg transition-colors",
                        profile.profile_icon === e
                          ? "bg-primary/20 border-primary/60"
                          : "bg-secondary/40 border-border/60 hover:bg-secondary",
                      )}
                    >
                      {e}
                    </button>
                  ))}
                </div>
                {savingIcon && <p className="text-[11px] text-muted-foreground mt-1">Saving…</p>}
              </div>

              <div>
                <Label className="text-xs text-muted-foreground font-semibold">Chess Title</Label>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {STANDARD_TITLES.map((t) => (
                    <button
                      key={t}
                      onClick={() => setTitleClaimOpen(t)}
                      className={cn(
                        "h-9 rounded-md border text-sm font-bold transition-colors",
                        profile.title_badge === t
                          ? "bg-primary/20 border-primary/60 text-primary"
                          : "bg-secondary/40 border-border/60 hover:bg-secondary",
                      )}
                    >
                      {t}
                    </button>
                  ))}
                  <button
                    onClick={() => setCreatorOpen(true)}
                    className={cn(
                      "col-span-3 h-10 rounded-md border text-sm font-bold transition-colors",
                      profile.title_badge === CRTR
                        ? "bg-gradient-to-r from-amber-500/30 to-yellow-300/20 border-amber-400/60 text-amber-300"
                        : "bg-secondary/40 border-border/60 hover:bg-secondary",
                    )}
                  >
                    {CRTR}
                  </button>
                </div>
                {profile.title_badge && (
                  <p className="text-[11px] text-muted-foreground mt-2">
                    Active:{" "}
                    <span className="text-foreground font-semibold">{profile.title_badge}</span>{" "}
                    <button className="underline ml-1" onClick={clearTitle}>
                      clear
                    </button>
                  </p>
                )}
              </div>

              <Separator />
              <VerificationCard />
            </CardContent>
          </Card>
        )}

        {/* Title claim dialog */}
        <Dialog open={!!titleClaimOpen} onOpenChange={(v) => !v && setTitleClaimOpen(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Verification Required</DialogTitle>
              <DialogDescription>
                To claim the <span className="text-foreground font-semibold">{titleClaimOpen}</span>{" "}
                title, you must submit proof of a real-life verified FIDE or National Elo rating
                matching Master standards.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setTitleClaimOpen(null)}>
                Understood
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Creator unlock dialog */}
        <Dialog
          open={creatorOpen}
          onOpenChange={(v) => {
            setCreatorOpen(v);
            if (!v) {
              setCode("");
              setCodeError("");
            }
          }}
        >
          <DialogContent className="max-w-xs">
            <DialogHeader>
              <DialogTitle>👑 CRTR — Master Override</DialogTitle>
              <DialogDescription>Enter Master Override Code:</DialogDescription>
            </DialogHeader>
            <Input
              type="password"
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                setCodeError("");
              }}
              onKeyDown={(e) => e.key === "Enter" && tryCreatorUnlock()}
              placeholder="••••••••"
              autoFocus
            />
            {codeError && <p className="text-xs text-destructive">{codeError}</p>}
            <Button onClick={tryCreatorUnlock} className="w-full">
              Unlock
            </Button>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
