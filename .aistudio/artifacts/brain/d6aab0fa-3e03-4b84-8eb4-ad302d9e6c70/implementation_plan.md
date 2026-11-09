# Implementation Plan: Strict Opening Book Following & Removal of Placeholder Repertoire

## User Request Summary
- **Strict Opening Book Execution**: Ensure bots with an opening book (`bookUrl` or `bookBin`) play directly from the book when the position is in-book (weighted by book move frequency/weight). The opening book moves will no longer be diluted, filtered out by centipawn tolerance, or overridden by blunders/human mistake layers.
- **Disable Built-in Placeholder Openings**: For bots without a custom uploaded opening book, remove the built-in placeholder openings (`repertoire.ts`). Bots will calculate opening moves directly with the engine according to their configured Elo, personality, and style from move 1.

---

## Detailed Findings from Research
1. **Soft Influence Issue**: In `src/lib/botStore.ts` (lines 819–823), opening books were previously treated as a "candidate source only" (`bookFactor`). Book moves were never guaranteed; instead, Stockfish evaluated all legal moves, and if a book move differed by more than 5 centipawns or fell outside the candidate pool, it was discarded. Additionally, the human mistake and blunder injection layers could override book moves with random moves on move 1 or 2.
2. **Placeholder Repertoire Fallback**: When no custom book was uploaded, `repertoireMove()` in `src/lib/repertoire.ts` picked one of 25 hardcoded openings based on a hash of the bot's ID. This made bots play arbitrary fixed opening sequences (like Catalan, English, or London) instead of calculating moves organically.

---

## Proposed Changes

### 1. Update `src/lib/botStore.ts`
- **Direct Book Execution in `chooseBotMove`**:
  - In section 1 of `chooseBotMove`: if `bot.opening.enabled` is true, a book is present (`bookBin` or `bookUrl`), and `game.history().length < maxBookDepth`:
    - Lookup the current position using `lookupPolyglot(book, polyglotHash(game))`.
    - If valid legal entries are found, select a move directly from the book weighted by each entry's weight (or the top entry if mode is best).
    - Convert to a `VerboseMove` and return immediately with `{ move, source: "book" }`.
  - Skip engine calculation, centipawn filtering, and blunder injection while in book, guaranteeing 100% adherence to the user's opening book.
- **Remove Built-in Repertoire Fallback**:
  - Remove lines 848–861 that fell back to `repertoireMove()`.
  - If a bot does not have an uploaded book (or when it leaves book theory), execution seamlessly transitions directly to the Stockfish engine pipeline.

### 2. Update `src/components/chess/StudioBotEditor.tsx`
- Update the Opening card description:
  - Replace `"No book uploaded — built-in repertoire is used."` with `"No custom book uploaded — calculates moves with engine from move 1."`
  - When a book is loaded, indicate that book moves are followed directly.

---

## Verification Plan
1. **Compilation & Linting**: Run `compile_applet` and `lint_applet` together to verify 0 errors.
2. **Move Generation Verification**:
   - Verify that when a bot has an opening book, `chooseBotMove` returns `{ move, source: "book" }` immediately for in-book positions.
   - Verify that when a bot does not have a book, it calculates moves directly via Stockfish with `{ move, source: "engine" }` without playing hardcoded placeholder lines.
3. **Runtime & Dev Server**: Confirm dev server returns HTTP 200.
