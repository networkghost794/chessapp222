import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/useAuth";

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

export function ProfileSettings({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { profile, user, refreshProfile } = useAuth();
  const [icon, setIcon] = useState<string>(profile?.profile_icon ?? "");
  const [titleClaimOpen, setTitleClaimOpen] = useState<string | null>(null);
  const [creatorOpen, setCreatorOpen] = useState(false);
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState("");
  const [saving, setSaving] = useState(false);

  if (!profile || !user) return null;

  const saveIcon = async (next: string) => {
    setIcon(next);
    setSaving(true);
    await supabase.from("profiles").update({ profile_icon: next }).eq("id", user.id);
    await refreshProfile();
    setSaving(false);
  };

  const tryCreatorUnlock = async () => {
    if (code === CREATOR_CODE) {
      await supabase.from("profiles").update({ title_badge: CRTR }).eq("id", user.id);
      await refreshProfile();
      setCreatorOpen(false);
      setCode("");
      setCodeError("");
    } else {
      setCodeError("Invalid Master Override Code.");
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Profile Customization</DialogTitle>
            <DialogDescription>Pick an emoji icon and choose your title badge.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label className="text-xs text-muted-foreground">Profile Icon</Label>
              <div className="mt-2 grid grid-cols-9 gap-1.5">
                {EMOJIS.map((e) => (
                  <button
                    key={e}
                    onClick={() => saveIcon(e)}
                    className={cn(
                      "h-9 rounded-md border text-lg transition-colors",
                      icon === e
                        ? "bg-primary/20 border-primary/60"
                        : "bg-secondary/40 border-border/60 hover:bg-secondary",
                    )}
                  >
                    {e}
                  </button>
                ))}
              </div>
              {saving && <p className="text-[11px] text-muted-foreground mt-1">Saving…</p>}
            </div>

            <div>
              <Label className="text-xs text-muted-foreground">Chess Title</Label>
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
                  <button
                    className="underline ml-1"
                    onClick={async () => {
                      await supabase
                        .from("profiles")
                        .update({ title_badge: null })
                        .eq("id", user.id);
                      await refreshProfile();
                    }}
                  >
                    clear
                  </button>
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
    </>
  );
}
