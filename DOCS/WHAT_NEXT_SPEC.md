# Specification: "What should I play / read next?" — vector shortlist + one model call

Status: approved for build 2026-10-02. Supersedes the MCP route for this question; the MCP
work (`DOCS/MCP_SPEC.md`) is parked, not deleted.

## 1. Intent

Chef (2026-10-02): *"use the local embedding model to reduce the majority of important data
about a book or game into a local vector set … compare something sensible like top rated
games or recently played … take maybe the top … 5, use that to find the top 20 out of the
library and send only those 20 to a frontier model via openrouter and come back with an
answer that would be significantly better than just guessing or random selection"* — at
**$0.01 or less per question** (*"I don't want some $1 per search bullshit"*). Notes are out
of scope (*"we can forget notes for now"*).

## 2. Chef's decisions (2026-10-02)

- Seeds: **loved + recent mix**, 5 total.
- Outside knowledge: **yes, for games** (the model may use what it knows about a game).
  Books keep BookGeek's existing rule (data only, no plot/spoilers) — not re-decided.
- **Optional mood box** ("short", "co-op", "chill") that steers the shortlist and the model.
- Scope: **games and books** in the first build.

## 3. Requirements

- **W1** One question = at most ONE model call, through `services/aiFeatureRunner.js`
  (routing row, per-user daily cap, fallback, provenance). No agent loop, no tool calls.
- **W2** The shortlist is computed locally from the catalog vectors (Stage 1b indexer,
  `graphql/catalog/`). Only the shortlist (≤ 20 candidates) and the 5 seeds leave the box.
- **W3** Per-call payload is small enough that the governor's per-call estimate stays under
  `AI_PAID_PER_CALL_USD` ($0.01) on a cheap-frontier model: ≤ ~2k input tokens, `maxTokens`
  ≤ 350 for the reply.
- **W4** Always answers. AI off/opt-out, cap hit, governor refusal, aiGeek down, bad JSON →
  the deterministic fallback: the shortlist's own order with a "because you loved X" reason.
  No vectors yet → the existing pre-vector behaviour (books: today's `whatNext` candidate
  rule; games: owned unplayed, recently added first).
- **W5** The model may only return ids from the shortlist (existing `validatePicks` rule).
- **W6** Never sent: reviews, notes, session notes, file paths, profile data.
- **W7** Opt-in per app, default off, server-side check — same as BookGeek's
  `libraryAssistant`.

## 4. Design (Sage, open for review)

| # | Decision |
|---|---|
| X1 | **Seeds (games)**: 3 loved — caller's GamePlayer rows ordered favorite desc, rating desc, hoursPlayed desc (rating ≥ 4 or favorite or ≥ 5 h) — then 2 most recent by `lastPlayedAt` not already chosen. Short on one pool → fill from the other. Only games with a vector count. |
| X2 | **Seeds (books)**: 3 loved — rating ≥ 4, most recently finished first — then the 2 most recently finished not already chosen. |
| X3 | **Shortlist = round-robin, not a centroid.** For each seed, rank the candidates by similarity to that seed (with a mood: `(sim(seed) + sim(mood)) / 2`); then take one from each seed's list in turn, skipping duplicates, until 20. Each candidate keeps `because` = the seed whose list it came from. Averaging seeds blurs distinct tastes into a vector close to none of them. |
| X4 | Mood text is embedded locally (`queryVector`, local Ollama). Mood with the embeddings service down → shortlist without the mood term; the mood is still passed to the model. |
| X5 | **Candidates**: games — owned household games the caller hasn't played (same rule as `gamesLike`: no GamePlayer row, or 0 h on no shelf / `backlog`). Books — BookGeek's existing `whatNext` rule (`IN_THE_LIBRARY` ∧ `NOT_FINISHED`). |
| X6 | **Model payload (games)**: `{ limit, mood, seeds: [{ title, genres, rating, hoursPlayed, why: 'loved'|'recent' }], candidates: [{ id, title, genres, tags (≤ 5), year, hoursToBeat, modes, because }] }`. No descriptions — the model knows the games (outside knowledge allowed). |
| X7 | **Model payload (books)**: today's `whatNextContext` fields for the ≤ 20 shortlisted candidates, plus `mood` and `because`; `recentlyFinished` unchanged. Prompt rule 4 (no outside knowledge) unchanged. |
| X8 | Output: `picks: [{ id, why }]`, default 5, max 10; `why` ≤ 90 chars, one sentence. `maxTokens: 350`. |
| X9 | `gameWhatNext(mood: String, limit: Int)` in the gamegeek gateway module, `{ app: 'gamegeek', feature: 'whatnext' }`, own `GAME_DAILY_CAP = 20`; opt-in `appPreferences.gamegeek.playAssistant`. BookGeek `whatNext` gains `mood: String`; same feature/cap/opt-in as today. |
| X10 | UI: GameGeek gets a "What should I play?" panel modelled on BookGeek's `WhatNextShelf` + `useWhatNext`; both panels get the optional mood box and show `AI-picked` / fallback provenance as BookGeek does now. |
| X11 | `games_like`/`books_like` (`recommendCatalog`) switch to the X3 round-robin too, so there is one shortlist implementation. |

## 5. Chef's part (configuration, not code)

In aiGeek → App Routing → `gamegeek` (and `bookgeek`): `allowPaid` + `paidFirst` with a
cheap-frontier OpenRouter model, if you want paid picks; otherwise the free rows answer.
The governor (`AI_PAID_PER_CALL_USD` $0.01, `AI_PAID_PER_DAY_USD` $0.05) bounds spend either
way.

## 6. Out of scope

Notes; free-form questions; the MCP endpoint (parked); any write.
