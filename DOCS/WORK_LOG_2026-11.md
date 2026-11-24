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
- **No conversion from a comic archive either** (Chef): `ensureFormat` drops CBZ, CBR,
  CB7 and CBT as sources and answers 409 "Comic files are not converted" when a comic
  is all the book has. The UI already hid those rows; this closes the API and the
  Kindle basket path. api 255 tests, the two new ones red without the filter.
- **Add book: "Manga or comic?"** Chef's manga are EPUBs, which nothing recognises by
  file type, and the dialog had nowhere to add a tag. Two toggles beside the file
  chooser write the shared tag `Manga` or `Comics` on the new book. (Detecting it
  from the EPUB's metadata was started and stopped at Chef's word.)
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


## 2026-11-15/16 — Wave 2: decisions, shared foundations, four trust passes

Chef: tablet is portrait, used for NoteGeek, TodoGeek, FitnessGeek, BookGeek,
ThingGeek and GameGeek; "make the decisions and document them and get it all
done"; "push when done". Decisions are in `SUITE_FORM_FACTOR_PLAN_2026-11.md`
and `SUITE_REVIEW_2026-11.md` (§ Decisions).

- **Gateway / client (review S1, S2, S4, S6, A1, A4–A6, C1, C3):**
  - `/graphql`: a token presented and refused answers 401 UNAUTHENTICATED, so the
    client refreshes and replays. No token stays anonymous; an unavailable check stays 503.
  - `graphql/shared/auth.js`: one `requireUser`, one error shape; applied to flockgeek
    and suite tags. Other modules still use their old shapes (the client reads both).
  - REST: expired token → 401 (was 403). Body-parser and CORS errors keep their 4xx.
  - api-client / auth: timeouts on refresh and `/api/me`; `onBeforeLeave` hooks
    (`geeksuite:before-reload`, `geeksuite:session-ending`); a partly-run mutation is
    not replayed.
  - CI jobs for `packages/task-grammar` and `packages/schemas`.
  - The agent that built this stalled before reporting; Sage reviewed the diff and ran the suites.
- **packages/ui (plan 2.3–2.6):** `useRefetchOnResume`, `useUnsavedGuard` (own back
  entry, optional `geek-draft:` local draft), `GeekLoadError` + `geekLoadStatus`,
  `GeekNavRail`, `GeekTwoPane`, `useFormFactor` → `kind` / `navMode` / `twoPane`
  (two panes from 1024 px), `GeekShell` `rail`. No app adopts them yet.
- **ThingGeek (findings 1, 2, 3, 6, 7; 5 in part):** Edit keeps late uploads; "today"
  is the household day (`HOUSEHOLD_TIME_ZONE`, default America/Chicago,
  `graphql/shared/householdToday.js`); Walk asks before leaving unsaved rows and keeps
  them for the room's next walk; 44 px remove-photo; CSV formula guard.
- **FitnessGeek (findings 3, 5, 7; 1 corrected):** failed dose read shows "unknown";
  `fitnessWeights` / `bloodPressures` take `startDate`, `endDate`, `limit`; Home
  refetches only the day after a food write; Settings saves on leave; BP week average
  no longer drops a day in the evening; `goingOverFitnessGlance` fixed (UTC days).
  Review finding 1 was wrong about a 100-row cap: the gateway path had no limit.
- **BookGeek (findings 1, 2, 4, 6, 8; S-D3, S-D5):** 30-day Recently deleted with
  Restore / Undo / Delete forever (`hideDeletedBooks` hook on the shared Book schema);
  retry-safe Add book; progress save flushed; Edit sends only changes; purge removes
  readings; splash no longer promises sync; reader remembers font and theme.
- **Tablet baseline:** `TABLET_BASELINE_2026-11.md`. Nothing broken in portrait; the
  tablet apps are stretched phone layouts.
- **Harness:** FitnessGeek tooltip scenes 53d/53e were racy (measured the hidden first
  frame); fixed in the scene.
- **nginx:** BookGeek `client_max_body_size` 120m → 1g, `/api` timeouts 300 s (Chef's go-ahead).
- **Tests (quiet machine, 2026-11-16):** basegeek api 3,829; ui 937; api-client 43;
  auth 80; user 105; schemas 46; task-grammar 10; todogeek 496; notegeek 1,017;
  thinggeek 508; fitnessgeek fe 1,014 / be 995; gamegeek 178; bookgeek web 383 / api 260;
  startgeek 24. Under load from parallel agents the frontend suites time out at random — run them alone.
- **Deploy:** gateway half pushed first as `03ae3f0c`, then the app halves.

## 2026-11-16 — Wave 3: the remaining trust passes; tablet layouts for TodoGeek and NoteGeek

Chef: "You can push when ready." Built by agents, reviewed and verified by Sage on a
quiet machine, pushed gateway-first.

- **packages/ui:** `GeekSheet` `tabletMaxWidth` (600 default — a sheet is a centred
  dialog on a tablet, not an 800 px slab), `GeekContentColumn` (680), `geekTarget()`,
  `geekMedia.tabletUp`, `useGeekNavSlots`, `GeekShell` `rail` + `leftInset`.
  Known gap: the rail's current label fails contrast in suite-default dark (3.67:1) and
  flockgeek light (3.36:1); recorded in `themeContrast`, no app with those themes uses the rail yet.
- **GameGeek (S-D1, S-D2):** Settings → Deleted games, with restore (`deletedGames`,
  `restoreDeletedGame`, `DeletedGame` in `packages/schemas`); hours and sessions removed
  from the UI, gateway fields `@deprecated`, not removed; shared back-to-close; Playnite
  preview and toast say how many games an upload removes.
- **StartGeek:** captures carry a `clientId` and a busy guard (no duplicate todo on a
  double tap or retry); a failed session check and failed loads say so; refetch on resume;
  `glanceAsk` uses the household day.
- **NewsGeek:** `newsArticles(cursor)` + `nextCursor` (paging no longer skips or repeats
  when new stories arrive); resume shows "N new stories" instead of moving the list;
  scroll position remembered; a failed "older stories" load says so.
- **FlockGeek:** `lastEggProduction`; Home shows a load error instead of an empty flock.
- **StoryGeek (own backend):** a turn carries a `clientId` and is answered once
  (`GET /api/stories/:id/turns/:clientId`); one turn per story at a time (409
  `TURN_IN_PROGRESS`, lock expires after 5 minutes); composer draft kept locally; 30-day
  trash with restore and delete forever. Transcript storage not built — plan in
  `apps/storygeek/DOCS/CONTEXT.md`.
- **TodoGeek tablet:** rail, 640 px rows with the time beside the words, add box docked
  beside the rail, `GeekLoadError`, Today as list | task from 1024 px. `MobileTabBar` deleted.
- **NoteGeek tablet:** rail (Home, Search, New, Notes, Tags — Tags opens a sheet with the
  tree, Archived, Recently deleted), 600 px lists, format toolbar under the title,
  list | note from 1024 px, full-size title and tag fields. Tap-target violations at tablet
  size 5,134 → 0. Fixed on the way: switching sketch → sketch kept one editor mounted, so
  the save for the sketch being left never ran (editor now keyed by note id).
  `MobileBottomNav` deleted.
- **Two panes are tablet-only for now.** Plan P2a says "landscape tablet, desktop"; Chef
  was asked whether his desktop should change and had not answered at push time, so the
  desktop keeps its layout. One line each to turn on: `useTodoLayout.js`, `useNoteFormFactor.js`.
  A mouse window 600–1,199 px wide does get the rail.
- **Tests (quiet machine):** basegeek api 3,856; ui 984; api-client 43; auth 80; user 105;
  schemas 46; task-grammar 10; todogeek 516; notegeek 1,038; thinggeek 508; fitnessgeek fe
  1,014 / be 995; gamegeek fe 186 / be 593; newsgeek fe 322 / be 264; storygeek fe 91 / be 124;
  flockgeek fe 63 / be 17; bookgeek web 383 / api 260; startgeek 41. Harness, all 11 apps,
  `--enforce-a11y --desktop`: 0 violations.
- **Not checked on a device:** pen, on-screen keyboard, Android Back in two-pane, anything signed in.

## 2026-11-16 — BookGeek: Tankarr's comics folder

Chef: "BookGeek should probably know about /mnt/Media/Comics since that's where Tankarr
is downloading them to", then "is there a better way? Readarr does something similar".

- **In place, read-only.** `/mnt/Media/Comics` is mounted at `/data/library/_tankarr:ro`
  (`COMICS_PATH`), inside the library root, so every existing file route serves it and
  `libraryPaths.js` is unchanged. Tankarr owns the folder; BookGeek never copies, moves,
  converts beside, or deletes there (`api/src/comicsPaths.js` is the one guard).
- **Scan** (`services/comicsFolder.js`): 20 s after boot, every 15 minutes
  (`COMICS_SCAN_MINUTES`), and Settings → Library maintenance → "Scan comics folder".
  One Book per volume, `source: 'tankarr'`. Files come from the folder; series, authors,
  volume and language from the names. No archive is opened.
- **Tankarr's API** (`TANKARR_URL`, `services/tankarrApi.js`), when it answers: authors,
  description, year, manga-or-comic kind, artwork where the folder has no image. One GET
  per scan; any failure falls back to names only.
- **Renames and removals:** a renamed or upgraded file keeps its row; a vanished file keeps
  the row (ratings and history survive) with no file and `owned: false`. An empty folder
  (an unmounted disk) strips nothing.
- **Trash:** a trashed volume is not re-created. It cannot be purged while Tankarr still
  has the file (it would come straight back), so it stays hidden in Recently deleted.
- **Also:** covers fetched for such a book go to `covers/`, not beside the file; the
  Calibre rescan's title match skips Tankarr rows.
- **Tests:** api 311 (308 pass, 3 skipped: better-sqlite3 will not load on this Node, as
  before); web 389; harness scene `06m-comics-scan`. Dry run of the scanner on the real
  folder with an in-memory store: 7 volumes, second pass unchanged.
- **Checked from the running container:** Tankarr's API answers without a key; the folder
  is world-readable.
- **Not verified:** the nested read-only mount, the real Mongo queries, artwork download.
- **Deploy:** push, then `docker compose up -d` in `apps/bookgeek` (Watchtower does not
  apply compose changes).

## 2026-11-16 — NoteGeek: new sketches start on the Fine pen

Chef: "sketches should default to the smallest pen line size." Small had been the default
since 2026-11-14 and wrote too fat on the tablet. `HandwrittenEditor.jsx`: `fineRef` /
`penFine` start true. Sizes in the picker are unchanged.

## 2026-11-16 — NoteGeek: the Lenovo pen's double-click is undo

The button's double-click arrives as `keydown` / `key: "Unidentified"` (Chef, `/labs/pen`).
`utils/penKey.js` makes it undo in sketches (Chef's call), ignored while typing.
Details in `apps/notegeek/DOCS/BUJO_HANDWRITING.md` § The Lenovo pen. Not tried on the device.

## 2026-11-16 — Two panes on the desktop; NoteGeek's list stays put

- Chef, after using the tablet: "that rail and two panes is beautiful, we need that desktop
  too" — two panes now apply from 1024 px on any device in TodoGeek and NoteGeek. The
  desktop keeps its sidebar ("good just like you have it").
- Chef: NoteGeek "is a bit jarring when it moves things around"; TodoGeek's is better.
  Cause: NoteGeek split on every note route, so a note opened from Home, Search or New
  swapped the page for list | note. Now a note opens beside a list only when that list is
  already on screen (`useListContext().beside` in `Layout.jsx`); from anywhere else it is a
  whole page. This was read from the code, not seen on his screen.
- Tests: todogeek 516, notegeek 1,046; harness both apps `--enforce-a11y --desktop` and
  NoteGeek `--tablet-only`, 0 violations.
- 2026-11-17: Chef tested NoteGeek and TodoGeek on the tablet and the desktop — "very happy
  with the results thus far". The reading above stands. CI, harness and images green for
  `3db858b0`.

## 2026-11-17 — The rail's current label clears AA; ThingGeek takes the rail

- **packages/ui:** `GeekNavRail` paints its current item `railCurrentInk(theme)`
  (`navigation/sidebarInk.js`): the accent where it clears 4.5:1 on `background.paper`,
  otherwise the accent walked off the paper until it does. Closes the two known gaps
  (suite-default dark 3.67:1, flockgeek light 3.36:1); both `KNOWN_GAPS` entries removed.
  Apps that paint the rail their own ground (TodoGeek, NoteGeek, ThingGeek) set the
  current colour through `itemSx` and are unchanged. Rail items also pass `aria-label`
  and `aria-haspopup` through. Test: `tabletNav.test.jsx` reads the painted colour (red
  with the component reverted).
- **ThingGeek:** the device picks the navigation (`useGeekNavMode`, pointer first) instead
  of MUI's `md` breakpoint: phone = tab bar, tablet = the rail (`components/NavRail.jsx`),
  desktop = sidebar. The rail is the tab bar stood on end, in Storage Yard livery: the
  orange Add tile on top, then Things · Where · Attention (count) · More (the phone's More
  sheet). It stays beside the add screen and Walk; the top bar drops its own "Add a thing"
  while the rail shows. Only a TOUCH tablet takes it (`hooks/useThingNav.js`): anything with
  a mouse is unchanged (tab bar below 900 px, sidebar above).
- **Touch targets on a tablet:** filter rows, the Clear all button and toggles in
  `@geeksuite/collection`, ThingGeek's tag chips, and every MUI menu row (suite theme) are
  44 px under `(pointer: coarse)`; they were sized by width, so a landscape tablet got the
  desktop's 30–36 px (432 harness findings before, all of this kind).
- **Scope (Chef):** "really only note and todo need to be heavily optimized for the
  tablet… I'm not wanting to necessarily redesign the entire suite, desktop and all." No
  two panes for ThingGeek; BookGeek and GameGeek left alone. See SUITE_TODO §11.
- **Deployed** as `a3b39c1e`: CI and images green, every app container healthy. The mobile
  harness went red on a timeout, not a finding: the `fitnessgeek 4+6` shard was cancelled
  at 25 minutes twice (229 and 227 scenes clean when cut off; a 5.3-minute apt step in
  front of 19.5 minutes of scenes). Fix: `4` and `6` are separate shards and the job
  timeout is 35 minutes (ThingGeek and NoteGeek ran 23–24 min on the same push).

## 2026-11-18 — The harness walks its viewports side by side

Chef: "This build is simply too long." The time was setup and waiting, not the tests.

- **Viewports in parallel** (`tools/mobile-harness/lib/parallel.mjs`): each viewport gets
  its own worker thread, so its own Chromium and its own copy of the app's fixtures (they
  keep module-level state). `--jobs N` / `HARNESS_JOBS`, default 4; `--jobs 1` is the old
  serial walk. A worker that dies is a failed viewport, not a missing one.
- **Measured locally** (4 cores, `--enforce-a11y --desktop`): TodoGeek 5 m 23 s → 2 m 02 s;
  all of FitnessGeek (610 scenes) 13 m 55 s; ThingGeek 5 m 29 s; NoteGeek 6 m 40 s. All
  eleven apps PASS with the same scene counts as the serial run of 2026-11-17.
- **CI drops `playwright install --with-deps`**: apt on every shard, 5.3 min on the shard
  that timed out. Not verifiable locally; the first push is its test. If a shard cannot
  launch the browser or text metrics shift, restore the flag or use the Playwright image.
- Not done yet: run only the shards a push touches; replace the fixed 1.2 s per-scene wait;
  fold FitnessGeek's four shards back together once CI times are known; collapse `ci.yml`'s
  59 jobs.
- **In CI (`ef2c9905`):** the harness run went 25+ min (timed out) → 9 m 05 s, all green.
  Slowest shard NoteGeek 7 m 03 s (was 23 m); ThingGeek 5 m 23 s (was 23 m 48 s); the four
  FitnessGeek shards 3–5 min each. Dropping `--with-deps` launched and found nothing new.

## 2026-11-18 — CI, harness and images run only what a push touches

Chef: "let's get these builds as tight as possible."

- **`tools/ci-affected.mjs`** (11 tests, run in CI's static job): one answer for all three
  workflows. `apps/<app>/…` or that app's harness scenes → that app; docs → nothing;
  `packages/`, the lockfile, root manifests → everything. Measured from the last GREEN run
  of the same workflow, so a red or cancelled run's changes are covered by the next. No
  usable base, or a pull request → everything.
- **Apps are not independent, so CI is the cautious one:** basegeek's api suite reads other
  apps' files and other apps' tests read basegeek. basegeek is always in CI's matrix, a
  basegeek change runs every app, and the shared-package job always runs.
- **`ci.yml` 722 → 246 lines, 59 jobs → at most 15:** `static checks`, `shared package
  tests`, one `<app> tests + build` per app (backend tests, frontend tests, build, PWA
  audit of that build), and `ci gate`. The separate build-smoke matrix is gone (the PWA
  audit already built each app). Same commands as before.
- **Images:** only the affected apps are built; tooling and other workflows build none
  (yesterday's harness-only push rebuilt eleven).
- **Harness:** only the affected apps' shards; triggers on any `packages/**` change now
  (was `ui` and `tags` only).
- **Ruleset updated (Chef's word, 2026-11-18):** "Protect main" required 23 check names, two
  already stale (`bujogeek frontend tests`, `frontend build smoke`) and most of the rest gone
  after the restructure. It now requires exactly `ci gate` and
  `mobile grammar (iPhone 14, dark + light)`; every other rule and the bypass are unchanged.
  Still true as before: both workflows are path-filtered, so a PR that triggers neither
  (docs-only) or only CI (tooling-only) leaves a required check pending and needs the bypass.
- **First full run of the new layout (`e70cae43`):** all green. Images 3.8 min, harness
  7.5 min, CI 10.1 min — CI was now one job: FitnessGeek's frontend tests, 6.3 min.
- **Why: the `@mui/icons-material` barrel costs 7.5 s to import and vitest pays it per test
  FILE.** `packages/ui/testing/muiIconsPlugin.js` (test-only vite plugin, in all ten app
  vitest configs) rewrites `import { Add } from '@mui/icons-material'` to per-icon imports.
  FitnessGeek frontend 7 m 03 s → 3 m 44 s locally, same 1,014 tests; every other frontend
  suite passes with its usual count. Worker pool type and `server.deps.inline` made no
  difference; `--no-isolate` breaks tests.
- **Tried and dropped:** replacing the harness's fixed 1.2 s post-navigation wait with a
  readiness check (fonts, DOM quiet, no running transition). Under 10% faster and 394 of
  1,848 screenshots changed. The time is not in that wait.

## 2026-11-18 — Suite design and UX review (plan only)

- Chef asked for a full design and UX review. Eight read-only reviewers worked from
  today's harness screenshots (1,848) and the code; Sage re-checked 14 headline
  findings, all held. Written up in `DOCS/SUITE_UX_REVIEW_2026-11.md`: verdict per
  app, five suite-wide patterns, 30 ranked findings, 11 decisions for Chef, and the
  twelve reports appended unchanged. **Nothing is built.**
- Found on the way: ThingGeek's shipped identity is "Storage Yard", not "Moving Day";
  FlockGeek's offline page is already styled; three harness fixtures are wrong
  (StartGeek wallpaper address, NewsGeek Today opens scrolled, BaseGeek scenes 09/10
  point at a route that no longer exists).

## 2026-11-18 → 19 — Overnight build from the design and UX review (DEPLOYED 2026-11-19)

**Pushed and deployed 2026-11-19** on Chef's word (`a4d6694f..fbec2de2`, 126 commits). CI, the
mobile harness and the image release all passed on the pushed commit; Watchtower updated all
eleven apps at 12:30–12:44 with no failures. Chef tried the apps on 2026-11-20: "they all look
good". The text below was written before the push.

Chef: "please fix as you suggest. lets also consider using shared components where
appropriate… make decisions on my behalf and report in the morning." Eight builders,
one per app group, each committing its own fixes (one commit per fix); the harness run
by each builder afterwards and again by Sage at the end. 125 commits ahead of
`origin/main` as of the morning. `git log a4d6694f..HEAD -- apps/<app>` lists an app's.

**Decisions made for Chef (each revertable on its own):**
- Suite rule for destructive actions: reversible acts at once and offers Undo; only
  the irreversible asks, in a themed dialog. NoteGeek delete (`c2d407e9`, reverses D1)
  and ThingGeek trash (`3f8c4a33`) lost their confirm; FlockGeek deletes cannot be
  undone without a gateway restore, so they ask in a themed dialog (`86eb19ff`);
  StoryGeek `/back` asks (`509a5521`); BookGeek "To Kindle" asks (`a05b439d`).
- Identity headers: NewsGeek's nameplate is on Today only (`7e11f292`). TodoGeek's
  date numeral, ThingGeek's murals and StartGeek's clock were NOT shrunk.
- BookGeek reader position is remembered on the device only (`fcb79f8e`); no sync.
- FitnessGeek: Full Home gets a compact "What did you eat?" pill (`a5f3d5c5`); Simple's
  quick target asks for a goal weight (`f2cda0f9`).
- StartGeek dock and module links are real links: new tab on desktop, same tab on a
  phone or installed (`f90240c8`).
- NoteGeek: model ids are tooltips only (`aaeceb01`). TodoGeek: the repeat dialog is
  gone; Save becomes "Save this one" / "Save every one" (`e98615a5`).

**What was built, by app** (the review's finding numbers are in each commit message):
- **FitnessGeek (16):** Amount on an added food edits that entry; "Same as…" has an
  Added state; goal weight in Simple; add pill on Full Home; no floating + over the Full
  log; desktop add-sheet names; BP Save disabled until valid; BP heart tone; Sleep tile
  ("6" → "6h 52m", also "1,484" → "1"); one Undo and one count in the add flow; the
  goal she just set wins on Weight (`4e3efa5c`).
- **NoteGeek (14):** no clear-all × on tags; one save-failed indicator; Compose counts
  only what it composes; Recently deleted has its own title and works like Archived;
  delete with Undo; Graphite alerts and switches; plain words in the AI features; meta
  line folded into the Back row on a phone (body starts ~233 px down, was ~265).
- **TodoGeek (10):** login page rewritten for TodoGeek in Red Pen; ripple off; swipe
  label; desktop pane regressions; failed load said once; empty Today points
  somewhere; editor is ruled paper with 44 px fields; Reorder in the chip row (Today
  shows ~3.5 rows on the harness phone, was ~2.5).
- **ThingGeek (13):** action bar really sticks and the top bar names the item; phone
  order puts Claim readiness, Value, Documents first; trash with Undo; tappable search
  examples; Attention's first due item ~36% down (was ~60%); status pips; Filters
  sheet shows what is on; yard motif on sheets, empty Trash and errors; Edit matches
  Add and has the unsaved guard; one photo/file control.
- **BookGeek (9):** one close button; reader — Back closes only the reader, controls
  stay while used, Contents, percentage + chapter, reopens where you left it,
  bookstore look, readable by screen readers; rate from the book's page; "To Kindle"
  asks; shelf-strip fade; aisle-sign pills; three reader harness scenes.
- **GameGeek (8):** Add-a-game header; sticky bar clear of the close; your shelf, rating
  and notes before Media on a phone; one word ("Shelf"); month casing; search Back on
  the left; no server jargon; a half-typed note survives rotation (`3a4af61f`).
- **NewsGeek (12):** whole card opens the story; compact dateline off Today; two-line
  excerpts and chips on the publisher line; square fields and menus; Share / Copy
  link; fresh open starts at the top; Settings saves itself; Find a source; Source
  page gets In my paper and recent stories.
- **StoryGeek (11):** the wait has a clock and "you can leave"; `/back` asks and says
  what is lost; finished tales say so; labelled phone tools; Characters dead end
  removed; export feedback; day rules in the transcript.
- **FlockGeek (7):** three-tap egg log (remembers the pen, counts from recent days);
  Home's Today line; worded FAB that covers nothing; themed delete dialogs; one date
  format; desktop bird headers line up; `/dashboard` scaffold removed.
- **BaseGeek (10):** login fields phone password managers can fill; "3 CAUTIONS" names
  the causes and links to them; AIGeek nav on one row; provider key Save / Cancel;
  compact Line on the phone; Account in Signal Box; one place for the theme.
- **StartGeek (11):** `> task` uses the shared `@geeksuite/task-grammar` (so
  `(private)` and natural dates work; the old copy is deleted); one live-region toast
  with Undo on ticking a task; real links; wallpaper scrim floor for 4.5:1; opaque
  dock on a phone; plain-word weather; command-box shortcuts on a phone.
- **Shared (`packages/ui`, Sage):** an action toast lives 8 s, not 4 (`506af776`); the
  login splash's smallest text is 12 px (`a5a7cfc1`).

**Found by the harness on the builders' own work, and fixed:** StartGeek's shortcut
row made the first tap below the command box miss; TodoGeek's new editor fields were
36 px; NoteGeek and StoryGeek each wrote `width: 1` in `sx` for visually hidden text
(that is 100%, and scrolled the page sideways); NoteGeek's Compose chip printed note
ids; BookGeek's reader was invisible to screen readers and ran under its bars.

**Harness:** new scenes for BookGeek's reader, StartGeek's command box, StoryGeek's
`/back`, ThingGeek's empty Trash and load error, NewsGeek's top of Today; fixtures
fixed for StartGeek (wallpaper, fitness field names), NewsGeek (Today opened
scrolled) and BaseGeek (dead `/databases` scenes replaced).

**One slip:** the FitnessGeek builder ran `git commit --amend` after HEAD had moved to
another builder's commit and reworded it; it restored the original at once. History
checked: intact.

**Not built, on purpose** — see `SUITE_TODO.md` §13.

## 2026-11-20 — GeekDay: the pen-first daily page (DEPLOYED 2026-11-20, late)

A new app, `apps/geekday`: one day's TodoGeek tasks beside a handwriting page stored as a
NoteGeek note. Spec `DOCS/GEEKDAY_SPEC.md` (Chef, signed off the same day); how it works is
`apps/geekday/DOCS/CONTEXT.md`. Port 1840, `geekday.clintgeek.com`.

- **Gateway:** nothing added, nothing changed. GeekDay uses TodoGeek's `dailyTasks`,
  `createTask`, `updateTask`, `updateTaskStatus` and NoteGeek's `notes`, `createNote`,
  `updateNote`, `transcribeSketch`.
- **Page:** agenda (overdue / scheduled / to do / done, tick, move to the next day, add box
  with a "how this was read" line), ink page (tldraw 2.4.6, trimmed from NoteGeek's editor,
  a fixed sheet with no pan or zoom), day flip, docked clock after 2 idle minutes with the
  next task and the weather, screen wake lock.
- **Circle to task:** new lasso tool. The circled strokes go to `transcribeSketch` as a PNG
  with no `noteId`, the reading is shown for correction, and only Create makes the task.
- **Weekday abbreviations:** `@geeksuite/task-grammar` reads "friday" but not "fri", so the
  spec's own example did not parse. Handled in GeekDay only (`lib/capture.js`); the shared
  grammar is unchanged.
- **Registered in:** `tools/` (ci-affected, pwa-audit, pwa-icons, boot-smoke, gql-arg-audit,
  harness registry and the CI tablet shard), `build.sh`, basegeek (`VALID_APPS`, CORS list,
  app registry seed), the app switcher, StartGeek's dock, the docs tables.
- **nginx:** `clintgeek.com_geekDay.conf` written on the box and passes `nginx -t`. **Not
  reloaded.** Any reload (including the one after a cert renewal) makes the hostname live;
  until the container exists it answers 502.
- **Checked:** 197 frontend tests, 20 backend tests, lint, `pwa-audit`, `gql-arg-audit`,
  `boot-smoke`; harness at tablet portrait light + dark with a11y enforced (11 scenes, 22
  runs, 0 findings) and `01-day` at phone and desktop. Pen and touch were synthetic.
- **Not checked:** anything on the Lenovo; real handwriting through the transcriber; opening
  a GeekDay page in NoteGeek; the live gateway (every harness request is stubbed).

## 2026-11-20 — Code-quality sweep of the UX review build

Eight reviewers read the overnight diff (`a4d6694f..fbec2de2`), one lane each, read-only, then
built their own findings: 72 commits, one per fix, each behaviour fix with a test proved red.
Shared packages and the gateway were not touched.

- **BookGeek:** reader chrome no longer hides on a failed or unrendered book (it took Close
  with it); font size applied before the saved position is shown; Send to Kindle cannot go
  twice; position and location keys carry the file's identity (**every saved place restarted
  once**); Contents arrow keys and same-label chapters.
- **StartGeek:** a drafted task (and the draft's Edit path) keeps `(private)`, `~blocked`,
  notes and repeats; an empty task is refused on the client; Go on a result follows the link
  rule; a ticked row resets after Undo; shortcut chips wait for a real tap; scrim floor reads
  the top of the photo.
- **FitnessGeek:** `nutrition_goal.start_date` read as the UTC day the gateway sends (the
  11-18 fix read it a day early; its test used a date form the server never sends); a copied
  meal is one Undo; a partly failed copy retries what failed; closing a sitting offers Undo
  unless the "Just added" strip or the describe's own toast already does (`1916ff20`, after the
  harness caught the double Undo on scene 48c); clearing a prefilled goal weight clears it.
- **NoteGeek:** Delete saves a dirty note first; a note in Recently deleted is read-only;
  batch restore/purge evicts once; the docked "not saved" copy is measured against the visual
  viewport.
- **NewsGeek:** Undo of a removed open-with link restores its publishers; Go saves the field;
  Recent stories refetches and says when a source is not in the paper.
- **StoryGeek:** wait clock counts from the turn's real start; `/back` asks only when a
  checkpoint matches and says what is truly lost. The StoryList Undo test raced the toast's
  real life; it is on a fake clock now.
- **ThingGeek:** Filters sheet never drops options while open; Edit's Save bar rides above the
  keyboard; Undo after trash does not pull the reader off another page.
- **BaseGeek:** saving one provider key keeps the drafts in other open rows; Cancel resets the
  row. **FlockGeek:** a failed delete keeps the row and its edits. **TodoGeek:** Undo is 8 s
  (the shared constant), so a delete is sent after 8 s. **GameGeek:** notes draft holds only
  changed fields.
- **Review finding that was wrong:** TodoGeek `penIntegrity` "no toast with nothing on screen"
  does go red without its guard.
- **Checked (quiet machine):** 13 suites, 5,842 tests, 0 failures; lint 0 errors; syntax-check,
  gql-arg-audit, gql-surface clean; harness all eleven apps PASS (FitnessGeek after `1916ff20`).
- **Deployed 2026-11-20 23:00 by another session's push** (the GeekDay commits, `88212ca6`),
  before the harness had finished: the 48c double Undo was live until `1916ff20` shipped.
- **Not checked:** anything on a device (see SUITE_TODO §14).

**Deployed the same night.** The first image build failed: the note store was in `src/data/`,
which the repo's `data/` ignore rule kept out of git. Moved to `src/store/` and pushed again.
nginx reloaded; `geekday.clintgeek.com` answers and basegeek accepts the new origin. Nothing
signed-in was exercised (no session on the box).

## 2026-11-21 — GeekDay: week spread, a page that scrolls, page templates; NoteGeek: templates

Chef, before bed: the week spread "for sure", templates "in both notegeek and geekday", the
ink side should "pan and scroll like notegeek does", "decide things for me and push when
done". The details are Sage's decisions, written as such in `DOCS/GEEKDAY_SPEC.md` §6 and
`DOCS/TEMPLATES_SPEC.md`. No gateway changes.

- **GeekDay week spread** (`/week`): Monday to Sunday as a two-by-four planner spread, the
  eighth cell "Not scheduled" (overdue and undated). Tick, move by drag or by menu with Undo,
  ink pictures drawn from stroke points, tap a day to open it. Uses the existing `weeklyTasks`.
- **GeekDay ink page scrolls**: at least three sheets tall, finger and wheel scroll, pinch
  zooms to 3x, the pen writes. tldraw's camera stays locked and GeekDay applies the gestures
  itself, so a palm beside the pen is not a pinch.
- **Page templates** (`packages/ui/src/paper/`, shared): Schedule, Top three, Meeting,
  Cornell, Dot grid, Grid. Stored in the sketch's document meta as `paperTemplate`. Chosen
  from the ink toolbar in GeekDay (with a per-device default for new days) and from the
  Paper menu in a NoteGeek sketch. Never part of the ink or of an export.
- **NoteGeek note templates**: "From a template" in New: Meeting notes, One-to-one, Weekly
  review, Project brief, Decision record, Troubleshooting log, Packing list, Recipe. Markdown
  notes. Opening one and leaving creates no note and no draft.
- **NoteGeek, one behaviour change**: a sketch that has a template and no remembered camera
  opens on its sheet at full width. Sketches without a template are unchanged.
- **Not checked**: anything on the Lenovo (pen and palm while scrolling, dragging a task with
  a pen); a GeekDay page with a template opened in live NoteGeek.

## 2026-11-21 (evening) — Templates reworked: a sheet in the drawing, not a kind of paper

Chef, after testing the morning's build: "we broke how notegeek draws grids and lines ... the
template should be separate than the paper type ... a permanent part of the page with a
forced white paper under. also, i miss my green grid." His three answers are in
`DOCS/TEMPLATES_SPEC.md` (§2a, T1–T10).

- **What was wrong.** A template was a background that replaced the paper's lines and was
  drawn in the paper's colours, and Dot grid / Grid were offered as templates beside the
  paper's own Graph / Dot grid. Picking one took the green grid away.
- **Now.** A template is one locked image shape in the sketch: a white 1000×1400 sheet with
  the layout printed on it (`packages/ui/src/paper/sheet.js`, shared). Schedule, Top three,
  Meeting, Cornell. The paper is drawn exactly as before templates existed, around and under
  it. Add, swap and remove from the Paper menu (NoteGeek) or the Page menu (GeekDay), one Undo
  step each. Not erasable; left out of transcription and circle-to-task images; in print and
  shared images.
- **GeekDay.** Page menu has two lists, Paper (Ruled, Dot grid, Grid) and Template. A blank
  day previews the device default and prints the sheet on first ink. A page with a sheet is a
  light page even in dark mode.
- **Found on the way.** tldraw 2.4.6 keeps assets out of undo history, so the sheet's asset is
  per template and never deleted. tldraw's context menu can unlock a locked shape; NoteGeek
  refuses that for the sheet.
- **Lost.** Pages templated with the morning build keep their ink and paper but show no
  template until it is re-added (not converted on open).

## 2026-11-22 — 1:1 notes in NoteGeek

Chef no longer uses manager-toolbox (too cumbersome: live notes had to be rewritten into its
shape) but still needs the notes and logs, and already tags them `fd/1on1/<person>`. Spec:
`DOCS/ONE_ON_ONE_SPEC.md`; how: `apps/notegeek/DOCS/CONTEXT.md` §20.

- New 1:1 → person picker → a handwritten page, titled and tagged, on a new "1:1" sheet.
- A person's tag page is their log: last met, open TodoGeek items, New 1:1, search of their
  notes. The 1:1 tag's page lists people, longest-unmet first.
- Tasks sent from a 1:1 carry the person's tag; open ones show above the page.
- Client only. Existing notes untouched. The toolbox import is deferred.

## 2026-11-22 — Sketches are read when nobody has them open

Chef: "across the board let's fix the transcribing when closed thing. Feels like a bug."

- **Found on the way:** the gateway called a template sheet a photographed page, so every sketch
  on a template (all 1:1 pages, any GeekDay page with a template) was never read. Fixed in
  `sketchText.js`: a sheet is not in the hash, not a photo page, and alone is an empty page.
- **Background reader.** Gateway `sketchesToTranscribe` and `autoTranscribeSketch(background:
  true)` (20 a day). `@geeksuite/api-client` `createBackgroundReader`; NoteGeek and GeekDay each
  draw waiting sketches off-screen and send them. NoteGeek reads a sketch a few seconds after it
  is closed. Details and limits: `apps/notegeek/DOCS/AUTO_TRANSCRIBE_SPEC.md`.
- **Deploy order:** basegeek first, then the apps.

## 2026-11-22 — Templates lock on the first mark; the form is read with the writing

Chef: "We should probably somehow capture the writing on template pages. We'll lock the template
on the first mark on the page, then we can safely process all of the writing and context."

- **Lock (TEMPLATES_SPEC T4).** NoteGeek `setPaperTemplate` and GeekDay `setSheet` do nothing on
  a page with ink; both menus disable the template choices and say why. Paper is not locked.
- **Form reading (T6).** The whole-page export now includes the sheet when there is ink
  (NoteGeek `exportPng` returns `form: true`; GeekDay `exportPage`). Gateway: source `form` and
  `TRANSCRIBE_FORM_PROMPT`; `autoTranscribeSketch` picks it when the saved sketch has a sheet,
  Convert and Send tasks pass `source: 'form'`. Section headings come back as "§ HEADING" lines,
  left out of search text (`withoutFormHeadings`).
- **Not checked against a real model.** The prompt is tested for its wording, not for what the
  model does with a real 1:1 page. First real page: look at the transcript.

## 2026-11-23 — New 1:1 and New meeting in the sidebar; longer sheets

Chef: "There are two templates that I'll use constantly: 1:1, and Meeting Notes. I'd just like
both of those as shortcuts in the left margin menu." Then: "The Meeting notes should be
handwritten ... the templates for the written notes ... could be bigger/longer even if they need
to scroll."

- **Shortcuts.** `TagsPanel` (`Sidebar.jsx`) has "New 1:1" (the person picker) and "New meeting"
  under All notes; so the tablet's Tags sheet has them too.
- **Meeting notes is handwritten (TEMPLATES_SPEC N1a).** `/notes/new?type=handwritten&meeting=1`
  (`utils/oneOnOne.js` `MEETING_PATH`, `buildMeeting`): the Meeting sheet, "<date> Meeting",
  tagged `meeting`. The template picker's Meeting notes goes there too. The typed body still
  opens at `?template=meeting`.
- **Longer sheets (T1a).** `packages/ui` `PAPER_TEMPLATES[].sheets` and `paperTemplateHeight`:
  Meeting, 1:1 and Top three are 1000 x 2800 with more lines at the head. Schedule and Cornell
  unchanged. Sheets already placed keep their size (the size is stored on the shape).
- **Watch:** a two-sheet form is sent to the reader at about half the pixels per line of a
  one-sheet form (longest edge is capped at 2000 px). Still above the app's own "readable" floor.

## 2026-11-23 — Spending limits doubled

Chef: "We can loosen spending limits a bit. In all the time I've been using this, I've only
spent $0.27", then chose "both, doubled".

- **Handwriting reads a day:** Convert 40 → 80, automatic 30 → 60, background 20 → 40
  (`transcribe.js`, `sketchTranscript.js`). NoteGeek's Settings line says 60.
- **Money ceiling** (`apps/basegeek/.env.production`, not in git): `AI_PAID_PER_DAY_USD`
  0.50 → 1.00, `AI_PAID_PER_CALL_USD` 0.05 → 0.10. Takes effect when the gateway restarts.

## 2026-11-24 — NoteGeek: 1:1 and Meeting on the tablet rail

Chef: "I don't see the 1:1 and Meetings on the left nav bar on the tablet."
The rows shipped on 11-23 live in `TagsPanel`, which a tablet only shows inside
the rail's Tags sheet; the scene that proved them was desktop-only. The rail
(`buildNavItems`, `rail` only) now reads Home, Search, New, Notes, 1:1,
Meeting, Tags. The phone bar is unchanged. Harness `40a-tablet-rail` checks the
order, that all seven fit on screen, and that 1:1 opens the picker.


## 2026-11-24 — NoteGeek: typed templates removed

Chef: "Actively not using and would remove: Recipe, Packing List ... don't need any typed
templates." All eight typed templates, the "From a template" picker and `?template=` seeding
are deleted (TEMPLATES_SPEC N6). The New sheet and the desktop New menu list 1:1 and Meeting
notes directly. Handwritten sheets (Meeting, 1:1, Top 3, Schedule, Cornell) are unchanged.
Three test files went with the feature (1173 → 1117 tests). Harness `23a-new-pages` replaces
`23a-template-picker` and `23b-template-note`.

Also 2026-11-24: `DOCS/REFERENCE_PANE_SPEC.md` signed off, not built.

## 2026-11-24 — One spending limit, and a notice when it bites

Chef: "keep one daily limit with a notification if something fails because of it."
Handwriting's three read caps (80 / 60 / 40) are removed; `TRANSCRIBE_DAILY_CAP` is now a
2000-a-day runaway bound. The limit is the gateway's `AI_PAID_PER_DAY_USD`, raised 1.00 → 5.00
in `apps/basegeek/.env.production` (not in git). A read stopped by it is `AI_BUDGET`, waits for
midnight UTC, and NoteGeek and GeekDay show one warning toast a day. Details:
`apps/notegeek/DOCS/AUTO_TRANSCRIBE_SPEC.md`, "One limit". Other features' daily counts are
untouched. Gateway `npm test -- notegeek`: 495.
