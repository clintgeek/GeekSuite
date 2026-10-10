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
- **Mongoose Model**: `Note` collection in the shared MongoDB instance (`noteGeek` db), plus
  `noteChunks` (embedded passages, §11) and `noteversions`.
- **Zod Validation**: every mutation's arguments are validated with Zod (`notegeek/validation.js`).

### GraphQL Surface
Source of truth: `apps/basegeek/packages/api/src/graphql/notegeek/typeDefs.js`. (Corrected
2026-09-29: this list once named folders, locking, `recentNotes` and batch deletes, none of
which exist.)
- **Queries**:
  - `notes(tag, prefix, under, type, limit, sort)`: the list. `tag` is an exact tag; `prefix` matches
    tags that start with the raw string (`dev/` → `dev/frontend`); `under` is the nested-tag view — the
    tag itself **or** anything beneath it (`house` → `house`, `house/garage`; never `houseboat`),
    normalized like a stored tag. Any combination narrows by all of them. Pinned notes always sort
    first, then `sort`. `tag`/`prefix` stay for old cached bundles; the UI sends `under`.
  - `note(id)`: single note, scoped to the requesting user.
  - `noteVersions(noteId)`, `noteVersion(id)`: edit history.
  - `noteTags`: the user's distinct tags.
  - `noteTagUsage(tag)` → `{ notes, subTags }`: notes carrying the tag or any descendant, and how
    many distinct sub-tags sit beneath it. The delete dialog reads it before asking.
  - `searchNotes(q, under, hybrid)`: search, returning snippets; `under` optionally narrows to a
    tag subtree. `hybrid: true` (added 2026-09-30) also matches by meaning with the LOCAL embeddings
    and fuses both lists (§11); each row then carries `matchedBy` (`keyword` / `meaning` / `both`) and,
    for a meaning hit, `why` (the passage that matched). Omitted = the old keyword search, so cached
    bundles keep working.
  - `relatedNotes(noteId, limit)` → `[SimilarNote]` `{ id title type updatedAt score snippet }`:
    the owner's notes nearest in meaning (§11). Empty until the note is indexed.
  - `noteIndexStatus` → `{ total indexed stale failed skipped chunks model serviceAvailable lastError
    lastOkAt }`: how much of the caller's library is searchable by meaning.
  - `backlinks(noteId)` → `[Backlink]` `{ id title type updatedAt snippet }`: the owner's notes that link
    to this one (`[[its title]]` or an in-app `/notes/<id>` link), newest first, max 50, never itself;
    `snippet` is ~70 characters either side of the link (§12).
  - `noteTitles(q, limit)` → `[NoteTitle]` `{ id title type updatedAt }`: titles containing `q`
    (case-insensitive, regex-escaped), prefix matches first, then most recent; default 20, max 50.
    The `[[` picker's source — no bodies.
  - `Note.links` → `[NoteLink]` `{ key title noteId }`: the note's outgoing links (§12).
  - `suggestForNote(noteId, title, excerpt, tags)`: AI tag and link suggestions.
- **Mutations**:
  - `createNote(title, content, type, tags)`
  - `updateNote(id, title, content, type, tags, changeReason)`: each update writes a
    history entry.
  - `restoreNoteVersion(versionId)`
  - `composeNote(content)`: AI compose; returns a draft and writes nothing.
  - `foldInPreview(noteId, input)` → `FoldInProposal { operations summary unplaced stats baseUpdatedAt provenance }`:
    Fold-in (§13) — anchored edits that put new information into an existing Markdown note. Writes nothing.
  - `foldInApply(noteId, baseUpdatedAt, operations)` → `FoldInResult { note versionId applied }`: re-validates,
    snapshots a version (`reason: fold_in`) first, applies all or nothing; `CONFLICT` when the note changed and an
    anchor broke. Undo = `restoreNoteVersion(versionId)`.
  - `setNotePinned(id, pinned)`: owner-scoped. It writes no history entry and leaves
    `updatedAt` untouched.
  - `deleteNote(id)`
  - `renameTag(oldTag, newTag)` → `Boolean!` (true when any note changed): renames or **moves** the
    whole subtree — `house` → `home` turns `house/garage` into `home/garage`; `garage` →
    `house/garage` moves it and its children. Merges into an existing tag with no duplicates (one copy,
    at the first position). Refuses a move into its own descendant (`house` → `house/garage`) and a
    rename that would push a child past 100 characters, both as `BAD_USER_INPUT`. One aggregation-
    pipeline `updateMany`, owner-scoped. A normalized no-op (`work` → `work `) returns false.
  - `deleteTag(tag)`: removes the tag **and every tag beneath it** from the owner's notes. Notes are
    never deleted.
- **Tags are `/` paths, normalized on write** (`notegeek/tags.js`, copied in the frontend as
  `src/utils/tagPath.js` — change both): trim, split on `/`, trim each segment, drop empty
  segments, rejoin (`" house // garage/ "` → `house/garage`); empties dropped; exact-string dedupe
  keeping order. Case is kept — `Work` and `work` are different tags. Applied to createNote/updateNote
  `tags` and the renameTag/deleteTag inputs. Nothing about the tree is stored; it is read off the
  strings.
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

Replaced the Lab Notebook on 2026-09-29 (Chef-approved). TodoGeek became paper + black ink + red, and NoteGeek's cream + oxblood made it a sibling; and the Lab Notebook's chrome (uppercase mono stamps, six coloured type chips per row, a red "Saved" stamp in the header's best spot) was louder than the notes.

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
- The page-type formatting strip is `components/editors/EditorToolbar.jsx`: inline and sticky from `md` up; on a phone it is portalled to `<body>` and docked `bottom: keyboardInset` (`hooks/useKeyboardInset.js`, a copy of TodoGeek's visualViewport hook — apps do not import each other). It swallows `mousedown` on its buttons so a tap does not blur the text. `NoteShell` pads the page by the bar's height on phones.
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

## 10. Nested tags (Bear-style)

**Amended 2026-10-01 — the suite tag standard.** Tags are lowercase kebab-case segments (`work/geek-suite`),
from `@geeksuite/tags` (`DOCS/TAG_STANDARD.md`), the one package the gateway and this UI both use —
`utils/tagPath.js` and `utils/inlineTags.js` now import it (the duplicated normalizer, the inline-tag reader and
`utils/tagTree.js` were deleted). `#GeekSuite`, `geek suite`, `geek_suite` are all `geek-suite`; case folds, so a
case-only rename is a no-op. Chips normalize on commit (Enter/pick), not while typing; option matching ignores
hyphens (`geeks` finds `geek-suite`). The gateway reads legacy spellings tolerantly until the migration runs.
Where this section says "case-insensitively" or lists `_` as kept, read it through that rule.

Added 2026-09-30. A tag is a `/` path: `house/garage` is a tag of its own **and** sits under `house`, the way a Bear notebook holds notebooks. Nothing about the tree is stored; it is read off the strings, so the spelling rule (§3, `src/utils/tagPath.js` — a copy of the gateway's `tags.js`) is applied everywhere a tag is written. The gateway commit must be live before this UI: the list sends `notes(under:)` and the delete dialog reads `noteTagUsage`.

- **A tag's page** (`/tags/:tag`, `components/TagNotesList.jsx`) lists `notes(under: tag)` — the tag and everything beneath it (`house` shows `house`, `house/garage`, `house/kitchen`; never `houseboat`). Each row's meta line names the sub-tag the note sits in, relative to the page (`garage`, `garage/door`), first; the page's own tag is dropped from the row since the heading says it (`rowTagLabels`). Above the list: a breadcrumb (`All notes › house › garage`, 44px targets on a phone, the current tag an `h1`) and a row of the direct sub-tags as links with the tree's descendant-inclusive counts (same `GetNoteTagCounts` cache entry as the sidebar, so the numbers agree).
- **The tree** (`Sidebar.jsx` TagsPanel, the phone's Tags sheet): the row's name is the link to the tag's page — a parent opens its page, the chevron alone expands. The ⋯ button is always visible on a phone (`down('md')` and `(hover: none)`), since it is the only way to rename or delete there.
- **Rename or move** (`TagContextMenu.jsx`): one field, "Tag path"; helper text says sub-tags and notes come along and that `/` moves it. The button reads "Move" when the parent changes. A move into its own descendant (`house` → `house/garage`) is refused in the dialog before anything is sent (`renameProblem`), and a server refusal (e.g. a child would pass 100 characters) stays in the dialog. Renaming the tag being viewed (or an ancestor) moves the URL with it.
- **Delete** is a `GeekDialog mode="window"` (no `window.confirm`): "Removes #house and its 2 sub-tags from 7 notes. The notes stay.", counted by `noteTagUsage` when it opens. Deleting the tag being viewed goes back to `/notes`.
- **tagStore** mirrors the gateway: subtree rename (`swapPrefix`, merged, sorted), subtree delete, and the same into-own-descendant refusal.
- **Chips** (`TagSelector.jsx`): whatever is typed is normalized (`house / garage` → `house/garage`); options are full paths; `house/` lists `house/garage`, `house/kitchen` (prefix matches first; `filterTagOptions`).
- **Inline `#tags`** (`utils/inlineTags.js`), `markdown` and `text` notes only. On save the body's tags are MERGED into the chips — additive; deleting the text does not remove a tag, the chip does. Rule: `#` at the start or after whitespace or `(`, then a letter, then letters/digits/`_`/`-`/`/` (Unicode letters and marks); stops at anything else; trailing `/` dropped; normalized like a stored tag. Ignored: `# Heading` (hash + space), fenced and inline code (`<pre>`/`<code>` in rich text), URLs and link targets (`https://x.com/#s`, `[a](#anchor)`, `<a href="#x">`, `[ref]: url`), a hash glued to a word (`C#`, `a#b`, `\#x`, `&#35;`), anything starting with a digit (`#1`, `#2nd`), hex colours (exactly 3/4/6/8 hex chars — so an all-hex word like `#cafe` or `#beef` is read as a colour; add it as a chip), tags over 100 characters, and anything past the 50-tag cap. Compared case-insensitively with the chips (`#work` does not add a second `Work`). Two session-only memories: a tag a save added from the body that has since grown into a longer one (`#hou` autosaved mid-word, now `#house`) is taken back off; and a chip removed by hand is not re-added from the body until the note is reopened. Known edge: `#Heading` with no space is a tag, since in CommonMark it is not a heading.
- **Rendered Markdown** (viewer and editor preview; not print or Compose) turns inline `#tags` into links to their page (`utils/remarkInlineTags.js`, the same token rule; router links, secondary ink, `a.ng-inline-tag`). Rich-text notes are not linkified — their HTML is rendered sanitized, and rewriting it was out of scope.
- **Checks:** `__tests__/utils/tagPath.test.js`, `utils/inlineTags.test.js`, `components/markdownInlineTags.test.jsx`, `components/TagNotesList.test.jsx`, `components/TagContextMenu.test.jsx`, `components/TagSelector.test.jsx`, `pages/noteEditorInlineTags.test.jsx`, `store/tagStore.test.js`; gateway `notegeekNestedTags.test.js`; harness scenes `16a-tag-parent-view`, `16b-tag-rename-dialog`, `16c-tag-delete-dialog` (fixture tags `house`, `house/garage`, `house/kitchen`).

## 11. Meaning-based search and Related notes (local embeddings)

Added 2026-09-30. **Privacy guarantee: note text goes only to the local embeddings container on this box
— never to aiGeek, OpenRouter or any cloud provider, not even as a fallback.** When the local service is
down, search is keyword-only and Related is empty; nothing else is asked.

- **The service:** `datageek_embeddings` (Ollama, `mxbai-embed-large`, 1024 dims, since 2026-10-01;
  `nomic-embed-text`, 768, before), on `datageek_network` at `http://datageek_embeddings:11434`, no
  host port (RUNBOOK §3). Knobs, both optional — the defaults are production's, since Watchtower
  deploys never pick up new env vars: `EMBEDDINGS_URL`, `EMBEDDINGS_MODEL`; `NOTEGEEK_INDEXER=off`
  stops the worker. Each model's width, task prefixes and score scale are one row of
  `EMBEDDING_MODELS` in `embeddings.js`: mxbai prefixes a query with `Represent this sentence for
  searching relevant passages: ` and a passage with nothing; nomic uses `search_query: ` /
  `search_document: `. `embeddings.js` adds them. Why mxbai: nomic squashed every score into
  0.50–0.73, so junk and true hits overlapped; mxbai separates them ("what pills do I take every
  day" → the meds note 0.720, the next 0.439). Its window is 512 tokens — a 350-word passage is
  about that; Ollama truncates the rest and the 40-word overlap carries it into the next passage.
- **Where the code is** (gateway, `apps/basegeek/packages/api/src/graphql/notegeek/`): `embeddings.js`
  (the only network call — a POST to `${EMBEDDINGS_URL}/api/embed`; ≤ 8 000 chars per request,
  ≤ 4 000 per input), `chunking.js` (note → passages), `indexer.js` (background worker), `semantic.js`
  (vector cache, hybrid fusion, related, status), `models/NoteChunk.js`.
- **Enforced and tested** (`src/__tests__/notegeekSemantic.test.js`): those modules may not import the
  AI stack or any provider client (the test reads their sources), only `embeddings.js` calls `fetch`,
  and every embed call a full index + search cycle makes is asserted to target `EMBEDDINGS_URL`.
- **What is embedded:** title + body in passages of ~250–350 words with a 40-word overlap, cut at
  paragraphs and headings; the title opens the first passage. markdown as written; rich text with
  the HTML stripped; code's code; a mind map's node labels; a sketch or photo note its title only
  (an untitled one is `skipped`); a locked or encrypted note its title only. At most 60 passages.
- **Stored:** `noteChunks` `{ userId, noteId, chunk, text, textHash, vector[1024], model, updatedAt }`,
  not on the Note (keeps list reads light). Bookkeeping on the Note (never in GraphQL):
  `embeddingState` (`stale` / `indexed` / `skipped` / `failed`; absent = stale), `embeddingHash`,
  `embeddingAttempts`, `embeddingRetryAt`, `embeddingError`. Indexer writes use `timestamps: false`,
  so indexing never moves a note in the Recent list.
- **Indexing is background work, never on a save:** Note middleware flips `embeddingState` to `stale`
  on any create or title/content write (tags and pins don't). Every 10 s a single-flight loop takes
  the stale note edited longest ago, but only once it has been **still for 30 s** (autosave bumps
  `updatedAt` every ~2 s while typing, so a note is embedded once, after you stop). Same passages
  as last time (sha256 of model + passages) → marked indexed with no embed call. Passages go one
  request each (≤ 2 500 chars), so a search query never waits behind more than ~2 s of CPU. An edit
  that lands mid-embed leaves the note stale and it goes round again. A tick stops after 25 s.
- **Backfill:** notes from before this have no state and are simply the oldest in the queue. A sweep
  at start-up (20 s after boot) and hourly deletes chunks of deleted notes and re-queues "indexed"
  notes with no chunks **of the current model**. `deleteNote` deletes its chunks at once.
- **Changing the model** is a background re-index, not a migration: search, Related and
  `noteIndexStatus.chunks` read only chunks whose `model` is the current one; the start-up sweep
  re-queues every indexed note that has none (the passage hash includes the model, so nothing is
  skipped as "unchanged"); re-embedding a note replaces its rows by (note, chunk), so its old-model
  rows go with it, and the sweep deletes strays. Meanwhile search is keyword + whatever is already
  re-embedded, never a mix of two models, never an error — and claims no best match while any
  old-model chunk is left. Chef's library (34 notes, 96 passages) at ~3.5 s a passage ≈ 6–7 min. (NoteGeek has no trash — delete is
  delete.) Measured 2026-09-30 against the live service on a busy box: the 14 harness fixture notes
  (14 passages) took 12.9 s; an 1 873-word note was 8 passages, ~16 s.
- **Failure handling:** connection error, timeout or 5xx → the whole loop pauses with doubling
  backoff (30 s → 15 min, shared with search), the note is not charged. A 400 → the note is charged:
  retry in 5 min × attempts, `failed` after 5. Logged via the basegeek pino logger
  (`module: notegeek-indexer`) with note ids only, never text.
- **Hybrid search** (`searchNotes(hybrid: true)`, ranking in `semantic.js` `rankHybrid`):
  - **Keyword weak-hit cut:** Mongo `$text` hits (≤ 100) under 40% of the top textScore are dropped
    (`KEYWORD_MIN_RATIO`; the top hit always stays). "What auth credentials do I have for
    GameGeek?" scored 2.23 / 1.84 / 0.50 / 0.50 / 0.50 — the 0.50s were one common word each.
  - **Vector hits:** cosine of the query against every passage of the current model, best passage
    per note (a note's score is its single best passage — never a sum, so long notes get no extra
    weight), kept if ≥ the model's `floor` **and** within its `gap` of the best hit, at most 20.
    mxbai: floor 0.55, gap 0.08 (nomic kept 0.55 / 0.06).
  - **Fusion:** weighted Reciprocal Rank Fusion, score = Σ w / (60 + rank), keyword w = 1.0, vector
    w = 0.8, ties to the keyword hit. Meaning-only hits are re-read through the same owner + `under`
    scope.
  - **Best match** (`bestMatch: true` on at most one row, always moved first): the vector #1 when it
    clearly wins, judged by its lead over the vector #2 (the raw runner-up, before the cut) — a lead
    ≥ 0.08 and a score ≥ 0.60 on meaning alone, or a lead ≥ 0.04 when it is also the top keyword
    hit. Never with no vectors (embeddings down, nothing indexed) and never mid-backfill. Everything
    else keeps its RRF order. "What pills do I take every day": the meds note has none of those
    words; the old ranking put it 17th of 17 (16 notes share "take" / "every" / "day"), the keyword
    cut alone 6th of 6 — the best match puts it first.
  - **Known limit:** the keyword cut is relative to the top hit, so when the top keyword hit is
    itself junk ("change a keyboard key": 20 notes say "key"/"change", the top at 1.97) the cut
    keeps 12 junk rows and drops the true note (0.51) from the keyword list — the vector list still
    finds it and the best match puts it first, but "Also related" stays noisy. A vector veto on
    keyword-only rows is the next lever, not shipped: it would cost exact-serial searches.
  - **Calibration** (live, Chef's library, 2026-10-01, mxbai): true hits 0.57–0.76, junk 0.38–0.56
    (long notes the usual 0.52–0.56 — the best of 12 passages is a high-water mark of noise),
    nonsense ≤ 0.50. Clear wins led by 0.098–0.324, near-ties by 0.024–0.050. The full table is in
    the header of `semantic.js`.
  - The query embedding waits at most 5 s, is cached (200 queries, per model), and is skipped
    outright while the service is marked down.
- **Related notes** (`relatedNotes`): the centroid of the note's passages against every other note's
  best passage, ≥ the model's `relatedMin` (mxbai 0.70: same-topic pairs scored 0.70–0.90, unrelated
  ones up to 0.69; nomic 0.65), top 5 (max 20), excluding itself; survivors re-read from `Note` by owner,
  which drops deleted notes.
- **Scale ceiling:** brute-force cosine in Node over the user's passages, cached in memory per user
  as Float32Arrays (10 min TTL, 32 users, invalidated by every index write and delete). ~2 000 notes ×
  3 passages × 1024 floats ≈ 25 MB and ~5 ms a query. Past ~50 000 passages per user (≈150 MB, ~100 ms) move to a
  real ANN index (pgvector next door, or Mongo vector search).
- **Check it:** `noteIndexStatus` (owner-scoped counts + `serviceAvailable` / `lastError`). From the
  host: `docker exec basegeek node -e "fetch('http://datageek_embeddings:11434/api/embed',{method:'POST',body:JSON.stringify({model:'mxbai-embed-large',input:['hi']})}).then(r=>r.json()).then(j=>console.log(j.embeddings[0].length))"` → `1024`.
- **UI (2026-09-30; needs the gateway above live first — the bundle sends `hybrid` and selects
  `matchedBy` / `why` / `relatedNotes`, which an older gateway rejects):**
  - Search (`components/SearchResults.jsx`) always asks for `hybrid: true` (`services/api.js`).
    Results update as you type (300 ms debounce into `?q=`); while a newer search is in flight the
    previous results STAY on screen with a small spinner — skeletons only when there is nothing yet.
    The count line says how many are by meaning: "3 results · 2 similar".
  - **Best match (2026-10-01; needs the 2026-10-01 gateway first — the bundle selects `bestMatch`):**
    when a row has `bestMatch`, it is pulled out into its own region headed **"Best match"** (an h2
    on a pass of highlighter — `hl` fill, `onHl` ink), on the writing sheet with a 4px highlighter
    rule down its left edge, showing the passage that matched (`why`, even for a keyword/both hit,
    words still marked) at up to four lines in body ink (`NoteRow prominent`). The rest follow
    under a quieter h2 **"Also related"** (`data-search-best` / `data-search-also`). The count line
    still counts every row. No best match → the plain list, no headings, exactly as before.
  - A meaning-only row (`NoteRow`, `matchedBy === 'meaning'`) shows the passage that matched (`why`)
    instead of the note's opening, highlights nothing, and carries a quiet italic **"similar"** in its
    meta line (`data-match="meaning"`; its title says it may not contain your words). Keyword and
    both rows highlight each query word of 3+ letters (`utils/highlightTerms.js`, a few stop words
    skipped) — before this a multi-word query marked nothing, since only the whole phrase was sought.
  - **Related notes** (`components/notes/RelatedNotes.jsx`, mounted by `NoteFooter.jsx`, list markup
    in `NoteSection.jsx`) at the foot of the read-only viewer and of the editor (page types only — a
    canvas has nowhere to put it; `NoteShell`'s `footer` prop). Five rows: type glyph, title, one line
    of the closest passage; 44px rows; heading "Related notes" + "similar in meaning". Its own
    `cache-and-network` query: renders nothing while loading, on error, or when empty, so it never
    blocks or shifts the note. Not printed.
  - **Checks:** `__tests__/components/notes/hybridSearch.test.jsx`,
    `__tests__/components/notes/searchBestMatch.test.jsx`, `__tests__/services/api.test.js`;
    harness `14h-search-hybrid` (types "fix the garage"; every search asked for hybrid, two "similar"
    rows with no marks, the keyword row marked), `14i-search-best-match` (the block first, one note
    in it, two under "Also related", 44px row), `14j-search-near-tie` (no block, no headings),
    `17a-related-viewer`, `17b-related-editor`. Gateway: `src/__tests__/notegeekSemantic.test.js`
    (model table, mixed-model chunks ignored, re-embed on model change, mid-backfill, keyword cut,
    best match on a clear win and not on a near-tie, long notes not weighted).

## 12. [[Links]] and backlinks

Added 2026-09-30 (gateway: `apps/basegeek/packages/api/src/graphql/notegeek/links.js`).

- **Syntax:** `[[Note title]]` and `[[Note title|shown text]]` in **markdown** and **rich-text** notes.
  Matched case-insensitively (whitespace collapsed) against the owner's own titles. Fenced code, inline
  code and `<pre>`/`<code>` are skipped (`if [[ -f x ]]` in a script is not a link). An in-app link
  `[text](/notes/<id>)` / `<a href="/notes/<id>">` — what the suggestion strip's "Insert link" writes —
  counts too, already resolved by id. Max 200 links a note; titles cut at 500 characters.
- **Stored:** `Note.links: [{ key, title, noteId }]`, recomputed on every write of the body or type
  (createNote, updateNote, restoreNoteVersion). `key` = lowercased title, or `id:<hex>` for an id link;
  `noteId` = the target, or null while no note has that title. Indexed `{userId, links.noteId}` and
  `{userId, links.key}`. Notes written before this have no links until their next save.
- **Resolution choices:**
  - A link keeps the note it already pointed at (same key, note still exists); otherwise it resolves by
    title, the **oldest** note first if two share one; otherwise it is stored unresolved.
  - Creating a note, or retitling one, resolves every unresolved link to that title (one `updateMany`,
    `timestamps: false`, so linking notes don't jump in Recent).
  - **Renaming a target does not rewrite anyone's text.** `[[Old title]]` keeps pointing at the renamed
    note, by id, for as long as that text stays, and the UI renders it as a link to the note. Rewriting
    other notes' bodies would be a silent edit to notes you aren't looking at (history entries, new
    `updatedAt`, re-embeds) for a cosmetic gain. Retype it as `[[New title]]` whenever you like.
  - Deleting a note: id links to it are removed; `[[title]]` links go back to unresolved, then resolve
    to another note with that title if one exists.
  - An id link to a note that isn't yours (or doesn't exist) is dropped.
- **Cost:** nothing unless the body contains `[[` or `/notes/`; then one projected title lookup (with a
  case-insensitive collation), plus one `updateMany` when a title changes. A save without links makes
  no link queries (tested).
- **Checks:** `src/__tests__/notegeekLinks.test.js` (18 tests, all red-checked).
- **UI (2026-09-30; needs the gateway above live first — it selects `note.links`, `backlinks` and
  `noteTitles`):**
  - **Typing `[[`** in the Markdown editor (`MarkdownEditor.jsx`; the body is a plain MUI textarea)
    opens a title picker (`editors/WikiLinkPicker.jsx`, options from `hooks/useTitleOptions.js`):
    titles containing what you typed, prefix matches first, up to 6, plus a last "New note “…”" row
    when nothing is called exactly that. **Phone:** docked full-width just above the formatting
    toolbar (which is docked above the keyboard), 44px rows. **Desktop:** floats under the caret (above it when the caret is within 240px of the window bottom)
    (`utils/caretPosition.js`, a mirror-div measurement). **Keys:** ↑ ↓ move, Enter or Tab inserts,
    Esc closes it for that `[[` (it reopens at the next one); the caret never leaves the textarea,
    which carries `aria-autocomplete="list"`, `aria-controls` and `aria-activedescendant` on the
    `role="listbox"`. A tap chooses (rows swallow `mousedown`, so the keyboard stays up). Inserting
    replaces `[[query` with `[[Title]]`, swallowing a `]]` already typed after the caret; a title the
    syntax can't carry (`[`, `]`, `|`) is inserted as an id link `[Title](/notes/<id>)` instead.
    The rows are always narrowed client-side to what is typed right now, because the request lags the
    keyboard by a 120 ms debounce: Enter inside that window once chose from the previous query's list
    (harness 18b found it). Rich-text (TipTap) notes have no picker; their `[[…]]` still resolves on
    the gateway and counts as a backlink.
  - **Rendered `[[links]]`** (viewer and editor preview; `utils/remarkWikiLinks.js`, resolution map
    from the small `NoteLinks` query in `hooks/useNoteLinks.js`, handed down by `WikiLinkContext`; the
    editor refetches it after every save, since links resolve on save): resolved → an ink link with a
    1px underline to `/notes/<id>` (`a.ng-wikilink`), showing the alias if there is one; unresolved →
    quieter secondary ink with a dashed underline (`a.ng-wikilink-missing`), titled "Create …",
    leading to `/notes/new?title=…`, which opens a new Markdown note with the title filled in and
    saves nothing until you write. `/notes/…` links go through the router (no PWA reload). Code is
    never linkified. Print and Compose show `[[…]]` as typed.
  - **"Linked from"** (`components/notes/LinkedFrom.jsx`) sits in `NoteFooter` ABOVE "Related notes"
    (explicit links first): a link glyph before the heading, no hint, each row the linking note's title
    and the sentence around the link with the link text in bold. Hidden while loading, on error and
    when nothing links here.
  - **Checks:** `__tests__/components/wikiLinks.test.jsx` (18, red-checked); harness `18a-link-picker`,
    `18b-link-inserted`, `18c-links-viewer` (resolved/unresolved hrefs, alias text, Linked from above
    Related), `18d-link-create` (unresolved → `/notes/new?title=` with the title filled, nothing saved).

## 13. Fold in new info

Added 2026-10-01 (gateway: `apps/basegeek/packages/api/src/graphql/notegeek/foldin.js`; tests
`src/__tests__/notegeekFoldIn.test.js`). "I have a note about spiders and found a new kind of spider — put it in."

**The safety rule: the AI never writes the note.** It returns a short list of small ANCHORED operations; the
gateway checks each anchor against the note as it is now, drops (and reports) what does not match, and applies
the rest as deterministic character splices. Everything no operation touched is byte-identical afterwards.

**Why this is not Tidy.** Tidy (removed 2026-09-22) gave the model a whole note and wrote back what came out; on
2026-09-21 that truncated a long note to ~63% with nothing to restore from. Compose answered that by never
overwriting (it makes a NEW note). Fold-in has to change the existing note, so instead the model is never allowed
to produce the note's text: it can only name a place and what to add there.

- **The operations** (each with a one-line `why`):
  - `insert_after_heading { heading, markdown }` — right under the heading, before its text.
  - `insert_under_section_end { heading, markdown }` — at the end of the section's OWN text, before its first
    sub-heading (a new sub-section is `new_section`).
  - `append_to_list { anchor, items }` — after the anchor item's last sibling (and that sibling's children), in the
    anchor's style: same indent and bullet, ordered lists continue their numbering, checkbox lists get `[ ]`.
  - `add_table_row { tableHeaderRow, cells }` — after the table's last row; `|` in a cell is escaped, a short row is
    padded, more cells than columns drops the op.
  - `replace_text { find, replace, reason }` — **the only op that removes text.** `find` must occur EXACTLY ONCE,
    verbatim (never loosely matched), outside any code fence.
  - `new_section { afterHeading|null, heading, level, markdown }` — after the whole section of `afterHeading`
    (null = the end); refused if that heading already exists ("add under it instead").
- **Anchoring rule:** exact text (after stripping `## `, `- [ ] `, `1. ` from both sides) first — one match wins,
  two or more is ambiguous; otherwise case-folded, whitespace-collapsed, trailing `:`/`.` ignored — one match
  wins, two or more is ambiguous; otherwise not found. Never prefix or "closest". Setext headings are not anchors.
- **Never inside code:** no anchor is recognised in a fence, no insertion lands in one (or past an unclosed one),
  `replace_text` may not touch one, and inserted markdown with an unbalanced fence is dropped.
- **Overlap:** two removals may not intersect; an insertion may not land strictly inside a removal. Several
  insertions at one point apply in order. The later op of a clash is dropped.
- **Nothing silently lost:** every proposed op is either applied or listed in `stats.dropped` with a reason
  (`anchor_not_found`, `ambiguous_anchor`, `text_not_found`, `ambiguous_text`, `overlap`, `inside_code_fence`,
  `unbalanced_fence`, `duplicate_heading`, `too_many_cells`, `malformed`, `too_many` past 30, `empty`,
  `no_change`), and a dropped op's content is moved to `unplaced`, next to what the model itself could not place.
  A failed call (cap, unavailable, unparseable) is `stats.failed: true`, never an empty "nothing to add".
- **Which notes:** Markdown. A "plain text" note in NoteGeek is a Markdown note without headings (imports become
  Markdown, §9) — it gets list/table/replace/new-section-at-end. **Rich text (`text`) is refused**: the gateway
  has no Markdown→HTML renderer, so an insert would be model-written HTML in a stored note, and `replace_text`
  over HTML cannot honestly quote what the reader sees across tags and entities. Code, mind map and sketch are
  refused ("Fold-in works on markdown and text notes"); locked/encrypted notes are never sent to a model.
- **Long notes:** up to 14 000 characters the note goes whole. Past that: an OUTLINE (every heading, each
  section's first line, table header rows, each list's first/last item; ≤ 6 000 chars) plus the full text of the
  sections sharing the most words with the new info (heading words ×3), ≤ 14 000 chars. Anchors are still checked
  against the full note. Not the local embeddings: §11's index is per passage, not per section, and keeping this
  module off the embeddings client keeps §11's no-cloud boundary trivially true. Logged: counts only (strategy,
  chars sent, sections sent/total, proposed/valid, drop reasons, model) — never text.
- **Model:** `need: 'prose+structured:deep'` (JSON that must parse, prose judgement, time to think); NoteGeek is
  paid-first, so OpenRouter `openai/gpt-4.1-mini` answers (live 2026-10-01: ~3 s, ~$0.0007 a preview). 60
  previews per user per UTC day, 30 s timeout, 3 000 output tokens. New info is refused past 12 000 characters
  ("use Compose"), never cut.
- **Apply:** the client sends back the ops it accepted (a subset is fine); the gateway re-plans them against the
  CURRENT note. All or nothing. If `updatedAt` moved since `baseUpdatedAt` and any anchor broke → `CONFLICT`
  ("Propose again"); if every anchor still holds it applies. It snapshots a version **before** writing and refuses
  if the snapshot fails (Undo is the promise), writes with the `updateNote` helpers (ceiling, sanitizer, links; the
  Note middleware queues re-indexing) conditional on `updatedAt`, and if that loses a race it deletes the
  snapshot and returns `CONFLICT`. Inline `#tags` are merged into chips by the client, as on any save.
- **Live smoke (2026-10-01, a 4-section spiders note + "found a brown widow… correction: the black widow's
  hourglass is red… zebra jumper on the mailbox, 5 mm"):** first run, the model "corrected" the zebra jumper's row
  with the new sighting — so the prompt now says a new sighting/measurement is an ADDITION and `replace_text` is
  only for explicit corrections; second run: list item for the brown widow, `replace_text` orange→red, a new table
  row for the sighting, 0 dropped. gpt-4.1-mini puts a replace's explanation in `reason`, so `why` falls back to it.
- **UI (2026-10-01; needs the gateway above live first — the bundle sends `foldInPreview` / `foldInApply`):**
  - **Entry points:** "Fold in new info" in the editor's ⋯ menu (a saved Markdown note only — an unsaved draft or
    any other type gets no item); a merge glyph in the read-only viewer's action bar (Markdown, unlocked);
    **Share → NoteGeek** (`pages/ShareTarget.jsx`) now lands on a choice — "Save as a new note" (one tap; it used
    to create the note on arrival, which made "add this to my spiders note" impossible without a duplicate) or
    "Add to an existing note"; and on Home, a "Fold into an existing note" button beside Save while a capture is
    typed.
  - **Picking the note** (`components/foldin/FoldTargetPicker.jsx`): the shared/captured text's first 300
    characters go through `searchNotes(hybrid: true)` (keyword + local embeddings, §11 — nothing leaves the box
    for this); the best Markdown, unlocked hit is offered as **"Looks like it belongs in: Spiders"**, up to three
    more below, then a "Find a note" title search (`noteTitles`). Rich text and other types are never offered.
  - **The sheet** (`components/foldin/FoldInSheet.jsx`, a `GeekSheet`: full height on a phone, a dialog from `md`):
    a "New info" box (prefilled from a share or capture; over 12 000 characters disables Propose and says to use
    Compose) → "Propose changes" (a status line with elapsed seconds; the editor first SAVES any pending edit, and
    refuses to propose if it can't, so the gateway proposes against what is on screen) → the proposal: the
    model's one-line summary; "N suggestions didn't match the note and were left out" when the gateway dropped
    any; one card per change in NOTE ORDER — where it lands ("List under \"## Widow spiders\""), what it does
    and the model's why, a checkbox (on by default, `Include: <where>`), and a preview: inserted Markdown
    rendered on a pass of highlighter (`hlSoft` fill, `hl` edge, ink on it — Graphite's rule), a table row under
    its header, a correction as the old text struck through above the new; a dashed "Couldn't find a place for:"
    card with a Copy button per item; the model's id in small mono. "Apply N changes" counts the ticked cards.
  - **"Preview the whole note"** (a switch above the cards): the note's source, monospaced, with every ticked
    change in place — additions highlighted (`<ins>`), removals struck (`<del>`). Offered only when a fresh read
    of the note still has the `updatedAt` the proposal was made against, since its offsets are the gateway's.
    Blank-line padding there is approximate; the gateway's apply is exact.
  - **After Apply:** the gateway's note goes on screen clean (editor) or into Apollo's cache (viewer, share →
    opens `/notes/<id>`); inline `#tags` in the result are merged into the chips with one tags-only
    `updateNote` (no version — tags are not a meaningful change); a 10 s toast "Folded in N changes." with
    **Undo** → `restoreNoteVersion(versionId)` (which itself snapshots, so Undo is undoable from History,
    where the entry reads "Fold-in"). A `CONFLICT` keeps the sheet open with "Propose again".
  - **Phone:** the sheet's bottom edge rides `useKeyboardInset()` (Chrome on Android shrinks only the visual
    viewport, so a `bottom: 0` sheet hid its own actions behind the keyboard); every control 44px.
  - **Checks:** `__tests__/components/foldin/foldInSheet.test.jsx`, `__tests__/utils/foldIn.test.js`,
    `__tests__/pages/noteEditorFoldIn.test.jsx`, `__tests__/pages/shareTarget.test.jsx` (all red-checked); harness
    `19a-foldin-input`, `19b-foldin-proposal`, `19c-foldin-whole`, `19d-share-existing`,
    `19e-share-foldin-applied` (fixtures: the live smoke's note and proposal, `NOTE_SPIDERS` / `FOLD_IN_PROPOSAL`).

## 14. Archive

Spec: `DOCS/COMPOSE_MANY_AND_ARCHIVE_SPEC.md` §3. Gateway facts:

- **Fields:** `Note.archived` (Boolean, default false) and `Note.archivedAt` (Date|null); index
  `{ userId: 1, archived: 1 }`. GraphQL: `Note.archived: Boolean!` (resolves `false` for a legacy doc with no
  field) and `Note.archivedAt: String` (ISO 8601).
- **The filter rule:** every read that lists, counts or finds notes spreads `active()` from `models/Note.js`
  = `{ archived: { $ne: true } }` — never `archived: false`, because existing notes have no field (no migration).
  A function, not a constant: mongoose casts filters in place. **A new read site must get it or say why not.**
- **Filtered:** `notes` (incl. tag/prefix/under), `noteTags`, `noteTagUsage` (count and sub-tags), `searchNotes`
  (keyword rows and the meaning-only re-read), `noteTitles`, `backlinks`, `suggestForNote`, glance
  `recentNotes` + `glanceSearch`, `suiteTags` / `taggedAcross` (the notegeek scope), legacy REST
  `GET /api/notes` and `/api/notes/tags`. Meaning search (`vectorSearchRanked`) and `relatedNotes` drop archived
  ids **before ranking** (`semantic.js#archivedNoteIds`, read fresh per query) so they can't move the cut or the
  best-match margins; an archived note opened directly still gets its own Related list.
- **Deliberately not filtered:** direct-by-id reads (`note`, `updateNote`, `restoreNoteVersion`, fold-in,
  `composeNotes`), `renameTag` / `deleteTag` (spec A4 — a restore never brings back a renamed tag), the
  tag-spelling lookups inside `notes`/`searchNotes` (a superset of spellings narrows nothing wrongly), the
  indexer (keeps embedding archived notes, so restore is instant), `noteIndexStatus` (it reports the indexer's
  work, which includes them), and link maintenance.
- **Links:** a `[[link]]` to an archived note still resolves. When an archived and an active note share a title
  the active one wins — title lookups sort `{ archived: 1, createdAt: 1 }`, and a kept resolution pointing at an
  archived note gives way to an active note with that title on the next save.
- **Mutations:** `archiveNotes(ids)` / `restoreNotes(ids)` → `ArchiveResult { ids, count }` (the ids actually
  changed). 1–100 ids (zod); owner-scoped; malformed, foreign, missing or already-in-state ids are ignored, not
  errors. One `updateMany` with `timestamps: false`: no `updatedAt` change, no version, no re-embed, `pinned`
  untouched. Restore sets `archived: false, archivedAt: null`. Editing an archived note does not restore it.
- **Query:** `archivedNotes(limit, offset)` — newest `archivedAt` first; limit default 50, max 200.
- **Checks:** `src/__tests__/notegeekArchive.test.js` (one test per read site) and the `archived notes` block in
  `notegeekSemantic.test.js`; every filter revert-checked red.

## 15. Compose from several notes

Spec: `DOCS/COMPOSE_MANY_AND_ARCHIVE_SPEC.md` §4. Gateway facts:

- **Mutation:** `composeNotes(noteIds: [ID!]!): ComposedNotes!` — 2–20 ids (zod), writes nothing.
  `ComposedNotes` = `ComposedNote`'s `markdown`, `stats`, `provenance` + `sources { used: [ID!]!,
  skipped: [ComposeSourceSkip { id, title, reason }] }`.
- **Same pipeline:** `compose.js#composeNotes` assembles the pile and calls `composeNote` — same size refusal
  (`MAX_COMPOSE_CHARS`, `content_too_long`, total in `stats.inputChars`), map-reduce, degenerate check, feature
  `compose_note`, `COMPOSE_DAILY_CAP`, `need: 'prose:deep'`. The only addition is `framing`, appended to the
  single / map / reduce system prompts on this path (`composeManyFraming(n)`; the MAP step also gets
  `COMPOSE_MANY_MAP_EXTRA` so it keeps the `Written` dates its own rules call noise). Single-note
  `composeNote` passes none — its prompts are byte-identical.
- **Input shape:** per note `# <title or "Untitled">` + `Written <YYYY-MM-DD>` (the caller's
  `profile.timezone`, default America/Chicago) + blank line + body; joined by `\n\n---\n\n`. Oldest `createdAt`
  first. Duplicate ids count once.
- **Sources:** owner-scoped load by id (archived notes are composable). Bodies: `markdown` as-is, `code` unwraps
  the `{ code }` JSON form, `text` and the legacy null type are TipTap HTML stripped by jsdom's `DOMParser`
  (`htmlToPlainText`, paragraph breaks kept, a literal `<` survives). **Skip reasons:** `locked` (locked or
  encrypted, never sent), `unsupported_type` (handwritten, mindmap), `empty` (nothing after stripping),
  `not_found` (missing, malformed or another user's — title null). Fewer than 2 usable →
  `provenance.reason: 'not_enough_sources'`, `stats.strategy: 'refused'`, no model call.
- **Logging:** one `[notegeek] compose-many` line of counts (requested/used/skipped/chars/chunks) — never text or
  titles.
- **Checks:** `src/__tests__/notegeekComposeNotes.test.js` (revert-checked red per rule); the single-note
  `notegeekComposeNote.test.js` is unchanged and green.

## 16. Select mode, Compose-many and Archive — UI

Spec: `DOCS/COMPOSE_MANY_AND_ARCHIVE_SPEC.md` §5 (U1–U9). Needs §14/§15's gateway live first — the bundle sends
`archiveNotes` / `restoreNotes` / `archivedNotes` / `composeNotes` and reads `Note.archived`.

- **Select mode** — one hook, `hooks/useNoteSelection.js`, used by Home (`QuickCaptureHome`), All notes and a tag page
  (both `NoteList`), search (`SearchResults`) and Archived. It holds the selected NOTES (types, titles, `createdAt`),
  not just ids; `resetKey` drops it when the same component shows a different list (another tag, a new query); Esc
  exits unless a dialog took the key. Enter by **long-press** (`hooks/useLongPress.js`: 500 ms, a 10 px move cancels,
  the click that ends the press is swallowed so the row doesn't open, Android's link callout suppressed for touch) or
  the header's **Select** (`components/select/SelectControl.jsx`). Selecting: a sticky "N selected · Cancel" header
  (count is a polite live region). Rows (`NoteRow` `selectMode`) become `role="checkbox"` buttons with a 44 px box in
  front and a highlighter-soft wash when ticked (everything on it in ink — secondary ink is too faint on it at night).
  Landmine: a long press turns the row into a checkbox MID-gesture, so the hook stays attached in select mode to
  swallow the click that lands on the new element (and a hold in select mode toggles, like a tap).
- **The action bar** (`components/select/SelectionBar.jsx`): fixed, just above the tab bar (`useGeekShell().bottomInset`)
  on a phone, right of the sidebar on desktop; leaves a spacer under the list. **Archive** (≥ 1) and **Compose N notes**
  (≥ 2 selected AND ≥ 2 it can read, ≤ 20); "1 will be skipped" counts sketches, mind maps and locked/encrypted notes
  from the selection (`composeSkipReason`; the list query carries no `isLocked`, so only search/Archived rows can say
  locked — the gateway's `sources.skipped` is the final word). Archived view: **Restore** only. It mounts its Apollo
  hooks only while selecting (Home's tests render without a client). A failed archive/restore keeps the selection.
- **Compose-many** (`components/select/ComposeManyFlow.jsx` over the existing `ComposeDialog`): ids sent oldest first;
  the dialog's many-notes mode (`sourceCount`) shows "Composing 4 notes… 12s", the draft, the notes left out
  ("2 notes left out: Garden plan (locked), Sketch 4 (a sketch)" — `utils/composeMany.js#skipSummary`), the
  chunksFailed / truncated warnings, and **Save as a new note** only. Refusals (`not_enough_sources`,
  `content_too_long` with the total, degenerate, empty) and errors say so with **Back to selection** — the selection
  survives. Save → one `createNote` (title = the draft's first `#` heading, kept in the body, else "Composed note";
  `tags: []`; markdown). Then, only after a successful save and only if `sources.used` is non-empty, the dialog becomes
  "Saved. Archive the N source notes?" — **Archive them** archives `sources.used` ONLY (never a skipped note) →
  toast "Archived N notes" with **Undo** (`restoreNotes`); **Keep them** archives nothing. Either opens the new note.
  Without `sourceCount`/`offer`/`skippedSummary`/`saving` the dialog is exactly the single-note one.
- **Archive anywhere:** `hooks/useArchiveNotes.jsx` owns both mutations, their cache update and toasts (Undo calls
  through a ref, so it works after the archiving component unmounts). Editor ⋯ menu: "Archive" / "Restore from
  archive" (saved notes); viewer action bar: an Archive / Restore icon button. A note opened directly while archived
  shows `components/notes/ArchivedBanner.jsx` ("Archived Oct 8, 2026 · Restore"; in the editor's `belowMeta`, above
  the viewer's sheet). Archived state comes from its own small query `NOTE_ARCHIVE_STATE` (`hooks/useNoteArchiveState.js`)
  so `GET_NOTE_BY_ID` and its many mocks are untouched. Editing an archived note does not restore it.
- **Archived view:** `/archived` (`pages/ArchivedNotes.jsx`, `archivedNotes(limit: 200)`, rows dated by `archivedAt`),
  titled "Archived"; empty state explains archive. Reached from an "Archived" row under "All notes" in `TagsPanel`
  — the desktop sidebar, and on a phone the Notes page's Tags sheet; not a tab (the tab bar highlights Notes).
- **Cache (U8):** `onNotesArchived(archived)` in `graphql/cacheUpdates.js` writes `archived`/`archivedAt` onto each
  changed `Note:<id>` (the banner flips with no refetch) and evicts `notes` (lists + sidebar tag counts), `noteTags`,
  `noteTagUsage`, `searchNotes`, `archivedNotes`, `noteTitles`, `backlinks`, `relatedNotes`. Home and search read the
  zustand store, so `noteStore.dropNotes(ids)` removes archived rows at once and `refreshLists()` re-reads Home's list
  and the last search after a restore.
- **Tag rename / delete say what they reach (spec A8):** `NOTE_TAG_USAGE` selects `archived`; `utils/tagPath.js`
  `notesTouched` → "4 notes (and 2 archived)", parenthesis omitted at 0. The delete dialog reads "Removes #house
  and its 2 sub-tags from 4 notes (and 2 archived). The notes stay."; the rename dialog now loads the same count and
  reads "Changes #house and its 2 sub-tags on 4 notes (and 2 archived)." (`renameSummary`, shown once counted).
  Tests in `__tests__/components/TagContextMenu.test.jsx` (red-checked); harness 16b/16c assert the sentences
  (fixture `house` has one archived note).
- **Compose-many dialog a11y:** in many-notes mode the scrolling `DialogContent` is a focusable `region`
  ("Composed document") — axe `scrollable-region-focusable` on 20b. The single-note dialog was left byte-identical
  and has the same latent issue (no scene shows its draft).
- **Contract check:** the five documents in `graphql/archive.js` were validated against main's shared + notegeek
  typeDefs (graphql `validate`) on 2026-10-08.
- **Checks:** `__tests__/components/select/selectMode.test.jsx` (long-press, tap, scroll-cancel, Select/Cancel/Esc,
  bar enablement and skip count, archive + Undo, failed archive keeps the selection),
  `components/select/composeMany.test.jsx` (oldest-first, title, no tags, offer = `sources.used` only, Keep, failed
  save, chunksFailed/truncated/skipped wording, refusals keep the selection), `components/notes/archivedViewer.test.jsx`
  (banner + Restore, Archive → banner, real normalized cache), `pages/archivedNotes.test.jsx`,
  `pages/noteEditorArchive.test.jsx`, `graphql/archiveCache.test.js`, `utils/composeMany.test.js` — every behaviour
  revert-checked red; single-note Compose's tests unchanged and green. Harness `20a-select-mode`,
  `20b-compose-many-draft`, `20c-compose-many-offer`, `20d-compose-many-archived` (only the used ids archived, toast
  with Undo), `20e-archived-view` (reached via the Tags panel, Restore-only bar), `20f-archived-banner`.
