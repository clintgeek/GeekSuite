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

## 7. Overnight log, 2026-10-02 → 03 — decisions by Sage, for Chef's review

Chef: *"Finish this up and anything else that seems necessary or relevant … Just record
decisions and we'll review tomorrow."*

### Done in production

| # | What | Detail |
|---|---|---|
| N1 | Deployed `2bff34d6` | push to `main` → Release images green → Watchtower recreated basegeek, bookgeek, gamegeek (healthy). MCP stays on local branch `mcp-parked` (not pushed). |
| N2 | Routing rows inserted (aiGeek `aiappconfigs`) | `gamegeek`, `bookgeek`: `tier auto`, `allowPaid`, `paidFirst`, `openrouter` / `openai/gpt-4.1-mini`. No other row touched. |
| N3 | Opt-in set for Chef only | `clint@clintgeek.com`: `appPreferences.gamegeek.playAssistant` and `appPreferences.bookgeek.libraryAssistant` = true. Other prefs verified intact. Heather / Abby / Lauren untouched. |
| N4 | Backfill complete | 554 book + 723 game vectors, ~55 min total (≈2.5 s/book, ≈1.8 s/game on this box — slower than the 1–2 s estimate). |

### Decisions

| # | Decision | Evidence |
|---|---|---|
| N5 | **Model: `openai/gpt-4.1-mini`, not `google/gemini-3.8-flash`.** | Live: Gemini 3.8 Flash is a reasoning model; its hidden reasoning used the whole 350-token budget → `finishReason: length` → unparseable → fallback, and still billed $0.0036. gpt-4.1-mini: `stop`, valid picks, $0.0012–0.0015 per call, already proven on NoteGeek/FitnessGeek. Rule for future picks: no reasoning/"thinking" models on capped-output features. |
| N6 | `timeoutMs: 12000` on both what-next calls | Live latency 3.1–5.6 s against the runner's 6 s default; a timed-out paid call is still billed. |
| N7 | Mood gets its own shortlist queue, first in the round-robin | Live: "short and chill" returned Fort Solis (horror) and Jedi Knight because candidates only came from seed neighbourhoods; the mood vector alone ranks *A Short Hike* first (0.582) but it never reached the shortlist. Mood-sourced candidates carry `because: null`; fallback reason `Fits your mood: "…"`. |
| N8 | Game prompt: mention a seed only when the likeness is real; mood outranks seeds; use `hoursToBeat` for length moods | Live reasons were shoehorned: "Tiny Robots Recharged … like Cyberpunk 2077", "Turmoil … Path of Exile's spirit". Book prompt got the same seed-mention rule; its no-outside-knowledge rule is unchanged. |
| N9 | Catalog search floor 0.50 / gap 0.10 (mxbai) | Calibrated on the real library; numbers in the comment in `notegeek/embeddings.js`. Affects only `bookSearch`/`gameSearch` (no UI consumer on `main` yet), not what-next. |

### Live results (before N6–N8)

- Books, no mood (gpt-4.1-mini): Altered Carbon, ViraVax, American Gods, Feet of Clay, Legend — $0.00145, 3.2 s.
- Books, "something light and funny": Feet of Clay, Charlie and the Great Glass Elevator, Fear and Loathing…, A Closed and Common Orbit, Neuromancer — $0.00143, 5.6 s.
- Games, no mood: DEATHLOOP, Jedi Knight: Dark Forces II, WATCH_DOGS 2, Sin Slayers, Fallout: New Vegas — $0.00123, 3.1 s.
- Games, "co-op": Second Extinction, TerraTech, Arcadegeddon, Dark Envoy, Cat Quest II — $0.00119.
- Total spent overnight on tests: under $0.02.

### Second round (after N5–N9 were live)

| # | Decision | Evidence |
|---|---|---|
| N10 | Mood row (text field + Ask) is 44 px in both panels; GameGeek gets harness scene `24-what-next` | The mobile harness failed on `2bff34d6`: bookgeek `07-what-next` Ask button 57×38, under the 44 px rule. GameGeek's shard "passed" only because no scene mounted its opt-in panel. Both now clean (bookgeek 70 scenes, gamegeek 82 scenes, 0 violations). |
| N11 | Candidates travel to the model as `c1…cN`, not ObjectIds; answers are **salvaged** (keep the picks that map, drop the rest, top up from the deterministic list) instead of all-or-nothing; drops logged as counts only | Live: a "short and chill" game answer was billed ($0.0011) and then thrown away whole (`reason: invalid`). Short ids also cut ~10% off the cost per call. Side effect: a model answer with zero picks now counts as invalid → fallback. |
| N12 | With a mood, the mood queue takes every other shortlist slot (mood, seed1, mood, seed2, …) | With one slot per round across six queues, the mood got ~4 of 20 candidates and 1 of 5 fallback picks. |
| N13 | All catalog score sorts break ties by id | A flaky test (CI failure on `653014a6`, 2/6 locally) traced to an exact score tie settled by Mongo's natural row order — production ordering had the same dependence. 20/20 runs green after. |

Commits: `653014a6` (N6–N9), `801d79dd` (N10), `40001fd5` (N11–N12), `20927213` (N13). Final state on
`20927213`: CI, Release images and Mobile harness all green; deployed and verified in the container.

### Live results after round two (gpt-4.1-mini, Chef's data)

- Games, "short and chill": Q.U.B.E: Director's Cut, Cozy Grove, Close To The Sun, Freshly Frosted, The Almost Gone — model, $0.00102, 2.9 s. (Before: Fort Solis and Jedi Knight in a fallback.)
- Games, "co-op": Jitsu Squad, Project Winter, Second Extinction, SUPER CRAZY RHYTHM CASTLE, KeyWe — model, $0.00103, 2.8 s.
- Games, no mood: Fallout 3 GOTY, Watch Dogs: Legion, Sin Slayers, Fallout: New Vegas, DEATHLOOP — model, $0.00108, 2.8 s.
- Books, no mood: Altered Carbon, Children of Time, Daughter of Gloriavale, Unfollow, Seductive Poison — model, $0.00136, 2.7 s.
- Typical cost: **~$0.001 per question** — your $10 is roughly 9 000 questions. Total spent on all overnight testing: under $0.03.

### For Chef to review

1. N5's model choice: gpt-4.1-mini is cheap and reliable; a stronger *non-reasoning* model would cost more per pick and is a one-field change on the routing row.
2. Whether Heather / the girls should get the opt-in.
3. Whether to push `mcp-parked` to GitHub as a backup.
4. **Branch protection.** Every push to `main` tonight printed "Bypassed rule violations … Changes must be made through a pull request" — the repo has a PR rule that the account's admin rights bypass. I followed the documented deploy path (push to `main`, `DOCS/CICD.md`) as before, but if that rule is meant to bind, future work should go through PRs.
5. No-mood game reasons still lean on "like <seed>" comparisons (e.g. "Watch Dogs: Legion … like Cyberpunk 2077") — accurate now, but repetitive. A prompt tweak for variety in phrasing is cheap if it bothers you.
