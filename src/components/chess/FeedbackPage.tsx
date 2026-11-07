import { useState } from "react";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MessageCircle, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/useAuth";

const FEEDBACK_CATEGORIES = ["Bug Report", "Feature Request", "General Feedback"] as const;

type Category = (typeof FEEDBACK_CATEGORIES)[number];

const schema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  message: z.string().trim().min(3, "Message is too short").max(2000),
  category: z.enum(FEEDBACK_CATEGORIES),
});

export function FeedbackPage() {
  const { user, profile } = useAuth();
  const [name, setName] = useState(profile?.username ?? "");
  const [message, setMessage] = useState("");
  const [category, setCategory] = useState<Category>("Bug Report");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submittedAt, setSubmittedAt] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    const parsed = schema.safeParse({ name, message, category });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }
    if (!user) {
      setError("You must be signed in.");
      return;
    }
    setSubmitting(true);
    const { error: insertErr } = await supabase.from("feedback").insert({
      user_id: user.id,
      name: parsed.data.name,
      message: parsed.data.message,
      category: parsed.data.category,
    });
    setSubmitting(false);
    if (insertErr) {
      setError(insertErr.message);
      return;
    }
    setSubmittedAt(new Date().toLocaleString());
    setMessage("");
  };

  return (
    <div className="max-w-xl mx-auto pt-10 md:pt-16 pb-12 space-y-6">
      <Card className="bg-card">
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <MessageCircle className="w-4 h-4 text-primary" />
            <CardTitle className="text-base">Feedback / Report</CardTitle>
          </div>
          <CardDescription>
            Report bugs, suggest features, or share general feedback. Submissions are reviewed by
            the owner.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-xs">Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              maxLength={80}
              className="mt-1"
            />
          </div>

          <div>
            <Label className="text-xs">Category</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as Category)}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FEEDBACK_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">Message</Label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={6}
              placeholder="Describe the bug, idea, or feedback in detail…"
              maxLength={2000}
              className="mt-1"
            />
            <p className="text-[10px] text-muted-foreground mt-1 text-right">
              {message.length}/2000
            </p>
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}
          {submittedAt && (
            <div className="flex items-center gap-2 rounded-md bg-success/10 border border-success/30 px-3 py-2 text-xs text-success">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Thanks! Submitted at {submittedAt}.
            </div>
          )}

          <Button
            onClick={submit}
            disabled={submitting}
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-semibold"
          >
            {submitting ? "Sending…" : "Send Feedback"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
