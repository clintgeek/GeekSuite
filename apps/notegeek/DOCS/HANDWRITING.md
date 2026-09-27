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
