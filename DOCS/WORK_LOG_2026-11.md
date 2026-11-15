# Work log — November 2026

What shipped, as it landed. Wanted-but-not-done lives in `SUITE_TODO.md`.

## 2026-11-15 — BookGeek: comics and manga; NoteGeek: the sketch bar on narrow phones

**BookGeek — comic and manga files (emergency patch).** A comic archive could be
attached to a book but never taken back out: `GET /api/books/:id/download/:format`
accepted only `epub`, `azw3`, `mobi`, and the pickers did not offer comic files.

- **Formats:** one list, `apps/bookgeek/api/src/formats.js`, read by the route, its zod
  schema, `ensureFormat` and the Calibre rescan (each had its own copy). Ebooks
  (`epub`, `azw3`, `mobi`) convert on demand as before. Comic archives (`cbz`, `cbr`,
  `cb7`, `cbt`) and `pdf` are **as-is**: the stored file or a 404, never a conversion.
- **Download:** as-is files go through the browser's own downloader (a plain link), not
  the fetch-then-blob path, which holds the whole file in memory.
- **Upload:** both pickers accept the comic archives; multer's cap is 1 GB (was 200 MB).
  **nginx still caps the request at 120 MB** — not changed, see SUITE_TODO.
- **Card:** a comic or manga wears one line above its title, "MANGA · VOL. 3". A book is
  a comic by its file, or by a `comics` / `graphic novel` tag; it is Manga when a tag
  says manga, manhwa or manhua. The volume is the series index (`web/src/utils/comic.js`).
- **Detail:** the download sheet lists the comic file first and leaves the ebook rows
  out when the book has no ebook file; the "No EPUB yet" hint reads as a comic's.
- No gateway change: `files[].format` and the Format facet were already open strings.
- The download sheet's rows are now real list items (an axe `list` fault the sheet
  always had; it had no harness scene until `03d-detail-comic-download`).
- **Out of scope by decision (Chef, 2026-11-15):** reading comics in the app, and
  comics in Send to Kindle or device baskets. Not done either: cover or metadata
  extraction from an archive.

**NoteGeek — sketch bar under 388 px.** The short bar scrolled sideways on a 360 px
phone, with More and Fullscreen starting off-screen. Those widths now get a **tight
bar**: Paper and Fullscreen move into More, leaving six 44 px buttons (284 px).
`barMode()` in `DrawingToolbar.jsx`; harness scene `22a2-sketch-tight-bar` checks it at
360 px.

Verified: BookGeek api 253 tests (new ones go red with the as-is guard removed), web
355; NoteGeek vitest 1,017. Harness results are in the commit messages.

**Follow-up the same evening (Chef: "once you open a book's card, you can't close
it" and "I still can't download comic books directly").**

- **A book could not be closed.** Wave 1 gave `GeekSheet` its own history entry so
  Android Back closes it. BookGeek's book sheet is a route and closes with
  `navigate(-1)`, which only popped that entry. Fixed with `backToClose={false}` on
  that sheet. Broken in production from the wave 1 UI deploy until this fix. No other
  app closes a sheet this way (checked GameGeek, ThingGeek, NoteGeek, NewsGeek,
  FitnessGeek).
- **The close X on a phone took no taps** on that sheet: its body drew over the
  button. `GeekSheet`'s close button now sits above the body (`zIndex: 2`).
- **"Card" meant the book page.** A comic's page now leads with one Download button
  for the stored file and has no Read or Send; the first pass had only added a line
  to the grid card and left the download three taps deep.
- Harness: `03e-detail-closes` (goes red with the fix reverted) and a real download
  event in `03d-detail-comic-download`. Neither fault was visible to the unit tests.

## 2026-11-15 — NoteGeek + TodoGeek: wave 1 of the review built and deployed

Per-item status, the decisions, deploy order and the device checklist are in the
Status section of `DOCS/NOTEGEEK_TODOGEEK_REVIEW_2026-11.md`. Six commits on local
`main`, deployed the same day (see the end of this entry):

- `90e7d09d` NoteGeek gateway: save safety (`baseUpdatedAt` conflict check), soft
  delete with 30-day Recently deleted, coalesced version history with caps, stored
  `preview`, `notesPage` keyset paging, cleaned word index (title weighting), per-note
  vector replace, stored sketch hash, transcript integrity fixes, legacy
  `routes/noteGeek.js` deleted.
- `0ad31621` TodoGeek gateway + `task-grammar` + `api-client`: explicit
  `hasDueTime`/`timeZone`, `clientId` idempotency, first-occurrence rule, one late
  row per series, recurrence validation, DST-safe series, bounded expansion window,
  anonymous reads now `UNAUTHENTICATED`; opt-in write timeout in `api-client`;
  grammar fixes.
- `5aa58918` `packages/ui` `useBackToClose` (Android Back closes overlays) and
  `useFormFactor`; harness tablet viewports and two advisory CI shards.
- `5cddc2dd` NoteGeek frontend: autosave on hide, IndexedDB drafts, conflict
  dialog, `NoteEditorRoute`, Recently deleted, paged lists; sketch stack (listener
  scope, pen mode at mount, palm rule, phone bar Eraser + More, open fit-to-content,
  image shrink, one mark table, date anchoring, loose sent matching, attempts rule,
  client pre-check).
- `76eed497` TodoGeek frontend: serialised and optimistic writes, re-read on focus,
  phone editor bottom sheet, Reorder mode, private masked on every device, neutral
  done ink, retired pages and components deleted.
- `dae59be7` DOCS cleanup (below).

Tests as reported by the build agents: gateway todogeek 366 pass; NoteGeek gateway
new suites pass; TodoGeek frontend 496 pass; NoteGeek frontend 1009 pass;
packages/ui 864 pass; TodoGeek harness 92 scenes, 0 violations. Each fix was
mutation-checked (revert, see red, restore) by its author. After the agents stopped,
on a quieter machine: full api suite 184 of 185 suites, 3,769 tests; both frontend
suites clean; `gql-arg-audit` clean. vitest `testTimeout` raised to 20 s in both apps
because whole-page tests flaked at 5 s under load.

Known red: one api test outside this work, `goingOverFitnessGlance` ("leaves a longer
window inclusive at both ends": expects 2026-10-16, gets 2026-10-15; the 30-day window
now spans the 1 Nov clock change). Not triaged — for the next push.
`aiHardeningCancellation` was a load flake and passes.

**Deployed 2026-11-15** in two pushes, on Chef's go-ahead: gateway first (`0ad31621`;
log line "NoteGeek word index updated", derived 49), then UIs and docs (`dae59be7`).
Containers recreated and healthy; both sites 200; NoteGeek on the new bundle. CI on
`0ad31621` was red in three jobs: TodoGeek frontend tests (old tests against the new
grammar at that intermediate commit; green at `dae59be7` locally), the gql argument
audit (clean at `dae59be7` locally) and the FitnessGeek backend job (not inspected).

**NoteGeek harness.** The run on the fresh build failed with 28 page errors, and
Chef chose to push anyway. All seven failing scenes turned out to be fixture gaps
(`GetNotesPage` and `CreatePhotoNote` had no stub). Fixtures were brought up to date
and 11 scenes added for the new screens; those found five real phone layout bugs,
fixed after the deploy and **not yet pushed**: the phone sketch bar ran 12 px off a
390 px screen once Eraser and More were added; the transcript status line was a
40 px target; the restore-draft banner wrapped one word per line; Recently deleted
split its two buttons; "Keep mine" wrapped. Now PASS: 292 scenes, 0 violations,
0 a11y, 0 page errors; NoteGeek vitest 1,012. Open: on phones narrower than ~388 px
the sketch bar scrolls sideways (More and Fullscreen start off-screen).

Not built: banded reading of long sketches (needs a gateway change), nav rail and
two-pane layouts, NoteGeek tablet tap targets, most of NoteGeek Tiers 3/4/6, Tier 7.
D4 (events expire) is display-only; D9 (rail) not started.

Also today:

- **Suite review** — `DOCS/SUITE_REVIEW_2026-11.md`: the other apps reviewed, plan
  only.
- **Form-factor plan** — `DOCS/SUITE_FORM_FACTOR_PLAN_2026-11.md`: bringing every
  app to phone, tablet and desktop quality, plan only.
- **DOCS cleanup** (`dae59be7`) — new `DOCS/README.md` index; finished plans moved
  to `ARCHIVE/` unless code or CI cites them by path; stale headers corrected
  (app counts, MUI version, ports); `BUJOGEEK_REVIEW_2026-09.md` renamed to
  `TODOGEEK_REVIEW_2026-09.md` (four code comments already cited that name); stale
  FlockGeek and StoryGeek docs archived; FlockGeek README rewritten. Details of
  what was left alone are in the cleanup report. One sighting for Chef: a
  gitignored, untracked archived TodoGeek doc contains a credential-shaped value
  (not printed, not touched; rotate or redact at your call).

## 2026-11-15 — NoteGeek + TodoGeek: deep review, plan only

- Seven parallel reviews (two app shells, sketch stack, both data layers, both
  screenshot sets) merged into `DOCS/NOTEGEEK_TODOGEEK_REVIEW_2026-11.md`, ordered
  by impact. No code changed.
- Headlines: both apps can lose or corrupt work (Tier 1); the sketch editor
  serialises the whole document per pointer frame; neither app has a tablet
  layout and the harness has no tablet viewport.
- Nine decisions wait on Chef (table D1–D9 in the doc).

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
- **Handwritten bullet journal → TodoGeek, and handwritten Markdown** (overnight, Sage's
  decisions on Chef's grant; all in `apps/notegeek/DOCS/BUJO_HANDWRITING.md`).
  - The transcription prompt keeps list marks distinct (dot `*` task, dash `-` note, circle
    `o` event, cross `x` done, `>` `<` `!` `?`) and copies the writer's own Markdown and
    TodoGeek shorthand.
  - TodoGeek's line parser moved to the shared `packages/task-grammar`; TodoGeek re-exports
    it, and NoteGeek reads handwritten lines with the same code.
  - ⋯ → "Send tasks to TodoGeek" lists a sketch's journal lines (open ones ticked,
    editable, with what was understood), creates TodoGeek tasks, and remembers what was
    sent.
  - "Keep as plain text" draws journal marks as Markdown checkboxes and list items.
  - `/labs/pen` shows what a pen sends the browser. The Lenovo pen's button is taken by
    Lenovo's own menu before the browser sees it.
  - **Not verified with real handwriting or a real model**: first thing to test.
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
