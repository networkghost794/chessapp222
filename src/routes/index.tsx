import { createFileRoute } from "@tanstack/react-router";
import { ChessApp } from "@/components/chess/ChessApp";

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

function Index() {
  return <ChessApp />;
}
