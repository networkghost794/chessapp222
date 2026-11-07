import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/useAuth";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Bell } from "lucide-react";

type Update = {
  id: string;
  version: string;
  title: string | null;
  content: string;
  created_at: string;
};

const SEEN_KEY = "botboard_seen_update_version";

export function UpdateLogButton() {
  const { user, loading } = useAuth();
  const [updates, setUpdates] = useState<Update[]>([]);
  const [hasUnseen, setHasUnseen] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: allUpdates } = await supabase
        .from("app_updates")
        .select("id,version,title,content,created_at")
        .eq("published", true)
        .order("created_at", { ascending: false });
      if (cancelled) return;
      const list = (allUpdates ?? []) as Update[];
      setUpdates(list);
      if (list.length === 0) return;

      const latest = list[0];
      let seen = false;

      if (user) {
        const { data: seenRow } = await supabase
          .from("user_seen_updates")
          .select("version")
          .eq("user_id", user.id)
          .eq("version", latest.version)
          .maybeSingle();
        seen = !!seenRow;
      } else {
        seen = localStorage.getItem(SEEN_KEY) === latest.version;
      }

      if (!cancelled) setHasUnseen(!seen);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, loading]);

  const handleOpen = async () => {
    setOpen(true);
    if (updates.length === 0) return;
    const latest = updates[0];

    if (user) {
      await supabase
        .from("user_seen_updates")
        .insert({ user_id: user.id, version: latest.version })
        .then(() => {});
    } else {
      localStorage.setItem(SEEN_KEY, latest.version);
    }
    setHasUnseen(false);
  };

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleOpen}
        className="relative h-7 px-2 text-xs"
        title="Update Log"
      >
        <Bell className="w-3.5 h-3.5 mr-1" />
        <span className="hidden md:inline">Updates</span>
        {hasUnseen && (
          <span className="absolute -top-1 -right-1 flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-destructive" />
          </span>
        )}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Update Log</DialogTitle>
            <DialogDescription>All published updates and patch notes.</DialogDescription>
          </DialogHeader>
          <div className="overflow-auto scroll-thin space-y-3 pr-1">
            {updates.length === 0 && (
              <div className="text-sm text-muted-foreground py-4 text-center">
                No updates published yet.
              </div>
            )}
            {updates.map((u) => (
              <div key={u.id} className="rounded-lg bg-secondary/40 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold">v{u.version}</div>
                  <div className="text-[11px] text-muted-foreground shrink-0">
                    {new Date(u.created_at).toLocaleDateString()}
                  </div>
                </div>
                {u.title && (
                  <div className="text-xs text-primary font-medium mt-0.5">{u.title}</div>
                )}
                <div className="text-xs text-muted-foreground whitespace-pre-wrap mt-1.5">
                  {u.content}
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
