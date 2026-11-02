import { createFileRoute, Link } from "@tanstack/react-router";
import { AuthProvider, useAuth } from "@/lib/useAuth";
import { OwnerPortal } from "@/components/chess/OwnerPortal";
import { Toaster } from "@/components/ui/sonner";
import { ArrowLeft, Crown } from "lucide-react";
import { useState } from "react";
import { BotWorkshop } from "@/components/chess/BotWorkshop";
import { cn } from "@/lib/utils";
import { TestBench } from "@/components/chess/TestBench";

export const Route = createFileRoute("/studio")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Studio — BotBoard" },
      { name: "description", content: "Private workspace for managing BotBoard bots and settings." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Studio — BotBoard" },
      { property: "og:description", content: "Private BotBoard workspace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StudioPage,
});

function NotFound() {
  return (
    <div className="min-h-screen grid place-items-center text-center px-6">
      <div>
        <div className="text-6xl font-black text-muted-foreground/40">404</div>
        <div className="mt-2 text-sm text-muted-foreground">Page not found</div>
        <Link to="/" className="mt-6 inline-block text-sm text-primary hover:underline">Go home</Link>
      </div>
    </div>
  );
}

function StudioGate() {
  const { user, isOwner, loading } = useAuth();
  const [tab, setTab] = useState<"workshop" | "bench" | "editor">("workshop");
  const [editRequest, setEditRequest] = useState<{ id: string; n: number } | null>(null);
  if (loading) {
    return <div className="min-h-screen grid place-items-center text-sm text-muted-foreground">Loading…</div>;
  }
  if (!user || !isOwner) return <NotFound />;
  return (
    <div className="min-h-screen w-full">
      <header className="sticky top-0 z-30 border-b border-border bg-card/80 backdrop-blur">
        <div className="max-w-[1400px] mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-md bg-warning/15 ring-1 ring-warning/40 grid place-items-center">
              <Crown className="w-4 h-4 text-warning" />
            </div>
            <div>
              <div className="text-sm font-bold leading-tight">BotBoard Studio</div>
              <div className="text-[10px] text-muted-foreground">Owner workspace</div>
            </div>
          </div>
          <Link to="/" className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Arena
          </Link>
        </div>
      </header>
      <div className="max-w-[1400px] mx-auto px-4 pt-4 flex gap-1">
        {([["workshop", "Bot Workshop"], ["bench", "Test Bench"], ["editor", "Bot Editor & Tools"]] as const).map(([id, l]) => (
          <button key={id} onClick={() => setTab(id)}
            className={cn("h-8 px-3 rounded-md text-xs font-semibold",
              tab === id ? "bg-warning/15 text-warning ring-1 ring-warning/40" : "text-muted-foreground hover:text-foreground")}>
            {l}
          </button>
        ))}
      </div>
      <main className="px-4 pb-10">
        <div className={cn("max-w-[1400px] mx-auto mt-4", tab !== "workshop" && "hidden")}>
          <BotWorkshop onEdit={(id) => { setEditRequest((r) => ({ id, n: (r?.n ?? 0) + 1 })); setTab("editor"); }} />
        </div>
        <div className={cn("max-w-[1400px] mx-auto mt-4", tab !== "bench" && "hidden")}>
          <TestBench />
        </div>
        <div className={cn(tab !== "editor" && "hidden")}>
          <OwnerPortal editRequest={editRequest} defaultOpen />
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
