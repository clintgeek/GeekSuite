# Work log — November 2026

What shipped, as it landed. Wanted-but-not-done lives in `SUITE_TODO.md`.

## 2026-11-14 — NoteGeek: sketches searchable by their handwriting

- **Automatic sketch transcription** (spec + as-built: `apps/notegeek/DOCS/AUTO_TRANSCRIBE_SPEC.md`).
  - The open sketch sends its page to the existing `transcribeSketch` (OpenRouter, via the
    gateway) ~90 s after the last pen stroke. Autosave never triggers it.
  - The gateway hashes what's saved (shapes and assets only), skips unchanged content, runs
    one request per sketch (an atomic claim), never lets an older result land on a newer
    one, and hands the text to the existing indexer.
  - Default ON, with a Settings toggle. Automatic runs get at most 30 a day; Convert keeps
    10.
  - Convert reuses a current transcript ("Transcribe again" spends a request), and
    corrections made in review are kept and never overwritten.
  - Photo notes keep their reviewed reading (free) and are never auto-read.
  - Word search now reads `wordText` (the transcript for sketches, the content for
    everything else). The old `{ title, content, tags }` text index is swapped once at
    gateway start-up, so sketch JSON no longer matches "draw"/"shape".
- **Pen side button erases** while held (Chef: "I'm on for eraser"); it scrolled since
  2026-09-29. A second button reported as the middle button scrolls — unverified on the
  Lenovo pen. `utils/penButton.js`, HANDWRITING.md §1.
- **Local-inference spike PARKED** before any code (`LOCAL_INFERENCE_SPEC.md`); the
  transformers.js install was backed out.
- **Earlier the same night:** the GeekSuite Login (StartGeek look), the NoteGeek one-bar
  toolbar, the Small pen default, and sketch paper — all live.

## 2026-11-13 — NoteGeek sidebar + sketch palette; backdrop service

- **NoteGeek** (`6f641af2`, pushed): the desktop sidebar collapses from a toggle in the
  top bar's left slot, remembered per device (`notegeek:navCollapsed`). On desktop the
  sketch editor's tldraw colour/size panel moved from top-right to bottom-left, above
  the zoom controls. The move is a CSS override against tldraw 2.4.6 class names.
  Checks: 837 tests, harness 234 scenes clean.
  Follow-up (Chef, after tablet testing): the panel goes bottom-RIGHT, not left — lifted
  48px clear of the help button. Harness clean.
  Then (2026-11-14): new sketches start on Small (Fine is still in the pen picker), and
  tldraw's own UI is gone at every size. One floating bar everywhere
  (`components/editors/DrawingToolbar.jsx`): phones keep Move/Write/Pen/Undo/Fullscreen;
  from 720px it carries every tool — Select, Highlighter, Eraser, Shapes ▾ (geo shapes,
  arrow, line, frame), Text, Sticky note, Insert image, Redo, Zoom ▾. Left out: laser,
  embeds, the rarer geo shapes. Checks: 844 tests (new toolbar tests mutation-checked),
  harness clean; the tldraw slider waiver is gone with the style panel.
  Then **sketch paper**: a Paper button on the toolbar (every size) with Colour (Match
  theme, White #ffffff, Warm paper #f4eedf, Soft grey #e5e7ea, Engineering green #e1ebd6)
  and Lines (Plain, Lined, Graph, Dot grid). Kept per sketch in tldraw's document meta
  (`paperColor`/`paperPattern`); the last pick is this device's default
  (`notegeek:sketchPaper`) for sketches that never chose. Any real paper forces tldraw's
  light scheme so black ink stays black in dark mode. The ruling is tldraw's `Background`
  component, drawn from the camera, so it pans/zooms and drops out when zoomed far out.
  Model `paperModel.js` (not `paper.js`: it would collide with `Paper.jsx` on a
  case-insensitive disk). Exports/print stay on white.
- **Backdrop service** (`60678d93`, `3b875e41`; pushed and live 22:58 UTC, first batch
  8 Bing photos — Bing's archive serves 8 a day, and Picsum/LoremFlickr were down).
  Picsum went down (522), and StartGeek's hot-linked wallpaper went with it.
  - basegeek now keeps a 48 h batch of ~10 wallpapers from Bing, Picsum and
    LoremFlickr, in landscape and portrait crops, and serves it publicly at
    `/api/backdrops`.
  - `@geeksuite/backdrop` picks and preloads a photo.
  - StartGeek and the login screen use it.
  - StartGeek joined the pnpm workspace.
  - Plan and as-built notes: `DOCS/BACKDROP_SERVICE_PLAN.md`.
  - Checks:
    - api backdrops 16 (mutation-checked) and the full suite (only the known
      `goingOverFitnessGlance` failure, which is timezone-dependent: red in Chicago
      evenings, green in UTC);
    - helper 5;
    - StartGeek 24;
    - basegeek ui 255;
    - harness: basegeek 68 and StartGeek 16, clean (no-photo state only);
    - the StartGeek Docker image builds from the workspace and still 404s a missing
      asset.
- **GeekSuite Login** (Chef: "de-theme the login page … styled exactly like startgeek").
  The SSO door dropped the Signal Box look: StartGeek's wallpaper, scrim and glow, its
  thin Geist clock and date, and a dark-glass card titled "GeekSuite Login" ("to continue
  to NoteGeek" when an app sent you). It no longer follows basegeek's light/dark mode.
  Tokens copied from StartGeek into `components/authLook.js`; `AuthFrame` moved out of
  `signalbox/`. Geist is self-hosted via `@fontsource/geist(-mono)`.

## 2026-11-06 — aiGeek hardening pass (committed + pushed 2026-11-07: gateway first, FitnessGeek bundle after)

Fixes for the 14 P0/P1 findings of the 2026-11-06 aiGeek audit. Every new regression test
was run red against the old code first. Open items are in `SUITE_TODO.md` §1.

- **Money:**
  - A pin is free only if `AIFreeTier` lists it free. Any other pin is a governed paid
    attempt: it needs `allowPaid`, a trusted app and a real price.
  - The daily cap is an atomic reservation (`AISpendBudget`): 8 concurrent calls against a
    5-call budget dispatch exactly 5.
  - An unknown price is `costUnknown`, never $0. `callAI` ignores a caller-supplied `route`.
- **Auth:**
  - One key policy for REST and GraphQL (`apiKeyPolicy.js`). Non-admins can only narrow a key.
  - A JWT's `app` claim is attribution, not trust: no paid routing from a login body.
- **Correctness:**
  - Provider metadata is per call (`onInfo` / `callAIWithInfo`); the shared
    `lastProviderInfo` is gone.
  - Timeouts and client disconnects abort the HTTP call and stop the walk.
  - Summarizing stays on the attempt's own provider.
  - Token estimates count the whole conversation.
  - `/feature` hands `need` to the runner.
- **Catalog:**
  - A keyless provider is parked, never deleted, and nothing is parked when a key won't
    decrypt.
  - Status-less errors never retire a model.
  - A failed discovery is retried after 6 h.
  - A truncated listing deactivates nothing.
- **Telemetry:**
  - Feature caps are durable (`AIFeatureQuota`).
  - AIUsage counters use `$inc`.
  - Admin writes invalidate the status memo.
  - An omitted `enabled` keeps the stored value.
  - The dashboard shows `costUnknown` and today's reserved/settled spend.
  - New alerts, `key_unreadable` at error level first; the UI now renders `error`.
- **Callers:**
  - FitnessGeek insights and chat go through `runAIFeature`, failing soft with `ok:false`.
  - The `foodClassify` calls carry a per-user quotaKey.
  - StoryGeek forwards `need`.
- **Tests:**
  - The api suite moved off `--runInBand`: `workerIdleMemoryLimit: '512MB'` gives a peak of
    1.3 GB in 205 s, where in band it died at the 4 GB heap.
  - basegeek api: 179 suites, 3626 passed (one pre-existing DST failure).
  - basegeek ui: 255.
  - FitnessGeek backend 995, frontend 986.
  - StoryGeek 103 + 98.
- **Docs:**
  - RUNBOOK §12: parking, unknown cost, a paid-cap check, `KEY_VAULT_SECRET` rotation.
  - RUNBOOK §9.
  - `AIGEEK_SIMPLIFICATION` correction.
  - A 2026-11-06 block in `ARCHIVE/AIGEEK_FRONT_DOOR.md`; code citations repointed there.
  - `TEST_COVERAGE` counts.
