import { createFileRoute } from "@tanstack/react-router";
import { ChessApp } from "@/components/chess/ChessApp";
import { AuthProvider, useAuth } from "@/lib/useAuth";
import { AuthScreen } from "@/components/chess/AuthScreen";
import { PlacementTest } from "@/components/chess/PlacementTest";
import { Toaster } from "@/components/ui/sonner";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "BotBoard — Play Chess vs Custom AI Bots" },
      {
        name: "description",
        content:
          "Modern chess arena to spar against your own AI engines. Drag-and-drop board, move history, and a custom bot bridge.",
      },
      { property: "og:title", content: "BotBoard — Chess vs Custom AI Bots" },
      { property: "og:description", content: "Spar against your custom chess engines in a polished dark arena." },
    ],
  }),
  component: Index,
});

function Gate() {
  const { user, profile, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }
  if (!user) return <AuthScreen />;
  return (
    <>
      <ChessApp />
      <PlacementTest open={!!profile && !profile.placement_done} />
    </>
  );
}

function Index() {
  return (
    <AuthProvider>
      <Gate />
      <Toaster richColors theme="dark" />
    </AuthProvider>
  );
}
