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
- **Zod Validation**: All 8 mutations are protected with Zod input schemas in `apps/basegeek/packages/api/src/graphql/shared/validation.js`.

### GraphQL Surface
- **Queries**:
  - `notes(folderId, tag, search, sort, isArchived, isPinned)`: Full note query with regex search and filtering.
  - `note(id)`: Single note detail by ID (scoped to requesting user).
  - `recentNotes(limit)`: Chronological recent notes.
  - `lockedNotes`: Notes protected by user password/PIN.
  - `tags`: Tag frequency list.
  - `folders`: User folder list.
  - `aiSuggestNoteTags(id)`: AI-powered tag suggestions.
  - `aiSuggestNoteLinks(id)`: AI-powered backlink suggestions.
- **Mutations**:
  - `createNote(input)`
  - `updateNote(id, input)`
  - `deleteNote(id)`
  - `batchDeleteNotes(ids)`
  - `toggleNoteLock(id, isLocked)`
  - `reorderNotes(updates)`
  - `transcribeSketch(image, mediaType)`: reads a sketch's exported PNG with the vision model (`need: vision+prose:balanced`, 40/day). It writes nothing; the client saves a new markdown note that links back. See `HANDWRITING.md`. It needs `client_max_body_size 12m` on the vhost's `/graphql` location, or images over 1 MB get a 413.

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

## 7. Visual identity — Lab Notebook

NoteGeek is an engineer's notebook: calm, precise, tactile. Its siblings are loud (GameGeek, "Arcade Sticker": ink outlines, hard offset shadows, neon) and bookish (BookGeek, "Midnight Reader": serif, navy, cloth). NoteGeek borrows from neither — **no serif, no cloth, no neon, no hard sticker shadows.**

- **Paper on a desk.** Warm sheet (`surfaces.elevated` `#FFFDF8` / `#26221A`) on a cream desk (`#FBF7EE` / `#16140F`). From `md` up the desk carries a 1px dot grid every 16px (`dotGridBackground` in `theme/tokens.js`); nothing that needs contrast is ever set on it.
- **Typewritten metadata.** Geist (display + body) and JetBrains Mono (every timestamp, tag, count, label, stamp). Both are self-hosted (`@fontsource-variable/geist`, `@fontsource/jetbrains-mono`, imported in `src/main.jsx`) so the PWA keeps them offline. Do not add a third face. Code turns ligatures off (`=>` stays two characters).
- **Brick is a rubber stamp.** Used sparingly, outlined, on things with a status: the save stamp (`components/notes/SaveStamp.jsx`, "Saved" is the one state in brick, rotated −1.5°) and nothing decorative.
- **The five note-type stamps are the signature** (`components/notes/TypeStamp.jsx`, table in `noteTypeMeta.js`): glyph + mono label in the type's ink on an 8% (light) / 12% (dark) wash of it. The same component is used on home, rows, filters, the editor head and the viewer. Label text uses `palette.noteTypeInk`, tuned so 12px clears 4.5:1 **against the stamp's own fill** on every surface; the plain `noteTypes` hues are for dots, strokes and edges only (light mind-map amber is 3.25:1 as text).
- **Editor = a page.** `NoteShell variant="page"` (text, markdown, code): one scroller holding the whole sheet; title, toolbar and body share one ~70ch column (`layout.measure`, 680px); the formatting strip is `position: sticky` against that scroller. `variant="canvas"` (mind map, sketch): the same head over a full-bleed canvas that never scrolls (tldraw pointer offsets, see `HANDWRITTEN_EDITOR_MOBILE_FIX.md`).
- **No Save button.** The page autosaves 2s after the last edit; the stamp shows Draft / Unsaved / Saving… / Saved · 3m ago / Not saved (sticks until a save succeeds) / Nothing to save. Explicit save: Cmd/Ctrl+S, "Save now" in the ⋯ menu, or Back. History, Compose and Delete live in the ⋯ menu.

Layout facts this pass depends on:

- `Layout.jsx` passes `GeekAppFrame fill` on single-note routes (`/notes/new`, `/notes/:id`, `/notes/:id/edit`), so the page owns its scroller; `NotePage` wraps the read-only viewer in its own. Those routes also pass no `bottomNav` (MobileBottomNav hides there anyway, but its inset used to leave a 56px strip).
- The suite theme floors every `IconButton` at 44px on all widths. Desktop controls that should be compact (the toolbar, tag-tree chevrons, the ⋯ button) opt down explicitly above `md`; phones keep 44.
- Sidebar tag counts come from `GetNoteTagCounts` (`notes { id tags }`) — `noteTags` is a bare string list. It is a `notes` root field, so every note write evicts and refetches it with the tag index. The gateway loads whole documents for it; fine at today's size, worth a dedicated `noteTagCounts` resolver if the library grows large.
- List thumbnails (`components/notes/NotePreview.jsx`, geometry in `utils/thumbnails.js`) parse sketch / mind-map JSON only once a row nears the viewport, in an idle callback, memoised per note version. Measured 2026-09-26 in Chromium: 200 rows with 60 × 1MB sketches scroll with zero long tasks.
- List grouping (`utils/recency.js`) uses the writer's LOCAL calendar day — Today, Yesterday, This week, then months — and applies to the Recent and Created sorts only.
