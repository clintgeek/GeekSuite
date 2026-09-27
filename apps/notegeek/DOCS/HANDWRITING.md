# NoteGeek — S Pen: eraser button, and handwriting to Markdown

*Written 2026-09-27. Chef has a Samsung S26 Ultra with an S Pen coming. Chef: "I'd love to
write things in sketch, feed it to AI to get a reasonable approximation of what it says,
then pump that through the existing compose function and make beautiful markdown."
And: "button=eraser will work, we may as well do that."*

**Parked, not in this work:** marking up ThingGeek photos (Chef isn't using ThingGeek yet)
and a handwritten daily page in BuJoGeek (BuJoGeek is about to be torn apart). Both are
listed in `DOCS/SUITE_TODO.md`.

## 1. The side button is an eraser

- **What tldraw 2.4 already does:** it switches to the eraser for `button === 5` (the eraser
  tip on Surface and Wacom pens) and restores the previous tool when the pen lifts
  (`Editor.ts`, `STYLUS_ERASER_BUTTON`). It also turns on pen mode the first time it sees a
  pen: from then on the pen draws and fingers only pan and zoom.
- **What we add:** Android browsers are expected to report the **S Pen side button as
  `button === 2`** (the same code as a right-click), with `buttons & 2` set during moves.
  This hasn't been checked on a device yet. A pen `pointerdown` with button 2 (or with
  `buttons & 32`, the eraser bit) gets tldraw 5's treatment: remember the current tool,
  switch to `eraser` for that stroke, and restore on `pointerup` or `pointercancel`.
  - It only applies to `pointerType === 'pen'`. A mouse right-click keeps tldraw's context
    menu.
  - A pen press never opens tldraw's context menu (`contextmenu` from a pen is
    suppressed).
  - It works on phones and desktop alike (a Wacom tablet's barrel button gets it too).
- **Done when:** unit tests cover button 2 and buttons 32 switching to the eraser and then
  restoring; a mouse right-click is unaffected; and the tests are red/green checked. On the
  S26 it's Chef's test: hold the button, rub a stroke out, let go, keep writing.

## 2. Handwriting to Markdown

### The flow
1. On a **sketch note**, the ⋯ menu gets **"Convert handwriting to text"**. It's disabled
   when the sketch is empty.
2. **The client exports the page to an image.** Use tldraw's own export
   (`exportToBlob`), not a screenshot. The export has:
   - all shapes on the current page;
   - a **white background**, whatever the theme, because dark-mode ink on a transparent
     PNG is unreadable to a model;
   - PNG format, with the longest edge **at most 2000px**, scaled down if needed.
   Refuse over 6 MB encoded, with a clear message.
3. **The gateway transcribes it:** `transcribeSketch(image: String!, mediaType: String!)`
   returns `{ text, provenance }`.
   - It goes through `runAIFeature` with `app: 'notegeek'` and `feature: 'transcribe'`,
     asking for **`need: 'vision+prose:balanced'`** (vision routes only through OpenRouter;
     see memory). It uses NoteGeek's existing paid-first governance, not a new tier.
   - **Daily cap:** 40 per user.
   - **Input validation:** mediaType is `image/png` or `image/jpeg`, and the base64 is at
     most about 8 MB, checked before any AI call.
   - **The prompt:** transcribe the handwriting faithfully. Keep line breaks and list
     structure; render arrows, bullets and checkboxes as text; mark words it can't read as
     `[?]`; describe a drawing only as `[drawing: …]` in one short phrase. **Never invent,
     summarise or tidy** (that's Compose's job). Output plain text only.
   - Failures surface with the usual `saveErrorMessage`-style detail, never a silent empty
     result.
4. **Review step:** the transcription opens in an editable box. It's an approximation, so
   Chef corrects the words the model got wrong before anything else happens. From there:
   - **Compose it**: hand the text to the existing **Compose** (`composeNote`) and its
     dialog, as the material, and get Markdown back.
   - **Keep as plain text**: skip Compose.
5. **The result is always a new Markdown note.** It's titled from the Compose output's
   first heading (or "From sketch: <sketch title>"), with the sketch's tags, and a first
   line linking back to the sketch. **The sketch is never replaced**: Compose's "Replace
   this note" isn't offered from this path.

### Why this shape
- **Transcribe, then compose,** instead of one "make Markdown from this image" call. A
  faithful transcript is checkable, and Chef can fix it. A model asked to transcribe and
  beautify at once invents structure, and there's no way to tell which words it made up.
- **The sketch stays.** It's the original; Markdown is a derived copy.

### Infra
- **The NoteGeek nginx vhost** (`/mnt/Media/Docker/nginx/config/sites-available/clintgeek.com_notegeek.conf`)
  has **no `client_max_body_size`** on `/graphql`, so an image over 1 MB gets a 413 (the
  documented basegeek landmine). Add `client_max_body_size 12m;` to its `/graphql`
  location, then run `nginx -t` and reload. That's done at deploy, outside the repo.

### Done when
- The gateway resolver is tested, and the test goes red if any of these checks is removed:
  validation, the cap, the need string, the prompt's no-invention rule, and error surfacing.
- Frontend tests cover the ⋯ entry (disabled when empty), the export options (white
  background, size cap), the review box, handing off to Compose, and saving a new note that
  links back to the sketch, with the sketch unchanged.
- A harness scene shows the review step on a phone, a11y-clean.
- On production: a real handwritten sketch becomes a Markdown note.

## As built (2026-09-27)

Where the spec was silent, these are the choices made, and why.

### §1 The side button is an eraser — `frontend/src/utils/penEraser.js`

- **Mechanism:** a capture-phase listener on the sketch editor's container (attached by
  `HandwrittenEditor.jsx` once tldraw has mounted, not on read-only sketches). tldraw 2.4 has
  no hook for this: its canvas turns a button-2 press into `right_click` and starts nothing,
  and only buttons 0, 1 and 5 start a `pointer_down`. So on a pen `pointerdown` over
  `.tl-canvas` the listener stops the event, remembers the tool, switches to `eraser`, and
  dispatches the press to tldraw as a primary `pointer_down`. The lift is dispatched as
  `pointer_up`, then the tool is restored. Moves are tldraw's own.
- **What counts as the button:** `button === 2`, **or `buttons & 2`**, or `buttons & 32`. The
  spec named button 2 and bit 32. Bit 2 is added for a tip that lands while the barrel is
  already held, which some browsers report as `button 0, buttons 3`. `button === 5` is left
  to tldraw, which already handles it.
- **Restore** happens on `pointerup` **and** `pointercancel`, and only for the pointer that
  pressed. A cancel ends the erase the way a lift does: what was rubbed out stays rubbed out.
- **Context menu:** a `contextmenu` event is swallowed when it comes from a pen, or has no
  pointer type and the last press was a pen, or arrives mid-erase. A mouse right-click is
  never touched and still opens tldraw's menu. Stopping the barrel press also keeps Radix's
  700 ms touch/pen long-press timer (the trigger around tldraw's canvas) from starting.
- **Not handled:** pressing the button in the middle of a stroke (the browser sends that as
  a chorded `pointermove`, not a new `pointerdown`). The stroke carries on as ink; lift and
  press again. A plain pen hold (no button, stationary 700 ms) still opens tldraw's context
  menu, as it always has.
- **Only the S26 can confirm** the button codes Samsung's Chrome actually sends. If the side
  button shows up as something else (e.g. only `buttons & 2` on moves, or a `contextmenu`
  with no `pointerdown`), `isPenEraserPress` is the one function to change.

### §2 Handwriting to Markdown

**Export** (`frontend/src/utils/sketchExport.js`, called through `HandwrittenEditor`'s
`sketchApiRef`, so the editor page never imports tldraw):

- tldraw's `exportToBlob({ editor, ids: every shape on the current page, format: 'png', opts })`
  with `opts = { background: false, darkMode: false, padding: 32, scale }`. `scale` is at most
  1 and chosen so tldraw's fixed 2x render fits 2000px (`2000 / (2 × (longest edge + 64))`).
- The export is then **flattened onto an opaque `#ffffff` canvas**, scaled down (never up) so
  the longest edge is at most 2000px, and re-encoded as PNG. `background: true` would have
  painted tldraw's light page colour (`#f9fafb`), not white, and `false` alone leaves the
  PNG transparent.
- Over 6 MB encoded is refused before anything is sent: "This page is too big to send
  (x MB as an image; the limit is 6 MB). Split it across two sketches."
- The fixture sketch (`tools/mobile-harness/apps/notegeek/sketch-snapshot.json`) exports to
  **50,486 bytes** of PNG (67,316 base64 characters), measured in the harness's Chromium.

**Gateway** (`apps/basegeek/packages/api/src/graphql/notegeek/transcribe.js`):

- A **Mutation**, like `composeNote` (it costs money and writes nothing):
  `transcribeSketch(image: String!, mediaType: String!): SketchTranscript!`, returning
  `{ text, provenance: AIProvenance }`.
- `runAIFeature({ app: 'notegeek', feature: 'transcribe', need: 'vision+prose:balanced' })`.
  `parseNeed` accepts that compound as written. Cap 40 per user per UTC day; timeout 45 s;
  `maxTokens` 2500; temperature 0. The image travels as a content part
  `{ type: 'image', mediaType, data }`.
- Validation is zod (`transcribeSketchArgsSchema` in `validation.js`) and runs before any
  model is asked or the cap counts. It checks: mediaType is `image/png` or `image/jpeg`;
  base64 is at most 8 MiB of characters; no `data:` prefix; valid base64; and the **bytes
  match the declared type** (PNG and JPEG magic numbers). A provider handed a mislabelled
  image fails with a 400 that would otherwise reach Chef as "unavailable".
- **Failures are thrown**, never returned as empty text. Each is a GraphQLError with
  `extensions.details [{ message }]`, which the client's `saveErrorMessage` already reads:
  `AI_CAP`, `AI_UNAVAILABLE`, `AI_EMPTY` (including an answer that is only an empty code
  fence), and `AI_DEGENERATE` (Compose's `looksDegenerate` guard, reused). An outer code
  fence around the transcript is removed.

**Frontend** (`NoteEditorPage.jsx`, `components/editors/TranscribeDialog.jsx`,
`utils/sketchToText.js`):

- The ⋯ entry "Convert handwriting to text" shows on sketches only. It is disabled, with
  "Write something first", when the saved snapshot has no shape record. That is a string
  test for `"typeName":"shape"`, not a parse, because the page re-renders on every stroke.
- Starting a conversion saves the sketch if it is dirty or has never been saved, because
  the new note links back to its id.
- **Review step:** a dialog (full screen below `sm`) showing the exported page ("What the
  model saw") beside an editable "Transcript" box, so words can be corrected against the
  page. Actions: Discard, Keep as plain text, Compose it. An error shows its detail with
  "Try again". A 413 from nginx gets its own message.
- **Compose it** sends the *corrected* text to `composeNote`. The Compose dialog is opened
  **without** "Replace this note" (`onReplace` is now optional in `ComposeDialog`), and its
  Discard reads "Back to transcript" and returns to the review with the corrections kept.
- **The new note:** always `type: 'markdown'`, with the sketch's tags. Its title is the
  composed document's first heading, or "From sketch: <sketch title>" (always that for the
  plain path; a missing title becomes "Untitled sketch"). Its first line is
  `From sketch: [<sketch title>](/notes/<sketch id>)`, NoteGeek's existing link convention
  (`utils/noteLinks.js`). After saving, the page opens the new note. Nothing on this path
  calls `updateNote` or `setContent` on the sketch.
- **Keep as plain text** adds a Markdown hard break (two trailing spaces) to each line that
  is followed by another non-blank line. Without it, Markdown joined a handwritten list of
  lines into one run-on paragraph. No word or order changes.
- **Found on the way:** rendered GFM task boxes (`- [ ]`, which Compose's own prompt emits)
  were unlabelled 13px `<input>`s, which axe rejects. `markdownComponents.jsx` now renders
  them as named icons ("Done" / "Not done"). That applies everywhere markdown is rendered.

**Harness:** scenes `12a-sketch-menu`, `12b-sketch-review` (phone and desktop; checks the
image is bare base64 PNG under the ceiling, prints its size, and checks that the page and
the transcript don't overlap on a phone) and `12c-sketch-compose` (no Replace; Back to
transcript present). `transcribeSketch` and `composeNote` are stubbed per page.

### The Fine pen (added 2026-09-27) — `frontend/src/utils/finePen.js`

Chef: "Can we make that thin writing line even thinner?"

- **Fine** is the first choice in the phone pen picker ("Size: Fine", then Small, Medium,
  Large, Extra large; five 44px buttons fit a 390px phone), and new sketches start on it.
  It is tldraw size `s` plus **`scale` 0.5** on each new draw stroke. tldraw's stroke
  widths are private, so a per-shape scale is the only lever. With real pen pressure that
  is about 2.8px at 100% zoom, against Small's 4.6px, and it is still legible in the export
  the model reads (checked in the harness browser). Choosing any other size turns Fine off.
  The dot on the toolbar's pen button is smallest on Fine.
- A `registerBeforeCreateHandler('shape')` side effect applies it. It is registered in
  `onMount`, with the previous one dropped first (the store listener's no-stacking rule),
  and not on read-only sketches. Fine mode lives in a ref and in React state, never in the
  document.
- The handler touches **only a stroke being drawn right now**: type `draw`, size `s`,
  source `user`, the tool in `draw.drawing`, and a single point (how tldraw starts every
  stroke). It **sets** the scale to tldraw's own fresh value × 0.5 rather than multiplying,
  because tldraw splits a long stroke every `maxPointsPerDrawShape` points and copies the
  previous scale onto the new shape.
- **Why the guard is that tight:** loading a sketch runs before-create handlers in 2.4.6.
  `loadStoreSnapshot` turns side effects off, but the `atomic()` inside it defaults
  `runCallbacks` to true and turns them back on. A first version, keyed on "the draw tool
  is active", rescaled every saved Small stroke when a sketch was opened. That was found in
  a real-browser run before it shipped.
- Not the highlighter: Fine is a pen nib.
- **Desktop** has no pen picker (tldraw's own style panel is shown there). While Fine mode
  is on, which is the default, tldraw's `S` draws Fine; M, L and XL are unaffected.
- Exports need no help. `DrawShapeUtil.toSvg` wraps a stroke in `scale(1/scale)`, but
  `getSvgJsx` appends `scale(props.scale)` to its page transform, and the two cancel. This
  was checked in the browser: a Fine stroke exports at its on-canvas size. An earlier
  "correction" for this halved it and was removed.

## 3. A photographed notebook page (Chef, 2026-09-27)

Chef: "we have sketch on Notegeek now, can we do some sort of 'take a photo of a notebook
page' and have it process the same way it will the sketch->text?"

**Chef's decisions:**
- **The photo is kept as a sketch note:** the page image on a canvas you can mark up with
  the S Pen. The Markdown note links back to it, exactly like the sketch flow.
- **Several pages go into one note:** "Add another page" before transcribing.

### The flow
1. **Where it starts:** a **"Photo of a page"** entry in the new-note picker, and a Photo
   chip beside the five type chips on Home. On a phone it opens the camera
   (`<input type="file" accept="image/*" capture="environment">`); on desktop it's a file
   picker or drag and drop.
2. **The page tray:** each photo becomes a page thumbnail. Per page: **rotate** (90° steps)
   and **remove**. There's also **Add another page**, and pages can be reordered. At most
   **8 pages** per note, because the snapshot ceiling is 5 MB (see "Size").
3. **Preparing each page on the client:**
   - Decode with `createImageBitmap(file, { imageOrientation: 'from-image' })` so the
     photo's EXIF rotation is honoured.
   - Apply the chosen rotation, and scale down to at most **2000px** on the longest edge.
   - Re-encode as **JPEG at quality 0.85**, aiming for ~300–700 KB.
   - If the browser can't decode a format (some HEIC), say so plainly.
4. **Transcribing:** `transcribeSketch` gains an optional `source: 'sketch' | 'photo'`
   argument (a validated scalar, so the parity count is unchanged).
   - The **photo prompt** is the sketch prompt plus photo rules: transcribe the handwritten
     ink only; ignore ruled lines, margins, page edges, holes, shadows, the desk, and
     anything **printed** on the notebook (headers, dates, logos); cope with slight skew.
   - Pages go **one call each**, in order, with progress ("Page 2 of 4"). Every page counts
     against the daily cap of 40.
5. **Review:** the same review step. A strip of page images sits beside one editable
   transcript, with `--- page N ---` markers.
6. **Result:**
   - **A photo sketch note** is created. Each page is a tldraw **image shape** (the asset is
     embedded in the snapshot), stacked top to bottom. It's titled "Photos · <date>" (or the
     user's title), tagged like the result, and can be marked up with the S Pen.
   - **Compose** (or keep plain text) makes a **new Markdown note**, whose first line links
     back to the photo sketch note. As with sketches, nothing is ever replaced.

### Size
A page is ~300–700 KB as JPEG, or ~0.4–1 MB base64 in the snapshot. Eight pages fit
under the 5 MB snapshot ceiling (`SNAPSHOT_CONTENT_MAX`, `utils/saveGuards.js`), and each
transcription request fits under the 8 MB gateway cap and nginx's 12m. If a set of pages
would push the snapshot over the ceiling, say so before creating anything.

### Done when
- Two pages photographed on a phone become one photo sketch note plus one Markdown note
  linking to it, and the transcript shows both pages in order.
- The resolver's `source: 'photo'` prompt includes the ignore-printed-text and
  ignore-ruled-lines rules, checked red/green like the sketch prompt.
- Tests cover EXIF orientation, rotation, downscaling, the page limit and the size guard,
  the per-page calls in order, and the new-notes-only result.
- A harness scene shows the page tray and the review step on a phone, a11y-clean.

### As built (2026-09-27) — §3

**Gateway** (`transcribe.js`, `validation.js`, `typeDefs.js`, `resolvers.js`):

- `transcribeSketch(image: String!, mediaType: String!, source: String)`. `source` is a
  plain `String` (so the input-object parity count is unchanged), validated by zod as
  `sketch | photo` ("source must be sketch or photo."), and `null` or absent means
  `sketch`. Validation still runs before any model is asked or the cap counts, and a
  photo page counts against the same 40 a day.
- The seven sketch rules are one shared constant (`TRANSCRIBE_RULES`), so the photo
  prompt cannot drift from them. `TRANSCRIBE_PROMPT` is byte-identical to the §2 prompt.
  `TRANSCRIBE_PHOTO_PROMPT` has its own first line ("a photograph of a page from a paper
  notebook, written in pen or pencil"), the same seven rules, and four more:
  8 HANDWRITTEN INK ONLY, 9 IGNORE THE PAPER AND THE PHOTO (ruled, grid and margin lines,
  page edges, holes, binding, creases, shadows, glare, fingers, the desk; "a ruled line is
  never an underline, a dash or a list marker"), 10 IGNORE PRINTED TEXT (headers, printed
  dates and "Date: ____" fields, page numbers, brands, logos; what the writer wrote into
  such a field *is* transcribed), 11 COPE WITH SKEW. The user turn says "photographed
  notebook page" too.

**Where it starts:** the route is `/notes/photo` (`pages/PhotoPagesPage.jsx`; a static
segment, so it outranks `/notes/:id`). "Photo of a page" is a card after the five type
cards in the picker, and a Photo stamp after the five on Home. It is not a sixth type:
`PHOTO_ENTRY` in `noteTypeMeta.js` borrows the sketch's ink (the stamp contrast is the
sketch's, already tuned) with a camera glyph. `TypeStamp` and the picker's `TypeCard`
take a `meta` override for it.

**The tray:**

- "Take a photo" (the `capture="environment"` input) shows below `md` or on a coarse
  pointer. "Choose photos" (`multiple`) is always there, and the empty tray on desktop
  also takes a drop. Both inputs are hidden, with no tab stop; the buttons open them.
- Each page: thumbnail, "Page N", its prepared size in mono ("1500×2000 · 480 KB"), and
  four 44px buttons: Rotate (clockwise quarter turn), Move up, Move down, Remove.
  Reordering is by buttons rather than dragging, which works with a thumb, a keyboard
  and a screen reader alike.
- Pages are prepared as they arrive, **one at a time** (a queue). Decoding several 12 MP
  photos at once is how a phone tab runs out of memory. Rotate re-prepares from the
  original file, never from the already-encoded JPEG, so turning a page four times costs
  no quality. A stale preparation (the page was turned again or removed) is dropped.
- Over 8, the extra photos are not added, and a notice says how many. A photo that
  can't be decoded shows its message on its own row and blocks reading until removed.
- Title (optional; the placeholder shows the default "Photos · 27 Sep 2026") and tags
  (the existing `TagSelector`). Both notes get the tags. The date is formatted by hand,
  not with `toLocaleDateString`, because ICU versions disagree ("Sep" or "Sept").
- The meter reads "2 of 8 pages · 1.2 of 5.0 MB". Over the ceiling it shows the error
  and "Read N pages" is disabled. So "too big" is said before anything is read or
  created.

**Preparing a page** (`utils/photoPages.js`):

- `createImageBitmap(file, { imageOrientation: 'from-image' })`. A `TypeError` (a browser
  that rejects the option) retries without the options bag. Anything else, or no
  `createImageBitmap` at all, falls back to an `<img>`, which applies EXIF by default.
  If nothing decodes it: "This browser can't open HEIC photos (name). Set the camera to
  save JPEG ("Most compatible"), or take the photo from here." (for HEIC/HEIF by type or
  name), else "This browser can't open that image (name). Try a JPEG or PNG photo."
- It scales to fit 2000px first, then turns (the longest edge is the same either way),
  drawn about the canvas centre. The canvas is filled with white first, because JPEG has
  no alpha. It encodes JPEG at 0.85. The same prepared JPEG is what the model reads and
  what the photo sketch note keeps.

**Reading:**

- One `TranscribeSketch` call per page, `source: 'photo'`, `mediaType: 'image/jpeg'`,
  awaited in tray order. The next page is not sent until the previous one answers.
  Progress reads "Reading page 2 of 3…".
- Readings are kept per page and rotation. A failure stops the run with "Page 2 of 3:
  <reason>. Pages 1–1 are read; Try again carries on from page 2." A retry, and a return
  from the review, re-read only pages that are new or turned, so the cap isn't spent
  twice.
- One page has no marker. Two or more are joined as `--- page N ---\n<text>`, with a
  blank line between.
- The review is the §2 `TranscribeDialog` with `source="photo"`: the title "Photographed
  pages to text", "An approximation · check it against the pages", and a page strip. On
  a phone the strip is a row that scrolls sideways inside itself, each page 28vh tall at
  its own aspect; from `md` it is a column. It's focusable, labelled "The pages that
  were read", and each page's alt is "Page N as photographed". Discard reads **Back to
  pages**, and coming back with the same pages restores the corrected transcript instead
  of reading again.

**The result** (both notes are created only when the writer keeps the result):

1. **The photo sketch note first**, because the Markdown note links to its id:
   `type: 'handwritten'`, the title, the tags.
2. **Then the Markdown note:** the §2 helpers with `source: 'photo'`. The first line is
   `From photos: [<photo note title>](/notes/<id>)`; the title is the composed first
   heading, or "From photos: <title>". Keep as plain text gets the §2 hard breaks.
   Compose is opened with no Replace, and its Discard reads "Back to transcript".
- If only the Markdown note fails, the toast says the photos are saved, and a retry
  reuses that photo note rather than making a second. The photo note is keyed to the
  exact page set; if the pages change, a new one is made.
- Nothing on this path calls `updateNote`.

**The snapshot** (`utils/photoSketchSnapshot.js`, loaded with a dynamic `import()`, so
tldraw stays out of the page's chunk):

- Built by tldraw, never by hand. `createTLStore({ shapeUtils: defaultShapeUtils,
  bindingUtils: defaultBindingUtils })` gives the same schema `<Tldraw>` uses.
  `ensureStoreIsUsable()` makes the document and page records. `AssetRecordType.create`
  makes an image asset per page: a data URL, pixel w/h, `image/jpeg`, `fileSize`.
  `store.schema.types.shape.create` makes an image shape per page, with the shape
  validated on `store.put`. `getStoreSnapshot()` serialises it: the same
  `{ store, schema }` as the editor's `store.getSnapshot()`, without its deprecation
  warning.
- Before it's saved, the JSON is loaded into a second fresh store with
  `loadStoreSnapshot` (tldraw's own open path, migrations included). A body that would
  not open is refused, not saved. Then the exact length is checked against
  `SNAPSHOT_CONTENT_MAX`.
- Layout: every page is 1000 page units wide, its height by aspect, stacked at x 0 with
  a 48-unit gap, in index order (`getIndices`). `meta.photoPage` is N.
- **The images are locked.** tldraw's eraser, which is the S Pen's side button (§1),
  skips locked shapes, and so do selecting and dragging. Marking up a page never rubs
  out or moves the photo under it. To delete a page from the note, unlock it from the
  context menu.
- **Opening it:** `HandwrittenEditor` fits the first image shape into view (at most
  100%) the first time a sketch with image shapes loads. The fit waits for our first
  `updateViewportScreenBounds`: until then tldraw assumes a 1080×720 viewport, and an
  earlier version that fitted at mount opened the page at 100%, off to one side (found
  in the harness). It moves the camera only (session state), so it never dirties the
  note. Sketches without images open as before. No `<Tldraw>` prop, listener or
  before-create handler changed.
- List thumbnails draw image shapes as their outlines (`utils/thumbnails.js`), so a
  photo note's row isn't blank.

**Size, measured in the harness's Chromium:**

- **The fixture pages** (1200px notebook JPEGs, `tools/mobile-harness/apps/notegeek/`):
  111,188 and 92,228 bytes after preparation. **Two pages make a 273,375-character
  snapshot**; tldraw's own overhead is about 2 KB.
- **Eight synthetic camera frames**: 4000×3000, 3.36 MB each, with lit paper, ruled
  lines, ink and sensor noise. Each prepared to 2000×1500 at **~492 KB**, and **8 pages
  come to ~5.3 MB of snapshot, over the 5 MB ceiling**. The guard refused them before
  anything was read or created.
- **§3's "Eight pages fit" holds only below ~470 KB a page.** At 700 KB a page, 8 pages
  are ~7.5 MB of base64. What real S26 photos of Chef's notebook weigh is the number
  that decides it. If they land near 500 KB, the options are fewer pages per note, or
  keeping a smaller copy (for example 1600px) in the note than the one the model reads.
  That is a call for Chef, not made here.
- The estimate (`estimateSnapshotChars`: 4,000 + 1,000 a page + each data URL) is held
  by a test to be never below the real snapshot.

**Harness** (`tools/mobile-harness/apps/notegeek/`):

- `13a-photo-entry`: the picker card, then Home's Photo stamp to the empty tray.
- `13b-photo-tray`: two real JPEGs through the real preparation. It checks that page 2
  (stored 1600×1200, EXIF 6) comes out portrait.
- `13c-photo-review`: two calls, `source: 'photo'`, bare base64 JPEG, both pages in the
  strip, and the marked transcript.
- `13d-photo-note`, phone only: the page keeps the result. The photo note's content is
  taken from **its own CreateNote call** and opened. The scene fails on our error
  boundary, `.tl-error-boundary`, or `.tl-shape-error-boundary`, and requires two
  rendered image shapes.
- `13e-photo-markdown`: the Markdown note, with its back-link.
- `13f-photo-size`: the synthetic eight, printed.
- The fixtures come from `make-photo-fixtures.cjs` (thinggeek's `sharp`), at 91 KB and
  84 KB.
- **New waiver:** `image-alt` on `img.tl-image`, scene `13d-photo-note` only. tldraw
  2.4.6's image shape renders `<img>` with no `alt`, has no alt-text prop, and refuses a
  replacement `image` util ("defined more than once"). It's the same call as the slider
  waiver; drop it on tldraw 3 (`altText`).

**Only a phone can confirm:**

- The camera opening from `capture="environment"` in Samsung's Chrome.
- The S26 camera's EXIF orientation arriving upright. It's tested with a flag-6 JPEG in
  Chromium, not with a Samsung file.
- Whether its HEIC setting decodes in Chrome on Android.
- The real per-page size, which is the number that settles 8 pages (see Size).
- Writing over a locked photo with the S Pen, and the eraser sparing it.
