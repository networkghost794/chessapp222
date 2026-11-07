import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { Trash2, Megaphone, Save, Plus } from "lucide-react";

type Update = {
  id: string;
  version: string;
  title: string | null;
  content: string;
  published: boolean;
  created_at: string;
};

/** Owner-only update log manager. Server-side RLS enforces write access. */
export function UpdateLogManager() {
  const [updates, setUpdates] = useState<Update[]>([]);
  const [version, setVersion] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [published, setPublished] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error: err } = await supabase
      .from("app_updates")
      .select("*")
      .order("created_at", { ascending: false });
    if (err) {
      setError(err.message);
      return;
    }
    setUpdates((data ?? []) as Update[]);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const create = async () => {
    setError(null);
    if (!version.trim() || !content.trim()) {
      setError("Version and content are required.");
      return;
    }
    setBusy(true);
    const { data: userData } = await supabase.auth.getUser();
    const { error: err } = await supabase.from("app_updates").insert({
      version: version.trim(),
      title: title.trim() || null,
      content: content.trim(),
      published,
      created_by: userData.user?.id ?? null,
    });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setVersion("");
    setTitle("");
    setContent("");
    setPublished(true);
    load();
  };

  const togglePublished = async (u: Update) => {
    const { error: err } = await supabase
      .from("app_updates")
      .update({ published: !u.published })
      .eq("id", u.id);
    if (err) setError(err.message);
    else load();
  };

  const remove = async (u: Update) => {
    const { error: err } = await supabase.from("app_updates").delete().eq("id", u.id);
    if (err) setError(err.message);
    else load();
  };

  return (
    <div className="space-y-4">
      <Card className="p-3 space-y-3 bg-background/40">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Plus className="w-4 h-4 text-primary" /> Create patch note
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Version</Label>
            <Input
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              placeholder="e.g. 1.0.3"
            />
          </div>
          <div>
            <Label className="text-xs">Title (optional)</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What changed"
            />
          </div>
        </div>
        <div>
          <Label className="text-xs">Content</Label>
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={5}
            placeholder="Owner-written changelog…"
            className="font-mono text-xs"
          />
        </div>
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-xs">
            <Checkbox checked={published} onCheckedChange={(v) => setPublished(!!v)} />
            Publish immediately
          </label>
          <Button
            onClick={create}
            disabled={busy}
            size="sm"
            className="bg-success text-primary-foreground hover:bg-success/90"
          >
            <Save className="w-3.5 h-3.5 mr-1" /> {busy ? "Saving…" : "Save"}
          </Button>
        </div>
        {error && <div className="text-xs text-destructive">{error}</div>}
      </Card>

      <div className="space-y-2">
        <div className="text-sm font-semibold flex items-center gap-2">
          <Megaphone className="w-4 h-4 text-primary" /> All updates
        </div>
        {updates.length === 0 && (
          <div className="text-xs text-muted-foreground">No updates yet.</div>
        )}
        {updates.map((u) => (
          <Card key={u.id} className="p-3 bg-background/40">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">
                  v{u.version}{" "}
                  {u.title && (
                    <span className="text-muted-foreground font-normal">· {u.title}</span>
                  )}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {new Date(u.created_at).toLocaleString()} · {u.published ? "Published" : "Draft"}
                </div>
                <pre className="text-xs whitespace-pre-wrap font-sans mt-1.5 text-muted-foreground">
                  {u.content}
                </pre>
              </div>
              <div className="flex flex-col gap-1 shrink-0">
                <Button size="sm" variant="secondary" onClick={() => togglePublished(u)}>
                  {u.published ? "Unpublish" : "Publish"}
                </Button>
                <Button size="sm" variant="destructive" onClick={() => remove(u)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
