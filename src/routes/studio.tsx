import { createFileRoute, Link } from "@tanstack/react-router";
import { AuthProvider, useAuth } from "@/lib/useAuth";
import { OwnerPortal } from "@/components/chess/OwnerPortal";
import { Toaster } from "@/components/ui/sonner";
import { ArrowLeft, Crown } from "lucide-react";

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
      <main className="px-4 pb-10">
        <OwnerPortal />
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
