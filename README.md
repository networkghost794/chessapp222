# Elo Engine

Create a modern, responsive single-page Chess Web Application styled elegantly like Chess.com, optimized for playing matches against custom AI bots. ### Visual & Design Requirements: - Theme & Aesthetic: Use a polished dark mode layout utilizing charcoal backgrounds (#312e2b), clean cards with smooth rounded corners, and clear text hierarchies. - Interface Components: 1. Main Workspace Layout: A prominent, interactive 8x8 grid chessboard centered on the screen supporting fluid drag-and-drop mechanics. 2. Side Control Panel: An active panel containing a visible game move history list log, quick control utility buttons ("New Game", "Flip Board", "Reset Layout"), and a dynamic system console panel. 3. Connection Hub: A prominent, collapsible "Custom Bot Bridge Configuration" card. This card must contain a text input box labeled "Local Engine Endpoint URL" (defaulting to: http://127.0.0) and a status connectivity indicator light. ### Interactive Architecture & Move Loop: - Rules Execution: Integrate an immediate client-side chess validation rules system (using an embedded solution like chess.js) to accurately block illegal dragging options, handle pawn pawn promotion selects, checkmate detection, and state calculations instantly. - Graphic Rendering: Utilize clear chess piece assets (like the standard Wikipedia theme vector sets) to cleanly show piece movements. - Game Loop Pipeline: - When the user successfully drops a piece on a legal destination coordinate tile, log the move to the display sheet history and pause the interface for a 250ms delay. - After the delay, execute a POST web fetch request to the configured Engine Endpoint URL. - Payload Structure: Send a JSON string containing the full move sequence array, structured exactly like: {"moves": ["e2e4", "e7e5", "g1f3"]} - Response Handling: Expect a return JSON string with the key {"bot_move": "g8f6"}. When the payload returns, execute the corresponding bot move onto the active visual board grid. - Fallback Engine: If the custom server configuration is unreachable or drops a request error, fallback automatically to a fast local browser move select calculation (such as random legal moves or a fast mini-max evaluation algorithm) and print an operational warning trace inside the sidebar log console so the match stays completely active.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://chessapp222.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/94138a78-4af9-45ac-94e5-292e462e8801).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
