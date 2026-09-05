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
handling instead of validation reinterpreting it — same call as bujogeek's
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
