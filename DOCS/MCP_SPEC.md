# Specification: GeekSuite MCP — Stage 1 (read-only, CLI)

> **Status: PARKED 2026-10-02.** The `/mcp` endpoint is built but lives on branch
> `mcp-parked`, not `main`. Only §6's catalog vectors shipped, as the shortlist behind
> `DOCS/WHAT_NEXT_SPEC.md`.

Interviewed with Chef 2026-10-02. Design and rationale: `DOCS/MCP_PLAN.md`.
Provenance tags: **[stated]** = Chef said it; **[confirmed]** = proposed by Sage, explicitly
accepted by Chef; **[Sage]** = Sage's call, made when Chef said "make choices and document them"; open for review (see §5).

## 1. Intent

Chef asked: *"Initially I'd like to give read-only access to notes, tasks, books, and
games"* — and wants to use Devin, Gemini and Claude *"from their android apps, if possible,
but at least from the CLI so that's the starting point."* **[stated]**

This spec covers that starting point: an MCP server that lets Chef's AI command-line
clients (Devin CLI, Claude Code, Gemini CLI, Antigravity) read his NoteGeek notes, BuJoGeek
tasks, BookGeek books and GameGeek games, reached over the LAN or Tailscale. Mobile access
is a later stage with its own spec. **[confirmed]**

## 2. Requirements / Acceptance Criteria

### Transport and reach
1. basegeek serves an MCP endpoint at `/mcp` (Streamable HTTP) on port `8987`, reachable at
   `192.168.1.17` on the LAN and via Tailscale on the tailnet. **[stated]**

### Authentication and permissions
2. Every `/mcp` request must carry a basegeek API key as a bearer token. A missing,
   malformed, revoked or expired key gets `401`; session cookies are not accepted as MCP
   auth. **[Sage]**
3. Read access is granted per app through four separate key permissions: notes, tasks,
   books, games. Any combination can be granted. **[confirmed]**
4. Existing API keys, and newly minted keys by default, have **no** MCP access. A valid key
   with none of the four permissions is refused (`403`). **[confirmed]**
5. A client's tool list contains only the tools for the apps its key may read; tools for
   other apps are not listed. **[confirmed]**
6. MCP calls count against the key's existing rate limit; over the limit, the client gets a
   clear rate-limit error rather than a generic failure. **[confirmed]**
7. Calls act as the user who minted the key and return exactly what that user is allowed
   to see in the apps themselves (their own notes and tasks; their household's books and
   games). **[confirmed — see invariant 3]**

### Capabilities (all read-only)
8. Every tool is read-only and declares itself so (`readOnlyHint: true`); no tool creates,
   changes or deletes anything. **[stated]**
9. Notes: search notes, get one note, list notes (by tag), list tags. **[Sage]**
10. Tasks: today's tasks, this week's tasks, blocked tasks, tasks by tag. **[Sage]**
11. Books: list/search books (paginated), get one book, shelf summary. **[Sage]**
12. Games: list/search games (paginated), get one game, shelf summary. **[Sage]**
13. Cross-app search: StartGeek's `glanceSearch` is extended to include games
    (household-scoped), and an MCP tool exposes it. The MCP tool returns only results from
    the apps the key may read, and never results from apps outside the four. **[stated:
    extend glance; filtering: Sage]**

### Privacy
14. Private BuJoGeek tasks (`private: true`) never appear in any tool's output, including
    cross-app search. **[stated]**
15. Locked or encrypted notes never appear in any tool's output — not in search, lists or
    tag views. Fetching one by id answers "not found". **[confirmed]**
16. No tool triggers an aiGeek/model call (e.g. `whatNext`, `suggestForNote`, `glanceAsk`,
    `reviewDraft`). **[confirmed]**
17. Books and games return the whole household library, as the apps do. **[confirmed]**

### Operations
18. MCP logging records the tool name and argument **names** only — never argument values
    or result content. **[confirmed]**
19. The docs give copy-paste setup for Devin CLI, Claude Code, Gemini CLI and Antigravity
    (using the `mcp-remote` bridge if Antigravity cannot send a header), with the key read
    from an env var or file, never inline. **[confirmed]**
20. The docs describe minting one key per client so each can be revoked on its own.
    **[confirmed]**

### Done when
21. From each of Claude Code, Devin CLI, Gemini CLI and Antigravity, using its own key:
    the client lists the tools, and successfully calls at least one tool per app (notes,
    tasks, books, games) plus cross-app search. **[confirmed]**

## 3. Out of Scope

- Public exposure of any kind (Tailscale Funnel, nginx route), Android/mobile clients,
  OAuth, ChatGPT. **[confirmed]**
- Note version history. **[confirmed]**
- Writes of any kind — out of Stage 1, not ruled out forever. **[confirmed]**
- Data from any app other than the four (fitness, flock, journals, habits, collections,
  ThingGeek/Attic, StoryGeek) — out of Stage 1, not ruled out forever. **[confirmed]**

## 4. Invariants That Must Not Break

1. **`/graphql` is unchanged** — behavior, auth and logging for every existing app.
   **[confirmed]**
2. **StartGeek search is intact** — `glanceSearch` gains games, but its existing results,
   ordering and private-task exclusion are unchanged. **[confirmed]**
3. **Ownership is never bypassed** — the MCP reaches data only through the existing
   resolvers with the key owner's user/household context; no direct database reads that
   skip their scoping. **[confirmed]**
4. **Auth contracts hold** — CSRF guards, the 503 `AUTH_UNAVAILABLE` fail-closed contract,
   and existing AI API-key behavior are unchanged. **[confirmed]**

## 5. Implementation decisions — made by Sage, open for review

Chef (2026-10-02): *"Just get started already. Make choices and document them. We'll
discuss them later."* Everything below is a call Sage made under that instruction. None is
settled; each is cheap to change.

| # | Decision | Why | Alternative |
|---|---|---|---|
| D1 | Tool names: `geek_search`, `notes_search`, `note_get`, `notes_list`, `note_tags`, `tasks_today`, `tasks_week`, `tasks_blocked`, `tasks_by_tag`, `books_list`, `book_get`, `book_shelves`, `games_list`, `game_get`, `game_shelves`; Stage 1b adds `books_search`, `books_like`, `games_search`, `games_like`, `games_overview` | One verb-ish name per fixed GraphQL operation; app prefix keeps clients' tool pickers grouped | Fewer, fatter tools with a `mode` arg |
| D2 | Permissions are named `mcp:read:notes`, `mcp:read:tasks`, `mcp:read:books`, `mcp:read:games`, added to the model validator, `mint-api-key.js` and the basegeek key dialog — not to any default set | Room for `mcp:write:*` later without renaming | One `mcp:read` permission |
| D3 | A key with none of the four gets `403`; with some, `tools/list` shows only those apps' tools. `geek_search` appears for any MCP key and filters to the permitted apps | R4/R5 | — |
| D4 | Bad/missing/expired key → `401`; key owner missing from userGeek → `401`; userGeek unreachable → `503 AUTH_UNAVAILABLE` with `Retry-After: 5` (THE_CONTEXT §3.3) | Fail closed, same as the gateway | — |
| D5 | Context user is built by the same code as `localSessionValidator` (shared helper), so resolvers can't tell an MCP call from a browser call | Invariant 3 | — |
| D6 | Tools run fixed operations in-process via `apolloServer.executeOperation` — never resolver functions directly, never a DB query | Invariant 3; schema validation still applies | Call resolvers directly |
| D7 | Stateless Streamable HTTP: a fresh MCP server + transport per POST; `GET`/`DELETE /mcp` → `405` | No session store to leak or expire | Stateful sessions |
| D8 | `/mcp` gets its own `express.json({ limit: '256kb' })`, mounted before the global 50 MB parser | MCP requests are tiny | Inherit 50 MB |
| D9 | `note_tags` returns the tag list as the app does, including tags that only locked/encrypted notes carry | Tag names aren't note content; filtering would need a new query | Compute tags from unlocked notes only |
| D10 | `glanceSearch`'s games branch matches title, developers and publishers, household-scoped via `resolveHouseholdId`; games join the merged list sorted by `updatedAt`, so with the 12-item cap a game hit can displace an older hit from another app. Existing branches, their filters and relative order are untouched | That's what "extend glance" means under a shared cap | Separate games-only search |
| D11 | Task tools accept optional `date` (YYYY-MM-DD) and `tzOffsetMinutes`, passed straight through; descriptions tell the model to send the user's offset | Same contract as the BuJo UI | Server-side default timezone |
| D12 | Lists are paginated where the resolver paginates (books, games: default 20, max 50) and otherwise capped at 50 items with `truncated` + `total` in the result | Small responses for models | — |
| D13 | Results are trimmed JSON (ids, titles, key fields, ISO dates) returned as MCP text content | Models read JSON well; keeps payloads small | Markdown rendering |
| D14 | The MCP SDK (`@modelcontextprotocol/sdk`) is added to basegeek's api package at an exact version published ≥ 7 days ago | Supply-chain rule | — |
| D15 | Client setup lives in `apps/basegeek/DOCS/MCP.md`; keys minted with `scripts/mint-api-key.js --app mcp --name "<client>" --permissions mcp:read:notes,...` | One key per client (R20) | Mint via the UI |

## 6. Stage 1b — meaning search over books and games

Chef (2026-10-02), on the goal: *"plug this into one of the CLIs … and quiz you about my
data"* — e.g. *"what game do I own but haven't played and might really enjoy?"* Then:
*"Could we do the games and books similar to the notes? Embedded as vectors and do a vector
search across them?"* and *"Gamegeek and bookgeek both pull reputable metadata including
organized and normalized tags and descriptions."*

### Requirements

- **R1b-1** Every book and every game has one embedding of its catalog metadata, made by
  the local embeddings service through `notegeek/embeddings.js` `embedTexts` — the same
  "text stays on this box" rule as notes. No other provider, no fallback.
- **R1b-2** Embeddings follow the catalog without the writers' help: bookgeek's api and
  gamegeek's backend write those collections directly, so change detection is by content
  hash, not by save hooks. New, edited and deleted items converge within one scan.
- **R1b-3** Meaning search: `books_search` and `games_search` take natural-language text
  and return hybrid (keyword + meaning) ranked results. When the embeddings service is
  down they still answer, keyword-only, like `searchNotes`.
- **R1b-4** Recommendations: `games_like` and `books_like` rank the caller's owned,
  not-yet-played/read items by similarity to what the caller loved (or to items/text the
  model passes), each with the seed it was closest to as the reason.
- **R1b-5** `games_overview`: the caller's whole owned game library in one compact call.
- **R1b-6** Tenancy: game vectors never cross a household; books keep the gateway's
  existing single-library rule. Personal state used for seeds/candidates is the caller's
  own GamePlayer rows only.
- **R1b-7** No new tool spends AI quota (embedding is local); the existing note indexer
  and note search are unaffected.

### Decisions — made by Sage, open for review

| # | Decision | Why |
|---|---|---|
| D16 | Embedded text is catalog metadata only. Games: title, series, developers, publishers, release year, genres, `tags ∪ autoTags`, modes, description. Books: title, series, authors, publisher, year, `libraryTags ∪ myTags`, description (HTML stripped). Never reviews, notes, ratings or GamePlayer data | Vectors are shared per household; a review in a shared vector would leak into other members' searches |
| D17 | Total text capped at 2 000 chars per item (description truncated last) — about mxbai's 512-token window | Past the window Ollama truncates silently anyway |
| D18 | Vectors live next to their items: `gamevectors` (gamegeek DB, carries `householdId`) and `bookvectors` (bookgeek DB). One doc per (item, model) with `hash`, `vector`, `indexedAt`. Only basegeek writes them | Same tenancy and lifecycle as the items |
| D19 | `catalogIndexer`: single-flight loop beside the note indexer, started/stopped in `server.js` the same way. A scan (startup + every 5 min) reads a projection of every item, hashes `model + text`, embeds the missing/changed ones in batches ≤ `BATCH_CHARS`, deletes vectors whose item is gone or whose model isn't current. Tick budget like the note indexer; shares `semantic.js` service-health backoff | Ollama serves one request at a time; notes and catalog must not starve each other or a search |
| D20 | Search = keyword list (the app's existing `q` filter, title matches ranked first) and vector list fused with the existing `rrfFuse`, same weights. Catalog gets its own floor/gap entry in the model table, seeded with the note values and marked **uncalibrated** until tuned on Chef's library after the first backfill. No "best match" flag for catalog | Note thresholds were tuned on note passages, not catalog blurbs |
| D21 | Taste seeds (games): caller's GamePlayer rows with `favorite`, or `rating ≥ 4`, or the top 10 by `hoursPlayed` (≥ 5 h); weighted centroid (favorite/5★ count double). Candidates: household games with `owned: true` where the caller has no GamePlayer row, or `hoursPlayed == 0` and shelf null/`backlog`. Optional inputs: `likeIds` (replace the seeds), `q` (blended 50/50 with the centroid), `limit` (default 10, max 25). Each result names its nearest seed | "Owned, haven't played, might enjoy", literally |
| D22 | Books: seeds `rating ≥ 4`; candidates `owned` with `readCount == 0`, no `dateFinished`, and not on a read shelf. Same inputs/output as D21 | Book state lives on the book (single library) |
| D23 | `games_overview` returns owned games as `{ id, title, genres, tags, shelf, rating, hoursPlayed, favorite }` (caller's state), capped at 1 000 with `truncated` + `total` | One call answers taste questions the model can reason over itself |
| D24 | All five are new GraphQL queries in the bookgeek/gamegeek gateway modules (`bookSearch`, `booksLike`, `gameSearch`, `gamesLike`, `gameLibraryOverview`) with each module's existing auth/tenancy, and the MCP tools call them like every other tool (D6). Permissions: `mcp:read:books` / `mcp:read:games` | Apps can use the same queries later; MCP stays a fixed-document client |
| D25 | The import tripwire in `notegeekSemantic.test.js` (no AI-stack imports) is extended to the new catalog files | R1b-1 must be a test, not a promise |
