## Scope

Five connected changes to the chess app. Keep all existing dark-theme styling, engine logic, layouts, and auth flows untouched. Only extend.

---

## 1. Owner Portal — "In the expected moves" subsection

Inside both the **Middlegame** and **Endgame** tabs of `OwnerPortal.tsx`, add a new card-styled subsection titled **"In the expected moves"** placed directly under the existing `PhaseEditor` (which becomes the "In the next move" section, with a small label added above it for symmetry).

The new subsection contains four compact spinner-style number inputs (Lucas Chess look — small `<Input type="number">` ~70px wide, label on the left, value on the right):

- Keep the two bishops
- Advance
- Make check
- Capture

Range 0–100, default values: 45 / 20 / 10 / 5. Helper text under the title:

> "This section controls long-term move preferences and personality tendencies over multiple moves, similar to the Lucas Chess personality system. Higher values increase the likelihood of the bot preferring these move types strategically over time rather than only on the immediate next move."

Persistence: extend `PhaseConfig` in `botStore.ts` with `expected: { keepBishopPair, advance, check, capture }`. Saved into the existing `middlegame_settings` / `endgame_settings` JSONB columns — no migration needed. Loaded back into the form when editing.

Engine integration: in `chooseBotMove`, after the existing immediate-move style weighting, apply an additional multiplicative bonus to candidate moves based on the `expected` weights, evaluated against the resulting position 1–2 plies deeper (using the existing Stockfish PV continuation). Does NOT override engine evaluation — only adjusts the personality weighting layer.

## 2. Bot library restructure (chess.com style)

Refactor `BotRoster.tsx` to use shadcn `Accordion` with six categories, all **collapsed by default**:

- Beginner Bots
- Intermediate Bots
- Advanced Bots
- Special Event Bots
- Creator Bots (any bot with `created_by` set)
- Top Player Bots

Add `tier` value support for the new categories in the Owner Portal category dropdown. Each row inside a category shows: avatar, name, Elo — same card style as today, just grouped under collapsibles.

## 3. Match start screen

Insert a new "Match Setup" screen in `ChessApp.tsx` between clicking **Play Match** and the live board.

Layout: centered chessboard preview (start position, non-interactive), player info card on the left (username, avatar, Elo), bot info card on the right (avatar, name, Elo). Large green **Start Game** button below. Only on click does the actual match begin.

## 4. Live match UI polish (chess.com style)

Keep the existing board component and theme. Reorganize the surrounding panels:

- Top bar: bot avatar + name, "Player vs Bot" line, Elo comparison
- Right sidebar: real-time PGN-style move list (already partially present — formalize), optional captured-pieces row underneath

No engine or rules changes.

## 5. Bot dialogue / voice lines

**Owner Portal — General tab**: new "Bot Dialogue Lines" textarea (one line per row). Saved into `custom_bots` as a new JSONB field `dialogue_lines` (string[]). Migration adds the column with default `'[]'::jsonb`.

**Live match**: new `BotChatBubble.tsx` overlay above the bot info panel. While a match is active:

- Pick a random line every 60–120 seconds
- Fade in, hold 4s, fade out
- Cooldown enforced so bubbles never overlap
- No bubbles outside active match

Built-in bots fall back to a small default line pool.

---

## Technical details

**Files to edit**

- `src/lib/botStore.ts` — extend `PhaseConfig` with `expected`, extend `CustomBot` with `dialogueLines`, extend `publishBot`, factor `expected` weights into `chooseBotMove`.
- `src/components/chess/OwnerPortal.tsx` — add expected-moves subsection in Middlegame + Endgame tabs, add dialogue-lines textarea in General tab, add new tier options.
- `src/components/chess/BotRoster.tsx` — convert to Accordion with six categories, collapsed by default.
- `src/components/chess/ChessApp.tsx` — match-setup screen state machine, top bar redesign, right sidebar move list + captured pieces, mount `BotChatBubble`.
- `src/components/chess/BotChatBubble.tsx` _(new)_ — fade-in/out speech bubble with cooldown timer.

**Migration**

- `ALTER TABLE custom_bots ADD COLUMN dialogue_lines jsonb NOT NULL DEFAULT '[]'::jsonb;`

**Non-goals**

- No changes to auth, Elo math, Owner PIN, bathroom break, profile system, or Stockfish engine logic.
- No restyle of existing tokens, no new colors.
