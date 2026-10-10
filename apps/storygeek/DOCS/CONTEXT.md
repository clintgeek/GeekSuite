# StoryGeek — Context

This file is StoryGeek's project-context note (servers/ports/known-quirks), separate from
`DOCS/CONTINUITY.md` (the continuity-engine architecture — canon, facts, provenance) and
`LOCAL_DEV.md`/`SETUP.md` (dev setup). It didn't exist before 2026-09-05; this is its first
entry.

## Backend — zod input validation (2026-09-05)

TODO_ORDER #22 (input validation), storygeek slice. Every mutating REST route
(POST/PUT/PATCH/DELETE with a body or meaningful params) now runs a zod
schema first: `src/validation/validate.js` (mirrors
`apps/fitnessgeek/backend/src/validation/validate.js` exactly — same 400
envelope, `{ success: false, error: { message, code: 'VALIDATION_ERROR',
details: [{ path, message }] } }`) plus one schema file per route family
under `src/validation/schemas/` — `stories.js`, `characters.js`, `export.js`
(a thin re-export, see below), `auth.js`. Ids in params (`storyId`,
`characterName`'s neighbor-lookup, `characterId` in a relationship) are
checked as non-empty bounded strings, **not** Mongo ObjectIds, so a
malformed id still falls through to each route's existing "not found"
handling instead of validation reinterpreting it — same call as todogeek's
zod pass.

**Route families and what they enforce:**
- `stories.js` — `POST /start` (prompt required, ≤20000 chars; title/genre
  ≤200/100; description ≤5000; provider/model bounded strings, no fixed enum
  since aiService resolves them dynamically against basegeek's live list),
  `POST /:storyId/continue` (userInput required ≤20000 chars — this closes a
  real gap: the controller read `userInput.startsWith('/')` with **no**
  prior null-check, so a missing body previously 500'd; now a clean 400),
  `PATCH /:storyId/status` (status enum, mirrors `Story.status` exactly),
  `DELETE /:storyId` (storyId param only).
- `characters.js` — schemas mirror the **embedded** `characterSchema` in
  `models/Story.js` (this route family reads/writes `story.characters`, not
  the separate, effectively-dead standalone `models/Character.js`, which only
  `characterService.js` touches and no route calls). `POST /story/:storyId`
  and `PUT .../character/:characterName` validate the full character shape
  (status/relationshipType/learnedVia enums; knowledge/relationships/
  inventory/skills arrays ≤100 items — the model itself is unbounded).
  `storyId` is now checked by a router-level `validate()` mounted just ahead
  of `requireStoryOwner`, so a malformed id 400s before the extra Mongo round
  trip; `characterName`/`itemName` params get their own bounded-string check
  since `requireStoryOwner` doesn't see them.
- `export.js` — no body (bookify/epub only ever read `storyId` and the
  Authorization header); `schemas/export.js` re-exports the shared storyId
  params schema rather than duplicating it, wired the same router-level way
  as characters.js.
- `auth.js` — only `POST /refresh` had a validatable body (`refreshToken`,
  `app`); `app` is bounded to basegeek's `VALID_APPS` list (SSO_OVERVIEW.md/
  `DOCS/CONTEXT.md`'s SSO section). `GET /me` and `POST /logout` take no body
  worth checking (cookie/header only).
- `ai.js` — all three routes are GET with no body/params; nothing to
  validate, so there's no `schemas/ai.js` (a schema file with nothing in it
  would just be dead code).

zod pinned at `3.25.76` (same version fitnessgeek and basegeek's API pin).
35 new jest tests (41 → 76); node's `--test` suite (65) is untouched — it
covers services, not routes. Full route inventory, bounds rationale, and
what's still open for the rest of the suite: see the TODO #22 report.

## Frontend — shared feedback primitives (2026-09-05)

`GeekEmptyState` / `GeekErrorState` / `GeekToastProvider`+`useToast` / `toneForMode` (all
`@geeksuite/ui`) replaced this app's local `Alert`/inline-empty patterns — TODO_ORDER #15/#19
fan-out, the last app in the sequence; full detail in `DOCS/THE_UI_UNIFICATION_PLAN.md` §3a
"Feedback Primitives" ("storygeek — done 2026-09-05, the last app in the fan-out").

`GeekToastProvider` is mounted in `frontend/src/components/Layout.jsx`, inside `GeekShell` and
outside `GeekAppFrame` — new code should call `useToast()` for transient confirmations rather
than adding a local `Snackbar`.

Two load-gated surfaces now split their error into a dedicated state instead of reusing the
same one for both "surface can't open" and "fire-and-forget failure": `StoryList`'s `loadError`
(→ `GeekErrorState` with `onRetry={loadStories}`, in the same slot the empty-shelves
`GeekEmptyState` uses) and `StoryPlay`'s `loadError` (→ `GeekErrorState` with
`onRetry={loadStory}`, replacing what used to be an infinite spinner on a failed load — the
early `if (!story)` return had no error branch at all before this). Bookify's own export
failure (`StoryPlay`'s `exportError`) stays a compact `GeekErrorState` inside the `CodexDialog`
body rather than a toast — an empty dialog with nothing else to show is the primitive's own
"surface is empty because something failed" case, not a fire-and-forget notice; the
clipboard-copy failure that used to share that state now has its own `notify()` call so a
stale successful export never gets clobbered by a copy error.

Left alone (see the plan doc for the full reasoning): `StoryCreation.jsx`'s inline validation
(dialog/form-adjacent — the user is looking straight at the form); `Narration`'s in-story
markdown and the composer's `/recall /checkpoint …` status line (content, not feedback);
`StoryPlay`'s `getDiceColor` `isDark` ternary (distinct per-tier hex values, not a
lighten/darken pair — not the `toneForMode` shape); `theme.js`'s palette-construction `isDark`
ternaries (base-palette authoring); `LoginPage` (public route, outside
`GeekShell`/`GeekToastProvider`, same gap every sibling app left open).

No local `EmptyState`/`ErrorState`/toast component existed here to delete, and no local
`MuiTooltip` override exists to touch for #19's tooltip half.


## Frontend — the mobile-harness a11y pass (2026-09-05)

storygeek's 28 axe (wcag2a+aa) findings went to 0: `aria-label`s on the three
icon-only controls (per-card `Delete <title>`, composer `Send`, `Close journal`),
`tabIndex={0}` + `role="log"` + `aria-label="Story transcript"` on the play
transcript, and — the whole 14-finding contrast bucket — `palette.codex.goldMuted`
plus a darker light-mode `inkFaint` and light dice ramp replacing the
`alpha(gold, 0.6–0.7)` section labels that composited to 2.4–4.1:1; never wrap
`goldMuted` in `alpha()` again, that dilution *is* the bug.


## Visual identity — "Candlelit Table" (2026-09-27)

A tabletop RPG session at night: deep ink and oxblood surfaces, one warm candle, and
parchment as the material the tale is written on. Light mode is the same table by day
(pale oak, parchment sheets, oxblood ink), not the night palette inverted. It replaces
"Arcane Codex" and is deliberately unlike the suite's other identities (GameGeek's loud
stickers, BookGeek's navy library, NoteGeek's lab paper, ThingGeek's green ledger).

**Where it lives.** `frontend/src/theme/theme.js` (tokens on `theme.palette.candle.*`:
`table`, `paper`, `raised`, `page`, `ink`, `inkSoft`, `inkFaint`, `accent`,
`accentLabel`, `voice`, `rule`, `tone.{good,warn,bad,info,neutral}`, `wax`), plus
primitives in `components/primitives/` — `D20` (the motif: wordmark, dice, cards, empty
states), `WaxSeal` (provenance), `Candle` (the writing state), `Tag` (inked labels). The
old `palette.codex.*` slot is gone; read `palette.candle`.

**Type (self-hosted, `src/theme/fonts.js`; never Google at runtime).** Cinzel 600/700 for
titles; Cinzel Decorative 700 only for the drop cap; Alegreya 400/400i/500/700 for
narration and body; Alegreya Sans 400/500/700 for UI chrome and small labels. Packages:
`@fontsource/cinzel`, `@fontsource/cinzel-decorative`, `@fontsource/alegreya`,
`@fontsource/alegreya-sans`. No monospace font is loaded (JetBrains Mono is NoteGeek's).

**Measured text contrast (WCAG ratio).**

| Token | Night (on table / paper / raised / page) | Day (on oak / parchment / raised / page) |
|---|---|---|
| `ink` | #efe3c8 — 15.2 / 14.1 / 13.0 / 13.7 | #2a1a10 — 11.3 / 14.5 / 13.1 / 14.8 |
| `inkSoft` | #c9b99a — 10.0 / 9.3 / 8.6 / 9.0 | #5a4330 — 6.2 / 8.0 / 7.2 / 8.1 |
| `inkFaint` | #ab9a7e — 7.0 / 6.6 / 6.0 / 6.4 | #6b513a — 4.9 / 6.4 / 5.7 / 6.5 |
| `accent` | #e8a94a candle amber — 9.4 / 8.7 / 8.1 / 8.5 | #7a1f24 oxblood — 6.9 / 8.9 / 8.0 / 9.0 |
| `accentLabel` | #c7913e — ≥ 5.96 | #7a4e0e bronze — 4.84 on oak, ≥ 5.6 elsewhere |
| `voice` (player) | #e07a6e — ≥ 5.66 | #7a1f24 — as accent |
| tones | good #8fc49a ≥ 8.3, warn #f0c060 ≥ 9.8, bad #ff8a78 ≥ 7.2, info #9db4e0 ≥ 7.9 | good #2f5e3a ≥ 5.1, warn #6a4a00 ≥ 5.5, bad #8e1f22 ≥ 6.0, info #2e4a7a ≥ 6.0 |

Contained buttons: amber fill + #1d1208 text (8.9) at night, oxblood fill + #f9f0dc text
(8.7) by day. The canon scroll is parchment (#efdfb8) in **both** modes and renders under
`getScrollTheme()` (day inks re-measured on it: ink 12.7, soft 7.0, faint 5.6, bronze
5.4). The two traps: candle amber is only a text colour at night — by day it becomes
bronze ink; and **never wrap a text token in `alpha()`**, the dilution is the bug (same
rule as the old `goldMuted`). `Tag` is outlined ink over a ≤ 8% wash of itself, never a
filled chip, so 12px labels never depend on a fill. Wax seals are decorative; their
words sit beside them in page ink.

**The play screen.** The transcript is a page, not chat bubbles: GM narration is prose on
the `page` sheet at a ~38rem measure (17px phone, 19px desktop, line-height 1.7+); a
scene opening gets an illuminated drop cap (`::first-letter`, text untouched) and, after
the first, a ❦ break. "Scene opening" is inferred in `game/transcript.js#opensScene`: the
first narration, a `/reset-scene` answer (`opensScene: true`), or a new sitting (> 6h
gap). Player actions are set in, italic, ruled in the `voice` ink and attributed
"<name> · you". System messages are dashed "Table note" asides. `/recall` answers are the
sealed scroll (`components/play/CanonCard.jsx`) with a `WaxSeal` per fact
(You / Narrator / Opening · turn). A fresh reply scrolls to its **start**, not its end.

**Motion.** Candle flicker, page glow, writing dots, entry fade and card lift are all off
under `prefers-reduced-motion: reduce` (`index.css`, and `scrollIntoView` uses
`behavior: 'auto'`); every hover style is inside `@media (hover: hover)`.

**Harness.** Scenes 10–14 were added for this identity: `10-canon-card` (page-scoped
`/continue` route returning a canon payload, `fixtures.mjs#CANON`), `11-gm-writing`
(the turn is held open, then released in teardown), `12-commands`, `13-empty-list`,
`14-create`.

---

## Known quirk — the StoryPlay test stall (root-caused 2026-09-05)

`StoryPlay.test.jsx` was `describe.skip`ped for a day because every interaction test pinned
vitest/jsdom at 60-98% CPU. Not a jsdom/GeekSheet/transition problem at all: it was a genuine
infinite render loop. `loadStory()` ends with `setMessages(storyData.events.map(...))`, a fresh
array on every call, so the component always re-renders after a load; the effect that calls it
was keyed on the whole `user` object (`}, [storyId, user])`), and the test's
`vi.mock('@geeksuite/auth', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }))` minted a
new object on every call — so each load caused a render, each render a new `user` identity, and
each identity another load. (`StoryList` has the same effect shape and survived only by
accident: it calls `setStories(response.data)` with the same object reference, so React bails
out of the re-render.)

Fixed in `StoryPlay.jsx` by keying the effect on `user?.id`, and in the test by returning one
frozen auth object from the mock factory. Production was never affected — `AuthProvider`
`useMemo`s its context value — but the loop was one identity change away. Rule of thumb for
this repo: **effects depend on `user?.id`, never on `user`**, and an auth mock must return the
same reference every call.

## Service worker — SW reinstalls on deploy (2026-09-05, Q54)

`public/sw.js` had the same landmine as flockgeek (115fb03): a constant
`CACHE_NAME` and a static three-URL precache, so a new deploy never
reinstalled the SW and the `"/"` cached on a user's first visit was served
forever. Fixed the same way: `BUILD_ID`/`PRECACHE_ASSETS` placeholders in
`public/sw.js`, stamped into `dist/sw.js` by `swPrecache()` in
`vite.config.js` from the built `assets/*.js`/`*.css` list; `CACHE_NAME` is
now `storygeek-cache-${BUILD_ID}`. Dev (`vite dev`) still serves the source
file untouched — no build step there. See DOCS/PWA_STANDARD.md §1a.

---

## Going-over 2026-09-05 — the full read of `backend/` and `frontend/`

A senior-inheritance read of every route, controller, service, page and test in
both halves. Counts: backend `npm test` 65 node + 82 jest → 86 node + 88 jest;
frontend `npx vitest run` 43 → 61; frontend `npx eslint .` 3 warnings → 3;
backend `npx eslint .` 3 → 3; `npm run build` green; mobile harness
(`--app storygeek --enforce-a11y --viewports phone`) 18 scenes, 0/0/0.

### Fixed — frontend

- **P0 story creation was dead.** `StoryList`'s New Tale dialog posted
  `{ userId, prompt, title, genre }`, but `startStorySchema` is `.strict()` and
  has no `userId` — every submit 400'd with "Unrecognized key(s) in object:
  'userId'" and the player saw only "Failed to start story". The owner comes
  from the session (`requireAuth` in `storyController`), never from the body.
  Broke with this file's own zod pass. **`StoryList.test.jsx` was asserting the
  bug** (`expect.objectContaining({ userId: 'user-1' })` against a mocked
  `api.post`, which cannot see an extra key) — it now pins the body exactly.
- **P0 the `/create` page posted to a route that does not exist.**
  `StoryCreation.jsx` — linked from the sidebar as "Begin a Tale" — called
  `POST /api/stories`; `routes/stories.js` only ever defined `/start`. It then
  read `response.data._id` from a route that returns `{ storyId }`. Both fixed;
  the body names its fields one by one, because `...formData` also trips
  `.strict()`.
- **P1 the backend's error envelope never reached the player.** `api.js` was a
  bare axios instance, so every caller showed a hardcoded string or
  `err.message` — which for an axios rejection is only ever "Request failed
  with status code 400". A response interceptor now lifts
  `error.error.message` (plus its `details`) onto `err.message`, and the pages
  show it. This is why both P0s above presented as mystery outages.
- **P1 no client timeout anywhere.** axios defaults to `0` — wait forever — so
  a socket that hung rather than errored left "The narrator contemplates…" and
  a disabled composer on screen with no way out but a reload. 30s floor on the
  instance, `LONG_REQUEST_TIMEOUT_MS` (180s) at the three genuinely long calls
  (`/continue`, bookify, epub).
- **P1 a failed turn left a phantom bubble and ate the player's words.** The
  backend pushes the player event into the in-memory document and only
  `save()`s at the end of the turn, after the AI call — so on a provider error
  nothing is persisted and the bubble on screen vanishes on the next reload.
  The turn is taken back, the text is handed back to the composer, and
  `refreshStory()` runs so the mirror case (a client timeout on a turn the
  server actually completed) reconciles instead of leaving the UI one turn
  behind the record.
- **P1 `/char` labelled every character "(inactive)".** The controller already
  filters to the active cast and does not send `isActive`, so the falsy branch
  always won.
- **P1 `/info <place>` and `/timeout` dumped raw JSON at the player.** Neither
  had a `case`, so `handleSpecialResponse`'s `default` printed
  `Response: {"type":"location_info",...}` into the transcript. Both handled;
  the `default` now says something a human wrote and logs the payload instead.
- **P1 the EPUB button had no `disabled={exporting}`** (Bookify did), so it
  could be double-clicked into two full export runs, or started on top of a
  Bookify — both sharing one `exporting` flag.
- **P2** Bookify showed the *previous* export's text under the new progress
  bar with Copy/Share/Download live; switching `storyId` on a mounted
  `StoryPlay` left the previous tale's title, transcript and panels on screen
  (the `if (!story)` guard passes while `story` is stale); a `/back` checkpoint
  restore that failed to reload was stored in `loadError` and never rendered,
  so the player kept reading the pre-restore transcript; two object URLs were
  revoked in the same task as the click (Firefox/Safari can cancel the
  download); a persisted `{provider, modelId}` was never revalidated against
  the live list, so a retired model left the Settings `<Select>` out of range;
  the first-ever SW install fired `controllerchange` and reloaded a page the
  visitor was already reading (`index.html`, shared verbatim with bookgeek —
  both fixed); a stale comment in `StoryList.test.jsx` claimed the effect
  "re-fires on its own re-renders", which the `user?.id` rule already fixed.

### Fixed — backend

- **P1 `GET /api/stories/test-ai` and `/test-debug` were unauthenticated.**
  Both sat above `router.use(authenticateToken)`. `/test-ai` fires a real GM
  call at basegeek and `/test-debug` builds a full turn context and fires
  another — free AI spend on tap for an anonymous caller. `/test-debug` also
  answered failures with a stack trace and ran against a hardcoded story id
  (`6892311348766ff4a2c3c6c1`), belonging to whoever owns it. Now behind auth,
  against the caller's own newest story, with no stack in the response.
- **P1 a director failure was a total outage — there was no fallback path.**
  `STORYGEEK_FREE_ONLY` defaults on, so `resolveGMModel()` consulted
  `GET /api/ai/director/models` on **every turn**. That call needs the
  `ai:director` permission on `AI_GEEK_API_KEY` (Q1's pending restart); if the
  key lacks it — or basegeek is briefly down, or the request times out — the
  rejection propagated out of `generateStoryResponse` as "Failed to generate
  story response" and every turn of every story failed. The 2026-09-05 fix
  distinguished `[]` (an answer) from `null` (an outage) and negative-cached
  the failure.

  **Superseded 2026-09-07 (Phase 2).** The question was removed rather than
  answered better: StoryGeek no longer asks which models are free, because it
  no longer chooses one. `resolveGMModel`, `getFreeProviderModels`,
  `getDirectorModels` and `recommendProviderModel` are gone, `ai:director` is
  no longer a permission StoryGeek's key needs, and routing happens behind
  aiGeek's feature door (`POST /api/ai/feature`, `feature: 'gm' | 'aux'`,
  `conversationId: <storyId>`). See DOCS/CONTINUITY.md, "Model choice
  (aiService)". A turn that still cannot be served now answers **200**
  `{ type: 'ai_unavailable', reason, message }` in aiGeek's own words instead
  of a generic 500.
- **P1 `PUT /api/characters/story/:storyId/character/:characterName` destroyed
  the character.** It merged with `{ ...story.characters[idx], ...req.body }`,
  and a Mongoose subdocument's own enumerable properties are its internals
  (`$__`, `_doc`, `__parentArray`) — the schema fields are prototype getters
  over `_doc` — so the cast on assignment kept nothing but what the body
  supplied. A partial PUT reset the character to schema defaults and then 500'd
  on `name`/`description` being required. New `utils/mergeSubdocument.js`;
  `charactersValidation.test.js`'s doubles are plain objects, which is exactly
  why that suite stayed green through it, so the new test runs against the real
  embedded `characterSchema`.
- **P2** `getStorySummary` spread `undefined` (a 500) if a summary carried a
  keyword category the fixed shape doesn't know, and its comparator returned
  `NaN` for a detail with no `relevance`.
- **`routes/auth.js`'s basegeek proxies had no axios timeout** — axios defaults
  to `0`, so a *hung* basegeek parked the handler and the browser until the
  socket died. Now bounded by `BASEGEEK_TIMEOUT_MS` (default 8000), the same
  knob `packages/user`'s `validateToken` uses; a timeout carries no `.response`
  and lands in each handler's existing 502 branch, never a 401.

### Left in place, with reasons

- **`bookify` is unbounded work behind a synchronous request.** One AI call per
  six events, sequentially, at up to 45s each — a long story is minutes of held
  handler, and `POST .../epub` redoes the whole thing rather than reusing a
  Bookify the player just ran. Bounding it means either truncating the book or
  making it a job; both are design calls, not fixes. Reported.
- **`src/graphql/` is entirely dead** — nothing imports `GET_STORIES`/
  `GET_STORY`/the mutations, this backend has no GraphQL server (`app.js` 404s
  `/graphql`), and `GET_STORY` describes a shape the REST model no longer has.
  It still ships `@apollo/client` + `graphql` in the bundle. Deleting a module
  and its provider is Chef's call (Q38-class); reported.
- **`vite.config.js:105` defines `VITE_API_URL`, which nothing in `src/` reads**
  (`api.js` hardcodes `/api`). Dead define that reads like configuration.
- **Two concurrent `/continue` calls on one story last-write-wins the whole
  document.** The composer guards double-submit and two tabs is not a real
  usage pattern here; a proper fix is optimistic concurrency on `turnNumber`,
  which is a design change.
- **`api.js` sends no `Authorization` header**, so `userToken` is `undefined`
  in every controller and per-player free-tier quota attribution
  (`aiService.js`'s `userIdFromToken`) is always null. Cookie auth is clearly
  the intended design; whether losing the attribution is intended is a
  question, not a bug — reported.

## Night 2 — 2026-09-06 (Q38 / R119 — gateway module deleted, bookify guardrails)

Per `DOCS/STORYGEEK_GATEWAY_DECISION.md`'s recommendation (Option A — no live caller anywhere
in the suite) and Night 2's Q38/Q62 policy set:

- **Deleted** basegeek's gateway copy of storygeek —
  `apps/basegeek/packages/api/src/graphql/storygeek/` (typeDefs, resolvers, `models/Story.js`,
  298 lines) and its test (`__tests__/storygeekOwnership.test.js`, 172 lines) — plus the two
  import/merge lines in `apps/basegeek/packages/api/src/graphql/index.js`. Nothing else in that
  file was touched. Grepped the whole repo for `graphql/storygeek` first — the only two hits
  were the merge site and the test, both now gone; `gatewaySchemaLoads.test.js` doesn't name any
  per-app module by count or import, so it needed no change.
- **Deleted** the frontend's dead Apollo plumbing (never fired — no component imported it):
  `frontend/src/apolloClient.js`, `frontend/src/graphql/queries.js`,
  `frontend/src/graphql/mutations.js`, and the `ApolloProvider` wrap in `App.jsx` (the app now
  mounts `AuthProvider` directly instead of wrapping it in a provider with nothing under it).
- **Left in place, decision made:** the `@apollo/client` and `graphql` dependency lines in
  `frontend/package.json`. Removing them would desync `pnpm-lock.yaml`'s importer entry for
  `apps/storygeek/frontend` (the lockfile still pins specifiers for both), and fixing that needs
  `pnpm install --lockfile-only` — off-limits under tonight's no-`pnpm install` rule. They're
  genuinely unused now (nothing under `src/` imports either), so a follow-up pass that runs
  `pnpm install --lockfile-only` once (or full install) can drop them along with regenerating
  the lockfile; until then they're harmless dead lines, not a broken build. `@geeksuite/api-client`
  (also now unused — its only caller was the deleted `apolloClient.js`) was left alone too, same
  reasoning, and because pulling a workspace dependency wasn't in this stream's scope.
- **Bookify guardrails** (`backend/src/services/bookService.js`, Q62): the "left in place" item
  above ("bookify is unbounded work behind a synchronous request") gets two independent bounds,
  because a size cap alone doesn't bound wall-clock time and a time budget alone would still let
  a request run the whole way into a huge story before giving up:
  - `MAX_BOOKIFY_EVENTS = 60` — a story with more events than this is rejected before a single AI
    call is made (`BookifyTooLargeError`, `.code = 'BOOKIFY_TOO_LARGE'`).
  - `BOOKIFY_TIME_BUDGET_MS = 60000` — checked before starting each scene's AI call (and before
    the optional consistency-fix pass, where a tripped budget is swallowed by that step's
    existing best-effort `catch` rather than failing the whole run) and thrown as
    `BookifyTimeoutError` (`.code = 'BOOKIFY_TIMEOUT'`) if already exceeded.
  - `routes/export.js` maps `BOOKIFY_TOO_LARGE` → 413 and `BOOKIFY_TIMEOUT` → 504 (both bookify
    and epub, since epub calls bookify internally); anything else still 500s as before.
  - Both numbers are a judgment call, not measured off production data — 60 events is 10 scenes
    at the documented chunk size of 6; 60s matches the ask. Chef's call if either should move.
  - New test: `backend/src/__tests__/bookifyGuardrails.test.js` (node's `--test` runner, not
    jest — `jest.config.js`'s `testMatch` only covers `controllers/**` and `routes/**`, and this
    exercises the service directly). Uses `mock.timers.enable({ apis: ['Date'] })` to fake the
    clock forward as a side effect of the mocked AI call, rather than waiting out a real 60s in
    CI. 90 node tests now (was 86); jest untouched at 89.
- Verification: backend `node --test src/__tests__/*.test.js` 90/90 green; backend jest 89/89
  green; backend `npx eslint .` 3 warnings (unchanged); frontend `npx vitest run` 61/61 green
  (unchanged count); frontend `npx eslint .` 3 warnings (unchanged); frontend `npx vite build`
  green. Gateway-wide checks (`tools/syntax-check.mjs`, `tools/gql-arg-audit.mjs`, basegeek's
  `gatewaySchemaLoads.test.js`) were blocked at verification time by an unrelated, in-flight
  syntax error in `apps/basegeek/packages/api/src/graphql/bookgeek/typeDefs.js` (another Night 2
  stream's uncommitted work, confirmed via `git diff --stat` — not touched by this stream); the
  `index.js` edit here is a plain 3-line removal with nothing else nearby, and `syntax-check`
  named only the bookgeek file as the failure, not this one.
