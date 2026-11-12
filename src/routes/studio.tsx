import { createFileRoute, Link } from "@tanstack/react-router";
import { AuthProvider, useAuth } from "@/lib/useAuth";
import { Customizer } from "@/components/chess/Customizer";
import { UpdateLogManager } from "@/components/chess/UpdateLogManager";
import { VerificationReviewPanel } from "@/components/chess/VerificationRequest";
import { Toaster } from "@/components/ui/sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Crown, ShieldAlert } from "lucide-react";
import React, { useState } from "react";
import { BotWorkshop } from "@/components/chess/BotWorkshop";
import { cn } from "@/lib/utils";
import { StudioBotEditor } from "@/components/chess/StudioBotEditor";
import { OpeningLab } from "@/components/chess/OpeningLab";

export const Route = createFileRoute("/studio")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Studio — BotBoard" },
      {
        name: "description",
        content: "Private workspace for managing BotBoard bots and settings.",
      },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Studio — BotBoard" },
      { property: "og:description", content: "Private BotBoard workspace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StudioPage,
});

class TabErrorBoundary extends React.Component<
  { name: string; children: React.ReactNode },
  { error: Error | null }
> {
  override state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  override componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error(`[Studio] Error in ${this.props.name}:`, error, errorInfo);
  }
  override render() {
    if (this.state.error) {
      return (
        <div className="p-8 rounded-xl border border-destructive/30 bg-destructive/10 text-center space-y-3 max-w-xl mx-auto my-6">
          <ShieldAlert className="w-8 h-8 text-destructive mx-auto" />
          <div className="text-sm font-bold text-destructive">
            Something went wrong loading {this.props.name}
          </div>
          <div className="text-xs text-muted-foreground font-mono">{this.state.error.message}</div>
          <Button size="sm" variant="outline" onClick={() => this.setState({ error: null })}>
            Try reloading tab
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}

function StudioUnlockGate() {
  const { user, claimOwner } = useAuth();
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    const res = await claimOwner(pin);
    if (!res.success) {
      setError(res.error || "Incorrect Master Override PIN.");
    }
    setBusy(false);
  };

  return (
    <div className="min-h-screen grid place-items-center bg-background px-4">
      <div className="max-w-md w-full p-6 sm:p-8 rounded-2xl border border-border bg-card shadow-2xl space-y-6 text-center">
        <div className="w-14 h-14 rounded-2xl bg-warning/15 ring-1 ring-warning/40 grid place-items-center mx-auto text-warning shadow-inner">
          <Crown className="w-7 h-7" />
        </div>
        <div className="space-y-1.5">
          <h2 className="text-xl font-bold tracking-tight text-foreground">BotBoard Studio</h2>
          <p className="text-xs text-muted-foreground">
            Private owner workspace for managing AI bot personalities, opening books, and app
            customization.
          </p>
        </div>

        {!user ? (
          <div className="space-y-3 pt-2">
            <p className="text-xs text-muted-foreground">
              Please sign in to your owner account to access Studio Mode.
            </p>
            <Link
              to="/"
              className="inline-flex items-center justify-center w-full rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <ArrowLeft className="w-4 h-4 mr-2" /> Back to Sign In
            </Link>
          </div>
        ) : (
          <form onSubmit={handleUnlock} className="space-y-4 pt-2 text-left">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                Master Override Code / PIN
              </label>
              <Input
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="Enter Master PIN (e.g. ChessUP2)"
                className="h-10 text-sm bg-background border-border"
                autoFocus
              />
              {error && <p className="text-xs text-destructive font-medium">{error}</p>}
            </div>

            <Button
              type="submit"
              disabled={busy || !pin.trim()}
              className="w-full h-10 font-bold bg-warning text-warning-foreground hover:bg-warning/90 shadow-md"
            >
              {busy ? "Unlocking…" : "⚡ Unlock Studio Mode"}
            </Button>

            <div className="text-center pt-2">
              <Link
                to="/"
                className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Return to Arena
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function StudioGate() {
  const { user, isOwner, loading } = useAuth();
  const [tab, setTab] = useState<
    "workshop" | "builder" | "openings" | "verify" | "updates" | "customize"
  >("workshop");
  const [editRequest, setEditRequest] = useState<{ id: string; n: number } | null>(null);

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center text-sm text-muted-foreground">
        <div className="flex flex-col items-center gap-2">
          <div className="w-6 h-6 border-2 border-warning border-t-transparent rounded-full animate-spin" />
          <span>Loading Studio…</span>
        </div>
      </div>
    );
  }

  if (!isOwner) return <StudioUnlockGate />;

  return (
    <div className="min-h-screen w-full bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-card/80 backdrop-blur">
        <div className="max-w-[1400px] mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-md bg-warning/15 ring-1 ring-warning/40 grid place-items-center">
              <Crown className="w-4 h-4 text-warning" />
            </div>
            <div>
              <div className="text-sm font-bold leading-tight flex items-center gap-2">
                BotBoard Studio
                {user?.email && (
                  <span className="text-[10px] font-normal text-muted-foreground/80 font-mono hidden sm:inline">
                    ({user.email})
                  </span>
                )}
              </div>
              <div className="text-[10px] text-muted-foreground">Owner workspace</div>
            </div>
          </div>
          <Link
            to="/"
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground px-2.5 py-1.5 rounded-md hover:bg-secondary/50 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Arena
          </Link>
        </div>
      </header>
      <div className="max-w-[1400px] mx-auto px-4 pt-4 flex gap-1 overflow-x-auto pb-1">
        {(
          [
            ["workshop", "Bot Workshop"],
            ["builder", "Bot Builder"],
            ["openings", "Opening Lab"],
            ["verify", "Verification"],
            ["updates", "Update Logs"],
            ["customize", "Customize App"],
          ] as const
        ).map(([id, l]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              "h-8 px-3 rounded-md text-xs font-semibold whitespace-nowrap transition-colors",
              tab === id
                ? "bg-warning/15 text-warning ring-1 ring-warning/40"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary/40",
            )}
          >
            {l}
          </button>
        ))}
      </div>
      <main className="px-4 pb-10">
        <div className={cn("max-w-[1400px] mx-auto mt-4", tab !== "workshop" && "hidden")}>
          <TabErrorBoundary name="Bot Workshop">
            <BotWorkshop
              onEdit={(id) => {
                setEditRequest((r) => ({ id, n: (r?.n ?? 0) + 1 }));
                setTab("builder");
              }}
            />
          </TabErrorBoundary>
        </div>
        <div className={cn("max-w-[1600px] mx-auto mt-4", tab !== "builder" && "hidden")}>
          <TabErrorBoundary name="Bot Builder">
            <StudioBotEditor editRequest={editRequest} />
          </TabErrorBoundary>
        </div>
        <div className={cn("max-w-[1600px] mx-auto mt-4", tab !== "openings" && "hidden")}>
          <TabErrorBoundary name="Opening Lab">
            <OpeningLab />
          </TabErrorBoundary>
        </div>
        <div className={cn("max-w-[1000px] mx-auto mt-4", tab !== "verify" && "hidden")}>
          <TabErrorBoundary name="Verification Review">
            <VerificationReviewPanel />
          </TabErrorBoundary>
        </div>
        <div className={cn("max-w-[1000px] mx-auto mt-4", tab !== "updates" && "hidden")}>
          <TabErrorBoundary name="Update Log Manager">
            <UpdateLogManager />
          </TabErrorBoundary>
        </div>
        <div className={cn("max-w-[1000px] mx-auto mt-4", tab !== "customize" && "hidden")}>
          <TabErrorBoundary name="Customizer">
            <Customizer />
          </TabErrorBoundary>
        </div>
      </main>
    </div>
  );
}

function StudioPage() {
  return (
    <AuthProvider>
      <StudioGate />
      <Toaster richColors theme="dark" />
    </AuthProvider>
  );
}
