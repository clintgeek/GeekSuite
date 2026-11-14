# NoteGeek: Automatic Handwriting Transcription

*Status: SPEC from Chef, 2026-11-14 (replaces LOCAL_INFERENCE_SPEC.md, now parked).
Option A APPROVED and BUILT the same day — see "Decisions" and "As built".*

---

## The spec (as given)

### Objective

Automatically make handwritten sketches searchable without requiring the user to manually
invoke Convert. Reuse the existing `transcribeSketch` OpenRouter integration through
BaseGeek. Do not introduce a new AI provider, inference runtime, or model-management
subsystem. The existing full handwriting-to-Markdown conversion and review workflow must
remain unchanged.

### 1. Separate Autosave and Transcription Scheduling

**Autosave**: preserve existing behavior (it currently saves about 3 seconds after
changes); it must never be delayed by transcription scheduling or execution.

**Automatic transcription**:
- Schedule transcription about 90 seconds after the last meaningful sketch edit.
- Every later meaningful edit resets the debounce.
- Autosaves must not independently trigger transcription.
- A sketch that receives hundreds of autosaves during a meeting should normally generate
  only one transcription request after the user stops writing.
- The initial debounce is 90 seconds, kept configurable internally.

### 2. Content-Based Change Detection

Hash the sketch content relevant to transcription. Do not transcribe unchanged content.
Changes to unrelated metadata, tags or other fields must not trigger transcription. Store
the hash of the last successful transcription, and skip when the current hash matches it.
Do not rely only on modification timestamps.

### 3. Single-Flight Processing

At most one transcription request per sketch at a time. If the sketch changes while one is
running: (1) let it finish; (2) don't start another concurrently; (3) compare the current
hash with the submitted hash; (4) if they differ, mark the result stale; (5) schedule
another transcription after the normal 90 s of inactivity. An older transcription must
never overwrite a newer result. Edits during a request keep the newer sketch and its
pending transcription state.

### 4. Transcription and Indexing

Keep transcription separate from Markdown cleanup. Automatic transcription produces a
faithful text representation, preserving Markdown conventions where possible, without
reorganising, summarising or interpreting. It is stored separately from the sketch, with
the source hash, model/provider, timestamp and processing status. On success: update the
sketch's searchable transcription, trigger the existing indexing pipeline, and let word
search and semantic search find the text. The sketch and pen strokes stay authoritative
and are never modified.

### 5. Existing Manual Conversion

Unchanged: same transcription and Markdown cleanup, same review/edit step, not replaced by
the automatic operation. If a current automatic transcript exists for the exact sketch
content, investigate reusing it instead of paying for another request.

### 6. Failure Handling and Quotas

Failures never interfere with autosave or normal use. Retry transient failures with
backoff; don't repeatedly retry permanent failures. Respect the existing 40-a-day
OpenRouter limit. No duplicate requests during retries. Track pending, processing,
successful, stale and failed states. A failed transcription is never a successful
indexing operation. Don't introduce a second transcription queue if the existing
background infrastructure can reasonably support this work.

### 7. User Experience

A minimal status: Waiting, Transcribing, Searchable, Needs retry. No intrusive
notifications or modals for routine background work. If automatic transcription is
configurable, its on/off state is explicit, and turning it off doesn't affect manual
conversion.

### 8. Testing

Autosave doesn't trigger transcription directly; multiple edits reset the debounce;
hundreds of autosaves produce one transcription after inactivity; unchanged content isn't
re-transcribed; metadata-only changes don't trigger it; only one request runs per sketch;
edits during transcription cause another; older results can't overwrite newer ones;
failed requests don't mark sketches searchable; success triggers existing indexing; manual
conversion works as before; failures never interfere with saving.

### 9. Scope Restrictions

Not: local GPU inference, WebGPU/WebNN, new OCR models, automatic Markdown cleanup,
diagram interpretation, BuJo task extraction, a generalised inference framework, a new
indexing system.

### Acceptance Criteria

A user can write a whole meeting's notes, with frequent autosaves, and NoteGeek
automatically transcribes the finished sketch about 90 seconds after the last edit. The
text becomes searchable through the existing indexing system; the handwriting is
untouched. Manual conversion behaves exactly as today.

Before implementation, inspect the existing transcription, autosave and indexing paths and
identify the smallest change that accomplishes this.

---

## What exists (inspected 2026-11-14)

- **Autosave** (`NoteEditorPage.jsx`): debounced, 2 s after the last edit while dirty.
  `HandwrittenEditor` adds a 400 ms debounce from tldraw's store to `setContent`. Saves
  go through the gateway's `updateNote`.
- **Transcription** (basegeek `graphql/notegeek/transcribe.js`): `transcribeSketch(image,
  mediaType, source)`, using `runAIFeature({ feature: 'transcribe', need:
  'vision+prose:balanced' })`, 40 per user per UTC day, 45 s timeout, temperature 0,
  provenance returned. Its prompt is already the faithful kind §4 asks for: words exactly
  as written, layout kept, `[?]` for unreadable, `[drawing: …]`, never tidied. Markdown
  cleanup is the separate `composeNote` step.
- **The image** is made **in the browser** (`utils/sketchExport.js`): tldraw's
  `exportToBlob`, flattened onto white, ≤ 2000 px. **The server has no way to render a
  tldraw snapshot**: no headless browser, no rasteriser (`sharp`/`resvg` aren't
  installed), and the shapes are drawn by tldraw's own code.
- **Indexing** (basegeek `indexer.js`): a background worker picks `embeddingState:
  stale` notes 30 s after their last `updatedAt` and embeds `chunkNote(note)` locally.
  For `handwritten` notes, `chunkNote` gives the **title only**.
- **Word search**: one Mongo text index, `{ title, content, tags }`. A sketch's `content`
  is its tldraw JSON, so today sketches are word-indexed on JSON noise. A text index can't
  be altered in place: adding a field means dropping and recreating it.

## The one real choice: who makes the image

Transcription needs a PNG of the page, and only the browser can draw one today.

**Option A — the open sketch transcribes itself (smallest).** The editor watches for
meaningful edits (tldraw shape changes from the user, not saves) and runs the 90 s
debounce. When it fires, it uses the same `exportPng` that Convert uses and calls one new
mutation. The server does the hashing, the single-flight claim, the transcription, the
conditional write and the indexing hand-off.
- **Pros:** no new dependency and no renderer. The image is byte-for-byte what Convert
  would send, so Convert can reuse the transcript exactly (§5). The meeting case works:
  the tablet sits on the sketch, and 90 s after the last stroke it transcribes.
- **The gap:** it only runs while the sketch is open. Leave within 90 s, or let Android
  freeze the PWA, and it waits until the sketch is next opened. Then the editor sees
  "Waiting" and catches up.

**Option B — the server transcribes in the background.** A server-side renderer draws
pen strokes and photo pages to SVG, then to PNG (new native dependency
`@resvg/resvg-js`, about 200 lines). The existing indexer's tick picks sketches whose
content hash moved and that have been quiet 90 s.
- **Pros:** it happens even if the device is closed or offline, and retries and backoff
  live where indexing's do.
- **Cons:** a new renderer that has to agree with tldraw's look (stroke shapes, frames,
  rotation, photo pages). Its image differs from Convert's. It's a native module on Alpine.
  It's the larger change.

**Recommendation: A**, with the known gap stated. If sketches left within 90 s turn out
to go untranscribed too often, B is the upgrade, and the server half of A (fields, hash,
mutation, indexing) carries over unchanged.

## Proposed design (Option A)

### Server (basegeek `graphql/notegeek/`)

- **`sketchHash(content)`**: sha256 over the snapshot's **shape and asset records
  only**, sorted by id. Camera, selection, pages' names, the document record (paper colour
  lives there) and anything outside the snapshot (tags, title) are excluded. Computed in
  the Note save middleware for `handwritten` notes, and stored as `sketchContentHash`.
- **`sketchTranscript`** subdocument on Note: `{ text, hash, status, provider, model, at,
  error, attempts, retryAt, submittedHash, claimedAt }`. `status` is one of `pending`,
  `processing`, `searchable`, `stale`, `failed`, where `failed` means permanent for that
  hash.
- **Mutation `autoTranscribeSketch(noteId, image, mediaType)`**:
  1. Owner check; `handwritten` only; zod validation as `transcribeSketch` does.
  2. `current = note.sketchContentHash`. The server's hash of what's *saved*, never one
     the client claims. The client saves first.
  3. If `sketchTranscript.hash === current` and the status is `searchable` → return it.
     No AI call (unchanged content, §2).
  4. **Atomic claim**: set `processing` + `submittedHash: current` + `claimedAt`, only if
     not already `processing` (or the claim is over 2 min old, i.e. abandoned). If it
     loses the claim, it returns "busy" with no AI call (single-flight, §3).
  5. Call the existing `transcribeSketch` internals: same prompt, cap and provenance.
  6. **Conditional write**, filtered on `sketchTranscript.submittedHash: current`, so an
     older result can't land on a newer one. Status is `searchable` if the note's hash is
     still `current`, else `stale`. In the stale case the text is still stored: better
     than nothing until the rerun. Sets `embeddingState: 'stale'` so the **existing
     indexer** re-embeds. Written with `timestamps: false`, so background work never
     changes "last edited".
  7. Failure: transient (`AI_UNAVAILABLE`, timeout, cap) → back to `pending` with
     `retryAt` (doubling backoff; for the cap, the next UTC midnight); `attempts++`.
     Permanent (`AI_DEGENERATE`, validation) → `failed` for that hash; not retried until
     the content changes. Either way, never `searchable`, and the old text is kept.
- **Chunking**: `handwritten` = title + `sketchTranscript.text`. Nothing else in the
  indexer changes.
- **Word search**: rebuild the text index as `{ title, tags, content, 'sketchTranscript.text' }`.
  This is a one-time drop and recreate at startup, guarded so it runs only when the
  index's fields differ. (Optional: stop word-indexing sketch JSON — see the questions.)

### Client (NoteGeek)

- **`HandwrittenEditor`** reports *meaningful edits*: a tldraw store listener on shape and
  asset records, `source: 'user'`. Camera moves, selection and paper changes don't count.
  Autosave stays exactly as it is.
- **`useAutoTranscribe`** (in `NoteEditorPage`):
  - **Debounce:** `AUTO_TRANSCRIBE_DELAY_MS = 90_000`, reset on each meaningful edit.
  - **When it fires:** if a save is pending, wait for it; then `exportPng`, then
    `autoTranscribeSketch`. One request in flight. Edits during it simply restart the
    debounce.
  - **Opening a sketch:** if its status is `pending`, `stale` or a due retry, it
    schedules a catch-up run.
- **Status**, a small line beside the existing "saved / editing" text: *Waiting* (debounce
  or pending), *Transcribing*, *Searchable*, *Needs retry* (failed, or backing off). No
  toasts, no dialogs.
- **Setting**: "Make sketches searchable automatically", with "sends sketch images to
  OpenRouter" in the description. Turning it off stops automatic runs only; Convert is
  untouched.

### Manual Convert (§5)

Unchanged by default. **Proposed reuse:** if `sketchTranscript.hash` equals the sketch's
current hash, the review dialog opens on the stored transcript (same image, same prompt)
with a "Transcribe again" button, and no request is spent. It's a small, visible change to
Convert, so it only goes in if Chef says yes.

### Quota

Automatic runs share the 40-a-day cap with Convert. Proposal: automatic runs stop at **30
a day**, leaving 10 for Convert. A sketch that hits the cap waits for the next UTC day
(status *Needs retry*).

### Tests (§8, mapped)

- **Server** (jest, basegeek api):
  - The hash ignores camera, document meta and tags.
  - Unchanged content → no AI call.
  - Claim single-flight: two concurrent calls → one AI call.
  - Edit during the call → `stale` + rerun is allowed.
  - An older result can't overwrite a newer one.
  - Transient vs permanent failures.
  - Failure is never `searchable`, and the old text is kept.
  - Success sets `embeddingState: stale`; chunking includes the transcript.
  - `transcribeSketch` (manual) is unchanged.
- **Client** (vitest, fake timers):
  - Autosave alone never transcribes.
  - Edits reset the 90 s debounce.
  - 300 edits/autosaves → exactly one request.
  - Camera or paper changes don't count.
  - Single in-flight request.
  - Edits mid-request → a later second run.
  - A failed request leaves saving untouched.
  - The status labels show.
  - Convert's existing tests stay green.

### Open questions for Chef

1. **Option A** (the open sketch transcribes itself; smallest), knowing a sketch left
   within 90 s waits until it's reopened? Or **B** (server renderer, always runs)?
2. **The setting's default**: on (it's what you asked for) with the toggle in Settings?
   This is the first automatic path that sends sketch images off the box.
3. **Quota split**: automatic stops at 30/day, leaving 10 for Convert?
4. **Convert reuse**: open the review on the stored transcript when the sketch hasn't
   changed (with "Transcribe again")?
5. **While rebuilding the text index**: also stop word-indexing sketch JSON (`content` of
   `handwritten` notes)? That noise makes searches like "draw" or "shape" match every
   sketch.

---

## Decisions (Chef, 2026-11-14)

1. **Option A**: browser-side rendering through the existing sketch export. Catch-up when
   the sketch is next opened is acceptable.
2. **Default ON**, with a Settings toggle. External processing is visible. OpenRouter is
   fine for this.
3. **Quota**: automatic runs get at most 30 a day; 10 are reserved for manual Convert.
4. **Convert reuse**: yes. Show the stored transcript when the content hasn't changed, with
   an explicit **Transcribe again** button.
5. **Word search**: stop indexing raw sketch JSON; index the title and the recognised
   transcript instead.
- Reopening a sketch with an outdated or missing transcript schedules the normal 90 s
  debounce.
- Manually edited transcript content is preserved, and routine work never overwrites it.
- The source content hash and provenance are tracked, so stale results can't overwrite
  newer ones.
- Autosave stays entirely independent; manual Convert and Markdown cleanup are unchanged.
- **Photographed notes: 1b + 2a.** The reviewed reading is stored on the photo note when it
  is made (free, already corrected). Photo notes are never auto-read, including S Pen
  markup added later.

## As built (2026-11-14)

**Gateway** (basegeek `graphql/notegeek/`):
- `sketchText.js` (pure): `sketchContentHash` (sha256 over shape and asset records only,
  keys sorted), `hasPhotoPages`, `sketchSearchText` (machine reading + corrections,
  deduped, `[no writing]` dropped).
- `sketchTranscript.js`:
  - `autoTranscribeSketch`, `getSketchTranscript`, `saveSketchTranscriptEdit` (`forHash`
    optional: the photo flow sends none, so the current saved hash is used) and
    `rememberConvertReading` (Convert passes `noteId`).
  - The claim is an atomic `updateOne` (`status != processing`, or a claim over 2 min old).
  - Results are written field by field, filtered on `submittedHash`, so `edited` is never
    part of an automatic write.
  - Backoff: 2 min doubling to 1 h; the cap waits until the next UTC midnight; after 6
    attempts, or `AI_DEGENERATE`/`AI_EMPTY`, the content is `failed` for that hash.
  - The preference is `appPreferences.notegeek.autoTranscribeSketches` (on unless
    `false`), enforced server-side.
- `transcribe.js`: `dailyCap` per call on the shared `transcribe` counter. Convert keeps 40;
  automatic runs pass 30, so they stop at 30 used.
- Note model:
  - `sketchTranscript` subdocument and `wordText`, kept by `save`, `insertMany` and
    `findOneAndUpdate` middleware. `wordText` is the content for every type but a sketch,
    and the transcript for a sketch.
  - The text index is `{ title, wordText, tags }`. `wordIndex.js` (`ensureNoteWordIndex`,
    run at start-up) backfills and swaps the old `{ title, content, tags }` index once;
    it's idempotent.
- `chunking.js`: a sketch's body is its transcript. `indexer.js` projects the transcript
  fields.
- GraphQL: `sketchTranscript(noteId)`, `autoTranscribeSketch(noteId, image, mediaType)`,
  `saveSketchTranscriptEdit(noteId, text, forHash)` and `transcribeSketch(…, noteId)`, all
  additive.

**NoteGeek**:
- `utils/inkEdit.js`: only user shape and asset changes count. It hangs off the existing
  store listener, never autosave.
- `hooks/useAutoTranscribe.js`:
  - 90 s debounce (`AUTO_TRANSCRIBE_DELAY_MS`).
  - Waits 5 s while a save is pending.
  - One request in flight.
  - Catch-up on open: `waiting`, or `retry` once its time has passed.
  - A network error is retried after 2 min.
- `components/notes/TranscriptStatus.jsx`: "waiting to transcribe" / "transcribing via
  OpenRouter" / "searchable" / "transcription: needs retry", beside the save stamp, with
  the detail (model, time, error) in a tooltip.
- `NoteEditorPage`: Convert reuses a current transcript when nothing is unsaved ("Already
  transcribed · …", **Transcribe again**). Corrections are saved as the sketch transcript
  when the text was changed.
- `PhotoPagesPage`: the reviewed text is stored on the new photo note.
- Settings → Sketches → "Make sketches searchable automatically".

**Tests:**
- Gateway: `notegeekAutoTranscribe.test.js`, 22 tests. Mutation-checked: the older-result
  filter, the atomic claim (needs distinct timestamps; identical ones made Mongo report
  "nothing modified" and hid it) and the hash scope.
- NoteGeek:
  - `useAutoTranscribe.test.jsx` (12): debounce reset, single flight with a slow request,
    and catch-up are mutation-checked.
  - `inkEdit.test.js`, the editor wiring, and Convert reuse/corrections (mutation-checked).
  - Photo 1b (mutation-checked).
- `goingOverMisc` now waits for `Note.init()` before searching; the new text index made an
  old race visible.

**Deploy order:** the gateway first (additive schema; it swaps the text index at start-up),
confirmed live, then NoteGeek.
