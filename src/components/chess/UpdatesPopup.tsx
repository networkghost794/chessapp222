import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/useAuth";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Megaphone } from "lucide-react";

type Update = {
  id: string;
  version: string;
  title: string | null;
  content: string;
  created_at: string;
};

/**
 * On app start, fetches the latest published update. If the signed-in user has
 * not already dismissed that version, shows a popup. After "OK", marks the
 * version as seen so it never re-appears for the same user.
 */
export function UpdatesPopup() {
  const { user, loading } = useAuth();
  const [update, setUpdate] = useState<Update | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (loading || !user) return;
    let cancelled = false;
    (async () => {
      const { data: latest } = await supabase
        .from("app_updates")
        .select("id,version,title,content,created_at")
        .eq("published", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled || !latest) return;
      const { data: seen } = await supabase
        .from("user_seen_updates")
        .select("version")
        .eq("user_id", user.id)
        .eq("version", latest.version)
        .maybeSingle();
      if (cancelled) return;
      if (!seen) {
        setUpdate(latest as Update);
        setOpen(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, loading]);

  const dismiss = async () => {
    if (update && user) {
      await supabase
        .from("user_seen_updates")
        .insert({ user_id: user.id, version: update.version });
    }
    setOpen(false);
  };

  if (!update) return null;
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) dismiss();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Megaphone className="w-5 h-5 text-primary" />
            What's new — v{update.version}
          </DialogTitle>
          {update.title && (
            <DialogDescription className="text-foreground font-medium pt-1">
              {update.title}
            </DialogDescription>
          )}
        </DialogHeader>
        <div className="text-sm whitespace-pre-wrap leading-relaxed text-muted-foreground max-h-[60vh] overflow-auto">
          {update.content}
        </div>
        <DialogFooter>
          <Button onClick={dismiss} className="bg-primary text-primary-foreground">
            OK
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
