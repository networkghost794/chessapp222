import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { BadgeCheck, Check, X, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

const TITLES = ["", "GM", "IM", "FM", "CM", "NM", "WGM", "WIM", "WFM", "WCM"];

type Req = {
  id: string;
  user_id: string;
  username: string;
  federation: string;
  federation_id: string;
  official_rating: number;
  claimed_title: string | null;
  proof_url: string;
  notes: string | null;
  status: string;
  created_at: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tv = () => (supabase as any).from("title_verifications");

/** Player-facing card + form in Settings. */
export function VerificationCard() {
  const { user, profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [mine, setMine] = useState<Req[]>([]);
  const [fed, setFed] = useState<"FIDE" | "FQE">("FIDE");
  const [fid, setFid] = useState("");
  const [rating, setRating] = useState("");
  const [title, setTitle] = useState("");
  const [proof, setProof] = useState("");
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!user) return;
    const { data } = await tv()
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setMine((data as Req[]) ?? []);
  };
  useEffect(() => {
    load();
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const pending = mine.find((r) => r.status === "pending");

  const submit = async () => {
    setErr("");
    const r = Number(rating);
    if (!fid.trim()) return setErr("Enter your official ID number.");
    if (!Number.isFinite(r) || r < 100 || r > 3500)
      return setErr("Enter a rating between 100 and 3500.");
    if (!/^https?:\/\/\S+$/i.test(proof.trim()))
      return setErr("Proof must be a link starting with http:// or https://");
    if (!user || !profile) return;
    setBusy(true);
    const { error } = await tv().insert({
      user_id: user.id,
      username: profile.username,
      federation: fed,
      federation_id: fid.trim(),
      official_rating: Math.round(r),
      claimed_title: title || null,
      proof_url: proof.trim(),
      notes: notes.trim() || null,
    });
    setBusy(false);
    if (error) return setErr(error.message);
    setOpen(false);
    setFid("");
    setRating("");
    setTitle("");
    setProof("");
    setNotes("");
    load();
  };

  return (
    <div className="space-y-2">
      <Label className="text-xs text-muted-foreground">Official Rating Verification</Label>
      {profile?.verified_federation && (
        <div className="flex items-center gap-2 text-xs text-success">
          <BadgeCheck className="w-4 h-4" /> Verified {profile.verified_federation} player
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">
        Link your FIDE or FQE profile. Once the owner approves it, your rating and title are updated
        to match.
      </p>
      {pending ? (
        <div className="text-xs rounded-md border border-border/60 bg-secondary/40 px-3 py-2">
          Request pending review — {pending.federation} {pending.official_rating}
          {pending.claimed_title ? ` · ${pending.claimed_title}` : ""}
        </div>
      ) : (
        <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
          <BadgeCheck className="w-4 h-4 mr-1.5" /> Request verification
        </Button>
      )}
      {mine
        .filter((r) => r.status !== "pending")
        .slice(0, 2)
        .map((r) => (
          <div key={r.id} className="text-[11px] text-muted-foreground">
            Last request:{" "}
            <span className={r.status === "approved" ? "text-success" : "text-destructive"}>
              {r.status}
            </span>
          </div>
        ))}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Verify your official rating</DialogTitle>
            <DialogDescription>
              Provide a link to your official federation profile as proof.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              {(["FIDE", "FQE"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFed(f)}
                  className={cn(
                    "h-9 rounded-md border text-sm font-bold",
                    fed === f
                      ? "bg-primary/15 border-primary/50 text-primary"
                      : "bg-secondary/40 border-border/60",
                  )}
                >
                  {f}
                </button>
              ))}
            </div>
            <div>
              <Label className="text-xs">{fed === "FIDE" ? "FIDE ID" : "FQE member number"}</Label>
              <Input value={fid} onChange={(e) => setFid(e.target.value)} maxLength={40} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Official rating</Label>
                <Input type="number" value={rating} onChange={(e) => setRating(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Title (if any)</Label>
                <select
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
                >
                  {TITLES.map((t) => (
                    <option key={t} value={t}>
                      {t || "None"}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <Label className="text-xs">Proof link</Label>
              <Input
                placeholder={
                  fed === "FIDE"
                    ? "https://ratings.fide.com/profile/..."
                    : "https://www.fqechecs.qc.ca/..."
                }
                value={proof}
                onChange={(e) => setProof(e.target.value)}
                maxLength={500}
              />
            </div>
            <div>
              <Label className="text-xs">Notes (optional)</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={500}
                rows={2}
              />
            </div>
            {err && <p className="text-xs text-destructive">{err}</p>}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={busy}>
              {busy ? "Sending…" : "Submit request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Owner Portal review panel. */
export function VerificationReviewPanel() {
  const [rows, setRows] = useState<Req[]>([]);
  const [msg, setMsg] = useState("");
  const load = async () => {
    const { data } = await tv().select("*").order("created_at", { ascending: false }).limit(100);
    setRows((data as Req[]) ?? []);
  };
  useEffect(() => {
    load();
  }, []);

  const review = async (id: string, approve: boolean) => {
    setMsg("");
    const { error } = await supabase.rpc(
      "review_title_verification" as never,
      { _id: id, _approve: approve } as never,
    );
    if (error) setMsg(error.message);
    load();
  };

  const pending = rows.filter((r) => r.status === "pending");
  const done = rows.filter((r) => r.status !== "pending").slice(0, 15);

  return (
    <div className="space-y-4">
      {msg && <p className="text-xs text-destructive">{msg}</p>}
      <div className="text-sm font-semibold">Pending ({pending.length})</div>
      {pending.length === 0 && (
        <p className="text-xs text-muted-foreground">No pending requests.</p>
      )}
      {pending.map((r) => (
        <div
          key={r.id}
          className="rounded-md border border-border/60 bg-secondary/30 p-3 space-y-2"
        >
          <div className="text-sm font-semibold">{r.username}</div>
          <div className="text-xs text-muted-foreground">
            {r.federation} ID {r.federation_id} · Rating {r.official_rating}
            {r.claimed_title ? ` · Title ${r.claimed_title}` : ""}
          </div>
          <a
            href={r.proof_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary inline-flex items-center gap-1 break-all"
          >
            {r.proof_url} <ExternalLink className="w-3 h-3 shrink-0" />
          </a>
          {r.notes && <p className="text-xs">{r.notes}</p>}
          <div className="flex gap-2">
            <Button size="sm" onClick={() => review(r.id, true)}>
              <Check className="w-4 h-4 mr-1" />
              Approve
            </Button>
            <Button size="sm" variant="destructive" onClick={() => review(r.id, false)}>
              <X className="w-4 h-4 mr-1" />
              Reject
            </Button>
          </div>
        </div>
      ))}
      {done.length > 0 && (
        <>
          <div className="text-sm font-semibold pt-2">Recent</div>
          {done.map((r) => (
            <div key={r.id} className="text-xs text-muted-foreground">
              {r.username} · {r.federation} {r.official_rating} ·{" "}
              <span className={r.status === "approved" ? "text-success" : "text-destructive"}>
                {r.status}
              </span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
