# NoteGeek — Architecture & Technical Context

NoteGeek is GeekSuite's note-taking application, supporting rich markdown, plain text, code snippets, handwriting/sketches, and visual mind maps.

---

## 1. System Architecture & Components

```mermaid
graph TD
    Browser["Client (Browser / PWA)"] --> Nginx["NGINX Edge (:80 / :443)<br/>notegeek.clintgeek.com"]
    Nginx -->|"/" & "/api/*"| Backend["NoteGeek Backend (:9988)<br/>Node + Express + Static Shell"]
    Nginx -->|"/graphql"| Gateway["Apollo GraphQL Gateway (:8987)<br/>(BaseGeek)"]
    Backend --> BaseGeekAuth["BaseGeek Auth Authority (:8987)<br/>Token Validation & User Profile"]
    Gateway --> Mongo[("Shared MongoDB (:27018)<br/>notegeek database")]
```

### 1.1 Containers and Networking
- **Public Domain**: `notegeek.clintgeek.com` (also responds to `notes.clintgeek.com`).
- **Container Name**: `notegeek`.
- **Image**: `ghcr.io/clintgeek/notegeek:latest`.
- **Port Mapping**: `9988 -> 9988` (host -> container).
- **Network**: `datageek_network` (external bridge shared by all suite services).
- **Healthcheck**: `wget --spider http://localhost:9988/`.

---

## 2. Authentication & SSO Integration

NoteGeek adheres to the GeekSuite SSO standard:
- **Central Authority**: `basegeek.clintgeek.com`.
- **Cookie Mechanics**: Uses shared `.clintgeek.com` cookies (`geek_token`, `geek_refresh_token`, `geek_csrf`).
- **Backend Session Validation**: Authenticated routes use `attachUser()` from `@geeksuite/user/server`.
- **Auth Proxies**: NoteGeek backend exposes `POST /api/auth/refresh` and `POST /api/auth/logout`, forwarding requests to BaseGeek using `authProxyHeaders()` from `@geeksuite/user` (forwarding `Cookie`, `Authorization`, and `X-CSRF-Token`).
- **Frontend Bootstrap**: `@geeksuite/auth`'s `AuthProvider` wraps the frontend tree, polling `/api/users/me` and rotating tokens every 50 minutes.

---

## 3. Data Architecture (Gateway-Owned)

NoteGeek's note storage, searching, and mutations are **100% gateway-owned** by BaseGeek's Apollo GraphQL server:
- **Gateway Location**: `apps/basegeek/packages/api/src/graphql/notegeek/`.
- **Mongoose Model**: `Note` collection in the shared MongoDB instance (`notegeek` db).
- **Zod Validation**: every mutation's arguments are validated with Zod (`notegeek/validation.js`).

### GraphQL Surface
Source of truth: `apps/basegeek/packages/api/src/graphql/notegeek/typeDefs.js`. (Corrected
2026-09-29: this list once named folders, locking, `recentNotes` and batch deletes, none of
which exist.)
- **Queries**:
  - `notes(tag, prefix, type, limit, sort)`: the list. `prefix` matches tags that start with it
    (`dev/` → `dev/frontend`); sending both `tag` and `prefix` narrows by both. Pinned notes always sort first, then `sort`.
  - `note(id)`: single note, scoped to the requesting user.
  - `noteVersions(noteId)`, `noteVersion(id)`: edit history.
  - `noteTags`: the user's distinct tags.
  - `searchNotes(q)`: full-text search, returning snippets.
  - `suggestForNote(noteId, title, excerpt, tags)`: AI tag and link suggestions.
- **Mutations**:
  - `createNote(title, content, type, tags)`
  - `updateNote(id, title, content, type, tags, changeReason)`: each update writes a
    history entry.
  - `restoreNoteVersion(versionId)`
  - `composeNote(content)`: AI compose; returns a draft and writes nothing.
  - `setNotePinned(id, pinned)`: owner-scoped. It writes no history entry and leaves
    `updatedAt` untouched.
  - `deleteNote(id)`, `renameTag(oldTag, newTag)`, `deleteTag(tag)`
  - `transcribeSketch(image, mediaType, source)`: reads a sketch's exported PNG, or (`source: 'photo'`) a photographed notebook page as JPEG with a prompt that ignores ruled lines and printed text, with the vision model (`need: vision+prose:balanced`, 40/day, every page counts). It writes nothing; the client saves new notes that link back. See `HANDWRITING.md` §2 and §3 ("Photo of a page", route `/notes/photo`). It needs `client_max_body_size 12m` on the vhost's `/graphql` location, or images over 1 MB get a 413.

### HTML & Markdown Security
Stored notes (`type: 'text'`) contain TipTap HTML. NoteGeek strictly sanitizes on both sides:
1. **Frontend**: Rendered markup passes through `frontend/src/utils/sanitizeNoteHtml.js` (DOMPurify).
2. **Gateway**: Mutations sanitize markdown/HTML on write via `apps/basegeek/packages/api/src/graphql/notegeek/sanitize.js`.

---

## 4. Frontend Editor Engines

NoteGeek provides multiple view and editor modes in `apps/notegeek/frontend/src/components/`:
- **Markdown / Rich Text**: TipTap editor with markdown extensions, checklists, and code formatting.
- **Handwritten / Canvas**: Mobile-optimized touch sketch canvas (`HandwrittenEditor.jsx` with viewport-fit handling).
- **Mind Map**: Node-based graph visualization.
- **Code**: Monospace syntax-highlighted editor.

---

## 5. Environment Configuration

Defined in `apps/notegeek/docker-compose.yml` and `.env.production`:

| Variable | Description | Default / Example |
|---|---|---|
| `PORT` | Local server port | `9988` |
| `NODE_ENV` | Environment mode | `production` |
| `LOG_LEVEL` | Pino logging level (`@geeksuite/logger`) | `info` |
| `MONGODB_URI` / `DB_URI` | Connection URI to shared MongoDB | `mongodb://...@192.168.1.17:27018/notegeek` |
| `JWT_SECRET` | Secret for JWT validation fallback | Shared suite secret |
| `BASEGEEK_URL` | Upstream auth and user authority | `https://basegeek.clintgeek.com` |
| `USERGEEK_API_URL` | UserGeek API URL | `https://basegeek.clintgeek.com/api` |

---

## 6. Testing & Quality Gates

- **Backend Unit Tests**: Jest suites in `apps/notegeek/backend/__tests__/` (auth isolation, proxy headers, rate limiting).
- **Frontend Unit Tests**: Vitest suites in `apps/notegeek/frontend/src/__tests__/` (components, stores, sanitizers).
- **Mobile UI Harness**: Tested and verified across 139 mobile scenes via `tools/mobile-harness` ensuring 44px touch targets and full dark/light theme contrast.

---

## 7. Visual identity — Graphite

Replaced the Lab Notebook on 2026-09-29 (Chef-approved). BuJoGeek became paper + black ink + red, and NoteGeek's cream + oxblood made it a sibling; and the Lab Notebook's chrome (uppercase mono stamps, six coloured type chips per row, a red "Saved" stamp in the header's best spot) was louder than the notes.

**Pencil on pale grey-green engineering paper.** Palette in `frontend/src/theme/graphite.js`, every text/ground pair measured in `src/__tests__/theme/graphiteContrast.test.js` (both modes).

- **Ink is graphite**, a warm dark grey (`#2F2E2B`), never black; at night light graphite (`#E6E3DC`) on slate (`#15181A` desk, `#1B1F22` chrome, `#212629` sheet). By day: desk `#E9EEE7`, chrome `#F1F4EF`, sheet `#F8FAF6`.
- **One accent: a highlighter** (`#F5DF4D` / night `#E2C94A`), only ever a **fill behind ink**: `::selection`, search-hit `<mark>`s, the active nav row / tag / filter / tab, the primary action (contained primary buttons, New note). Never yellow text on paper (it is ~1.2:1). MUI's `primary` is the graphite pencil, because the suite reads `primary.main` as link text and focus rings.
- **Loud only when it matters.** The one other colour is the error ink, used by the save alert and nothing decorative.
- **Type:** Spline Sans (titles, body, labels) + Spline Sans Mono (small metadata only: dates, counts, code), both self-hosted variable fonts (`@fontsource-variable/spline-sans`, `…/spline-sans-mono`, imported in `src/main.jsx`). Nothing is uppercased or letterspaced; section labels are sentence-case sans. Spline Sans sets a tight word space, so the theme adds `word-spacing: 0.06em` to body and form controls.
- **The grid:** a faint 16px engineering grid (`gridBackground` in `theme/tokens.js`) on the desk from `md` up and behind Home's capture box. Copy that needs contrast sits on a solid sheet.
- **Quiet rows** (`components/notes/NoteRow.jsx`): title, preview, then a meta line of the type as a small graphite glyph with an accessible name (`TypeIcon.jsx`, e.g. "Sketch note"), plain tags ("work · planning"), and lowercase mono time. The notes list filters by type with one row of quiet chips (icon + short plural label; the active one highlighted).
- **Save status** (`components/notes/SaveStatus.jsx`, states in `utils/saveStamp.js`): QUIET `SaveStatus` — small lowercase mono in the meta line under the title ("saved · 3m ago", "editing", "saving…"), always the page's one `role="status"`; LOUD `SaveAlert` — error ink on its tint with a Retry, in the head row beside ⋯, only when a save failed or you are offline with unsaved edits. On a phone the docked toolbar repeats the alert (via `store/editorChromeStore.js`). A repeated failure toasts once.
- **One New.** A new note is Markdown: `/notes/new` opens straight into it (no type picker). Phone: the tab bar's New opens `components/new/NewNoteSheet.jsx` (note, photo of a page, sketch; code and mind map under More); Home's capture box also offers photo and sketch while empty and saves a Markdown note. Desktop: a split button in the top bar (`NewNoteMenu.jsx`). Rich text (`type: 'text'`) still opens and edits; it is not offered as new (`?type=text` still works).
- **Home is the capture box and your notes** — no greeting, no "Continue" cards; the first phone screen shows notes.
- **Icons:** a graphite pencil drawing a line across a pass of highlighter, on the grid paper (`public/icons/*.svg`, rendered by `node tools/pwa-icons.mjs --app notegeek`). Manifest `theme_color` `#F1F4EF`, `background_color` `#E9EEE7`.

Layout facts this pass depends on:

- `Layout.jsx` passes `GeekAppFrame fill` on single-note routes (`/notes/new`, `/notes/:id`, `/notes/:id/edit`), so the page owns its scroller; `NotePage` wraps the read-only viewer in its own. Those routes also pass no `bottomNav` (MobileBottomNav hides there anyway, but its inset used to leave a 56px strip). On a phone they pass no `topBar` either while `editorChromeStore.writing` is true (NoteShell sets it while the caret is in a title, body or tags field), so the suite bar tucks away while you write.
- The phone has no drawer: `Layout` passes `nav` only from `md` up, `Header` passes `leading={null}` (no hamburger) and no search slot. The tag tree is `TagsPanel` (exported from `Sidebar.jsx`), which the Notes page opens in a `GeekSheet` from its Tags button.
- The suite theme floors every `IconButton` at 44px on all widths. Desktop controls that should be compact (the toolbar, tag-tree chevrons, the ⋯ button) opt down explicitly above `md`; phones keep 44.
- The page-type formatting strip is `components/editors/EditorToolbar.jsx`: inline and sticky from `md` up; on a phone it is portalled to `<body>` and docked `bottom: keyboardInset` (`hooks/useKeyboardInset.js`, a copy of BuJoGeek's visualViewport hook — apps do not import each other). It swallows `mousedown` on its buttons so a tap does not blur the text. `NoteShell` pads the page by the bar's height on phones.
- Sidebar tag counts come from `GetNoteTagCounts` (`notes { id tags }`) — `noteTags` is a bare string list. It is a `notes` root field, so every note write evicts and refetches it with the tag index. The gateway loads whole documents for it; fine at today's size, worth a dedicated `noteTagCounts` resolver if the library grows large.
- List thumbnails (`components/notes/NotePreview.jsx`, geometry in `utils/thumbnails.js`) parse sketch / mind-map JSON only once a row nears the viewport, in an idle callback, memoised per note version. Measured 2026-09-26 in Chromium: 200 rows with 60 × 1MB sketches scroll with zero long tasks.
- List grouping (`utils/recency.js`) uses the writer's LOCAL calendar day — Today, Yesterday, This week, then months — and applies to the Recent and Created sorts only.

---

## 8. Print / Save as PDF

Added 2026-09-30. The browser's own print path, no PDF library: `window.print()` plus a print stylesheet. Android Chrome and the installed PWA offer **Save as PDF** in that dialog; so does desktop.

- **Where:** "Print or save as PDF" in the editor's ⋯ menu (every type, including a mind map in view mode), a print button in the read-only viewer's action bar (`NoteViewer.jsx`), and **Ctrl/Cmd+P** while a note is open (`hooks/useNotePrint.js` takes the shortcut so it runs the same path).
- **The paper copy** is `components/notes/NotePrintView.jsx`, portalled to `<body>` and `display: none` on screen. In print, `notePrint.css` hides every other child of `<body>` (the app, MUI menus/dialogs/backdrops, toasts) and releases the frame's fixed-height layout, so a long note flows onto more pages. Black on white, `@page` margins 18/16/20mm, Spline Sans 11pt, 20pt title, a mono meta line (updated date, code language, tags). Because it is mounted whenever a note is open, even the browser menu's Print gets the note, not the chrome.
- **Per type:** markdown renders with GFM (real tables, borders, header row repeats, rows don't split; code blocks wrap instead of clipping; links print their URL after them in 8pt; task boxes as ☑/☐); rich text is the sanitized TipTap HTML (link URLs via CSS `::after`); code is the decoded code, monospace, wrapped; a **mind map prints as a nested outline** (`mindMapOutline` in `utils/printNote.js`: root, children top-to-bottom as on the canvas, unconnected nodes appended) — React Flow has no image export and a screenshot would print whatever the camera shows; a **sketch** is exported by tldraw right before the dialog (`exportSketchForPrint` in `utils/sketchExport.js`: light ink on white, up to 3000px, no size cap) and printed scaled to the page; a **photo sketch** prints one page per photographed page, each with the ink that overlaps it.
- **Filename:** `document.title` becomes the note's title while printing (so "Save as PDF" suggests it) and is restored on `afterprint` — not after `print()` returns, because on Android it returns at once.
- **Limit:** printing from the browser's own menu (not NoteGeek's ⋯ or Ctrl+P) cannot wait for a sketch export, so it prints the last export or a line saying where to print from. A very tall single sketch is scaled to fit one page.
- **Checks:** unit tests in `__tests__/utils/printNote.test.js`, `components/notes/NotePrintView.test.jsx`, `pages/noteEditorPrint.test.jsx`; harness scenes `14a-print-markdown`, `14v-print-viewer`, `14b-print-sketch` (title swap, table and link URL in the paper copy, the sketch image loaded before the dialog, print media shows only the paper copy).

---

**Running header and footer (2026-09-30).** notePrint.css defines `@page { @bottom-right }` with "Page N of M", and while printing `printNote.js` injects a style (`#ng-print-page-header`) with the note title in `@top-left` for pages 2 onward (page 1 opens with the title already). Defining ANY margin box also switches off Chrome's default headers and footers (the date, "NoteGeek", the URL); this was verified in Chromium 145. So keep at least one margin box even if the wording changes. Text in the PDF stays real, selectable and searchable text; only sketches are images.

## 9. Import a Markdown file

Added 2026-09-30. Each `.md` / `.markdown` / `.txt` file becomes one new **Markdown** note through the ordinary `createNote` (title, body and type in one call; no backend change). A `.txt` becomes Markdown too, not `text`: `text` is TipTap HTML, where a plain file's line breaks and any `<` would be read as markup, while the Markdown editor shows a plain file exactly as written.

- **Desktop — drop:** drag files onto home, the notes list, a tag's list or search, or onto a brand-new note that is still empty (`NoteEditorPage` sets `editorDropOk` in `store/importStore.js`; any title or body, a saved draft, or a non-Markdown type withdraws it — a sketch's tldraw takes its own drops, and `/notes/photo` has its own image drop). A drop zone (desk-tinted scrim, dashed ink card, highlighter badge) covers the page while files are over it. Anywhere else a drop is left to the page.
- **Phone — pick:** "Import a Markdown file" at the bottom of the New sheet (and "Import Markdown files" in desktop's New menu) opens a hidden `<input type="file" multiple accept=".md,.markdown,.txt,text/markdown,text/plain">`. Selection is by extension first: Android hands a `.md` over as `application/octet-stream`.
- **One importer:** `components/new/NoteImporter.jsx`, mounted once in `Layout` inside `GeekToastProvider`. Header and the tab bar (where the New surfaces live) render outside that provider, so their toasts would be dropped; they call `openImportPicker()` instead, which clicks the importer's input synchronously inside the tap (a file picker needs the user's gesture).
- **Title and body** (`utils/importMarkdown.js#noteFromMarkdown`): the document's opening `# heading` (ATX or setext, after any YAML front matter, which is kept) is the title and is removed from the body so it isn't said twice; otherwise the filename without its extension. A file that is only a heading keeps it as the body (the gateway refuses an empty `content`). Titles cap at 500 characters (the gateway's). CRLF → LF; decoded as UTF-8 with the BOM dropped.
- **Limits:** a file over 1 MB is refused before it is read; a body over the gateway's 100 000 characters (`saveGuards.js`) is refused before it is sent; empty files are refused. Anything that isn't Markdown or text is skipped with a warning toast; failures toast with the file's name.
- **After:** one file dropped or picked opens its note; several stay put with "Imported N notes."
- **Checks:** `__tests__/utils/importMarkdown.test.js`, `components/new/NoteImporter.test.jsx`, `components/new/newSurfacesImport.test.jsx`, `pages/noteEditorImportDrop.test.jsx`; harness scenes `15a-import-picker` (the real file chooser), `15b-import-dropzone`, `15c-import-drop`.
