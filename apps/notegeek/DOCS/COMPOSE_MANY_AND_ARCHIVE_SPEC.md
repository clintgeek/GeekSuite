# Specification: Compose from several notes, and Archive

Status: approved for build 2026-10-08. Owner decisions are Chef's (§2); design is Sage's (§3–§6) and open
to review. Builds on Compose (`apps/basegeek/packages/api/src/graphql/notegeek/compose.js`, CONTEXT.md) — read
that file's header before touching anything here.

## 1. Intent

Chef (2026-10-08): *"I need a way to select multiple notes and combine them into a single, well organized,
clear markdown note. Much like, or exactly like \"compile\" works today, but just using several notes as the
source."* ("compile" = **Compose**.)

## 2. Chef's decisions (2026-10-08)

| # | Question | Decision |
|---|---|---|
| D1 | How notes are picked | **Select mode in note lists** (long-press on a phone, a "Select" action on desktop) |
| D2 | Sources afterwards | **Offer to archive them** — never automatic |
| D3 | Provenance in the new note | **Nothing** — no Sources section, no inherited tags |
| D4 | Order fed to Compose | **Oldest first** (by `createdAt`) |
| D5 | What "archive" is | NoteGeek had no archive (delete is permanent, history included), so **build a real Archive**: archived notes leave every list/tag/search surface, stay intact with their history, and are restored from an Archived view |

## 3. Archive — requirements

- **A1 Fields.** `Note.archived: Boolean` (default `false`) and `Note.archivedAt: Date|null`; index
  `{ userId: 1, archived: 1 }`. **No migration**: every "active" filter is `archived: { $ne: true }`, so the
  existing notes (no field) count as active.
- **A2 Hidden everywhere a note is listed, counted or found.** Every read below gets the active filter. The
  list is the gateway's complete set of Note read sites as of `4f1345fa`; a new one must be checked against
  this rule.
  - `graphql/notegeek/resolvers.js`: `notes` (incl. its tag filter), `tags` (distinct), tag counts /
    hierarchy, `searchNotes` (keyword rows AND the hybrid/semantic merge — `extra` rows too), `noteTitles`
    (link autocomplete), and any other list in that file.
  - `graphql/notegeek/semantic.js` (passage search / Related): results whose note is archived are dropped.
    The indexer KEEPS indexing archived notes (restore is then instant); filtering happens at query time.
  - `graphql/notegeek/suggest.js` (related/suggestions): archived notes are never suggested.
  - `graphql/notegeek/links.js`: "Linked from" (backlinks) lists no archived note. A `[[link]]` TO an archived
    note still resolves — the note exists; opening it shows the archived banner. When a title is shared by
    an archived and an active note, the active one wins resolution.
  - `graphql/glance/resolvers.js` (StartGeek's notes card, both reads) and `graphql/suitetags/resolvers.js`
    (`suiteTags`, the notegeek scope): archived excluded.
  - `routes/noteGeek.js` (legacy REST `/api/notes`, still mounted): list and tags reads exclude archived.
- **A3 Still reachable directly.** `note(id)` returns an archived note (with `archived`/`archivedAt`), and its
  versions/history work as before. Editing an archived note is allowed and does not restore it.
- **A4 Tag operations** (`renameTag`, `deleteTag`) apply to archived notes too, so a restore never brings back a
  tag that was renamed away.
- **A5 Mutations.** `archiveNotes(ids: [ID!]!)` / `restoreNotes(ids: [ID!]!)` → `ArchiveResult { ids: [ID!]!, count: Int! }`
  (the ids actually changed). Owner-scoped, 1–100 ids, invalid/foreign ids ignored (not errors). Archiving is
  NOT an edit: no version snapshot, `updatedAt` untouched (`timestamps: false`), `pinned` kept as-is (a
  restored pinned note is pinned again). Restore clears `archivedAt`.
- **A6 Query.** `archivedNotes(limit: Int, offset: Int): [Note!]!`, newest `archivedAt` first.
- **A7 Note type** gains `archived: Boolean!` and `archivedAt: String`. Additive — old bundles are unaffected.

## 4. Compose from several notes — requirements

- **C1** `composeNotes(noteIds: [ID!]!): ComposedNotes!` — 2–20 ids. Writes NOTHING (same rule as `composeNote`).
- **C2 Sources.** Owner-scoped load. Composable types are Compose's own: `markdown`, `code`, `text` and the
  legacy null type. `text` is TipTap HTML: strip it to plain text server-side with a real parser (not a regex —
  `<` occurs in code), matching the client's `plainTextForCompose`. **Skipped, and reported per note:** locked or
  encrypted (`locked` — never sent to a model), `mindmap`/`handwritten` (`unsupported_type`), empty after
  stripping (`empty`), missing or not the caller's (`not_found`). Fewer than 2 usable notes → no model call,
  a clear refusal (`not_enough_sources`).
- **C3 Order** oldest `createdAt` first (D4).
- **C4 Input shape.** Each note becomes `# <title or "Untitled">` + a `Written <YYYY-MM-DD>` line + its body,
  joined by `\n\n---\n\n` (Compose already segments on `---`, so note boundaries survive batching). The prompt
  gains one framing rule for this path only: *these are N separate notes, oldest first; merge overlapping
  material; where they disagree, the later note is the newer information.* Single-note Compose is unchanged.
- **C5 Size.** Over `MAX_COMPOSE_CHARS` → refused with the same "too large" reason as single Compose, with the
  total, so the client can say "select fewer notes". Never truncated.
- **C6 Budget.** Same feature/cap/need as Compose (`compose_note`, `COMPOSE_DAILY_CAP`, `need: 'prose:deep'`).
- **C7 Result.** `ComposedNotes` = everything `ComposedNote` returns (markdown, stats incl. `chunksFailed`/
  `truncated`/`degenerate`, provenance) + `sources { used: [ID!]!, skipped: [ComposeSourceSkip!]! }` where a skip
  is `{ id, title, reason }`. Logged: counts only — never text.
- **C8 No provenance** (D3): the gateway adds no Sources section, the client adds no tags.

## 5. UI — requirements (phone-first)

- **U1 Select mode** in every NoteRow list: Home's recent list, All notes (`/notes`), a tag page
  (`/tags/:tag`), search results, and the Archived view. Enter by **long-press** on a row (phone, ~500 ms,
  with no navigation) or a **"Select"** button in the list header (all sizes). In select mode: each row shows a
  44 px checkbox and a tap toggles it; the header reads "N selected" with **Cancel** (Esc also exits); the
  selection survives scrolling but not leaving the page.
- **U2 Action bar** (bottom, thumb zone, above the bottom nav, 44 px targets): **Compose** (enabled at ≥ 2
  selected, labelled "Compose 3 notes"; selected locked/sketch notes are counted and the bar says how many will
  be skipped) and **Archive** (≥ 1). In the Archived view the bar offers **Restore** instead.
- **U3 Compose flow** reuses `ComposeDialog`: a status line with elapsed seconds ("Composing 4 notes…"), then
  the draft rendered, then **Save as new note** (no "Replace" — there is no single source to replace). Partial
  results are said out loud: `chunksFailed` ("some material could not be read — check before relying on it"),
  `truncated`, and `sources.skipped` ("2 notes left out: Garden plan (locked), Sketch 4 (a sketch)").
  Errors/refusals keep the selection so you can adjust and retry.
- **U4 Title** of the new note: the draft's first `#` heading if it has one (and that heading stays in the
  body), else "Composed note". No tags (D3). Type `markdown`.
- **U5 The archive offer** (D2), shown only after a successful save, in the dialog's success state:
  "Saved. Archive the 4 source notes?" — **Archive them** / **Keep them**. Archive → `archiveNotes(used ids)` →
  toast "Archived 4 notes" with **Undo** (`restoreNotes`). Keep → nothing. Either way the app opens the new note.
  Only `sources.used` are offered — skipped notes were not composed and are never archived by this offer.
- **U6 Archive anywhere:** the editor's ⋯ menu and the viewer's actions gain **Archive** (and **Restore** on an
  archived note). An archived note opened directly shows a banner: "Archived <date> · Restore".
- **U7 Archived view:** `/archived`, reached from the sidebar / navigation's secondary items (not a primary
  bottom-nav slot), listing `archivedNotes` with select mode → Restore. Empty state explains what archive is.
- **U8 Cache.** After archive/restore, every list, tag count and search result reflects it without a reload
  (evict/refetch the affected Apollo fields).
- **U9** NoteGeek's look is **Graphite** — use its theme tokens; no shared-package restyle. Every control
  ≥ 44 px; the mobile harness (`--enforce-a11y`, phone + desktop) stays clean, with new scenes for select
  mode, the compose-many result + archive offer, and the Archived view.

## 6. Deploy order

The UI selects new fields and calls new mutations, so (per the suite's schema rule) the **gateway ships first
and is confirmed live**, then the UI. Both are additive; an old bundle never sees a difference.

## 7. Out of scope

Bulk delete, bulk tag edit, archiving from other apps, auto-archive, provenance in the composed note (D3),
composing sketches/mind maps.
