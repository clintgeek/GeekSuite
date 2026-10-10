# GeekSuite MCP — Plan

Status: **proposed, not started.** First written 2026-09-22; rewritten 2026-10-02 after
Chef's calls (§0). No spec yet; this is the design to build one from. Surface reference:
`DOCS/GRAPHQL.md` (which does not yet document the `gamegeek` module — read
`apps/basegeek/packages/api/src/graphql/gamegeek/typeDefs.js`).

Goal: let Chef's AI clients read parts of the suite's data through a Model Context Protocol
server. Read-only first; writes are a later, separate decision.

## 0. Decided (2026-10-02)

- **Clients:** Devin, Claude, and Antigravity/Gemini. **Not ChatGPT** — Chef is on ChatGPT
  Go, and custom MCP apps/developer mode are Business/Enterprise/Edu only (OpenAI help
  article 12584461, checked 2026-10-02).
- **Scope v1:** read-only access to **notes, tasks, books, games**.
- **Start with the CLIs**, reached over the LAN / Tailscale. Android apps are the goal, not
  the starting point (§3.2).
- **Private TodoGeek tasks are excluded entirely** (not masked) while LAN-only. Revisit before
  any public exposure (§3.2).
- **Tailscale goes on `server` itself** (Chef installs it; it isn't there today). That makes
  `server` a tailnet node for Stage 1 and the Funnel host for Stage 2.
- **`geek_search` extends `glanceSearch`** with a games branch (StartGeek benefits too),
  rather than fanning out in the MCP layer.
- **Chef has Google AI Pro**, so the Gemini app's Spark gate is met; the other gates (US,
  personal account, Keep Activity) and OAuth remain (§3.2, §3.3).

## 1. Where it lives: a `/mcp` route inside basegeek

Not a new app. The route authenticates the caller, loads the owning user, builds the same
resolver context `/graphql` uses (`{ user, cookies }`, `server.js` ~L501), and executes
**fixed** GraphQL operations in-process via `apolloServer.executeOperation(...)`, so schema
validation still applies.

Why not a standalone service calling `/graphql` over HTTP:

- An API-key caller is `req.user = { id: 'apikey_<keyId>', owner, type: 'api_key' }`
  (`middleware/apiKeyAuth.js`), not the user. Resolvers enforce ownership (and GameGeek /
  BookGeek household tenancy) against the user, so a key-authenticated remote client would
  be refused — or we'd have to mint JWTs, which means sharing basegeek's secret.
- No new container, no new Watchtower target, no new CI image.
- Ownership and household scoping come for free.

The SDK is already in the repo (`apps/fitnessgeek/tools/influx-mcp`,
`@modelcontextprotocol/sdk ^1.24`). Use its Streamable HTTP server transport in
**stateless** mode (no session map to leak or expire).

## 2. Auth — bearer API key

Reuse the `APIKey` model and `authenticateAPIKey`.

- Add `mcp:read:notes`, `mcp:read:tasks`, `mcp:read:books`, `mcp:read:games` to
  `validPermissions` (`models/APIKey.js`). **Do not** add them to
  `DEFAULT_KEY_PERMISSIONS` — existing AI keys must gain nothing.
- The key's `createdBy` is the acting user: load them from `userGeek` and build the
  context exactly as `localSessionValidator` would.
- A tool whose app permission the key lacks is **not listed** (not merely refused), so a
  client never sees tools it can't call.
- One key per client (Devin, Claude Code, Gemini CLI, …) so each can be revoked alone.
- Rate limits: `APIKey.checkRateLimit()`, already in place.
- CSRF: **verified 2026-10-02** — both `csrfGuard` and `csrfTokenGuard` only act when an
  SSO cookie is present; a bearer-only request is exempt by construction.

No OAuth in v1. Every CLI client accepts a static `Authorization` header (§4).

## 3. Exposure

### 3.1 Stage 1 — LAN / Tailscale (v1)

`http://192.168.1.17:8987/mcp` on the LAN, or `http://server:8987/mcp` (MagicDNS) over the
tailnet once Tailscale is installed on `server`. No nginx change. Plain HTTP on the
LAN/tailnet (WireGuard encrypts the tailnet hop); the key is the gate.

### 3.2 Stage 2 — Android apps (later)

**Tailscale does not help here.** Every vendor's mobile app connects to a custom MCP server
from the vendor's cloud, not from the phone:

| App | How it connects | Auth it supports | What we'd need |
|---|---|---|---|
| **Claude** (Android) | Custom connector added on claude.ai, synced to mobile. Connects from Anthropic's IPs; rejects hostnames resolving to private/CGNAT ranges (incl. Tailscale `100.64/10`) | OAuth, or "No sign-in" + **request headers** (per current Claude connector docs — verify in the UI) | Public HTTPS endpoint. Bearer key likely enough |
| **Devin** (Android / web) | Custom MCP added by org admin; sessions run on Devin's cloud VMs | URL + headers | Public HTTPS endpoint. Bearer key enough |
| **Gemini** (Android) | "Custom apps" added on gemini.google.com. Gated: US, 18+, personal Google account, Keep Activity on, reportedly AI Pro/Spark | Appears to be OAuth / no credential field | Public HTTPS **and OAuth 2.1** — the expensive one |

So Stage 2 = a public HTTPS endpoint. Options, cheapest first:

1. **Tailscale Funnel** on `server`, path-scoped to `/mcp` only — public HTTPS on a
   `*.ts.net` name, off with one command, no edge nginx change. Funnel must expose `/mcp`
   alone, never the whole of `:8987`.
2. **nginx** on `basegeek.clintgeek.com/mcp`, with `client_max_body_size` set deliberately
   (nginx config is not in the repo; see `DOCS/RUNBOOK.md`).

Before going public, re-decide: private tasks, health of the key-rotation story, and an
allow-list of vendor IP ranges if practical.

### 3.3 Stage 3 — OAuth (only if Gemini app is wanted)

OAuth 2.1 per the MCP authorization spec over the existing SSO: protected-resource
metadata, auth-server metadata, PKCE, DCR or CIMD, consent screen, scopes = the `mcp:read:*`
permissions. Tools do not change. Do not build until Stage 2 is in use and Gemini mobile is
actually wanted.

## 4. Client setup (Stage 1)

| Client | Config | Status |
|---|---|---|
| Devin CLI | `mcpServers.<name>.url` + `headers` | Verified in Devin CLI docs |
| Claude Code | `claude mcp add --transport http geeksuite <url> --header "Authorization: Bearer …"` | Known-good |
| Gemini CLI | `mcpServers.<name>.httpUrl` + `headers` | Format matches Google's `mcp.json` docs; verify |
| Antigravity | `mcp_config.json`, `serverUrl` + `headers`? | **Unverified** — fallback: `mcp-remote` stdio bridge with `--header` |
| Claude Desktop | UI connectors are cloud-brokered (Stage 2); locally use `claude_desktop_config.json` running `mcp-remote` with `--header` | Optional |

Keys live in env vars / files referenced from config (`${env:…}`), never pasted inline in
committed files.

## 5. Tools — curated, never a raw GraphQL passthrough

A "run any query" tool would hand a model `apiKeys`, `saveAIConfig`, and the rest of the
admin surface. Every tool owns one fixed operation, a trimmed field selection, and a size
cap. All tools carry `readOnlyHint: true`.

### v1 (read-only)

| Tool | Permission | Backed by | Notes |
|---|---|---|---|
| `geek_search` | any (filters to the apps the key may read) | `glanceSearch` (extended with a `gamegeek` branch, household-scoped) | MCP layer drops results for apps the key can't read, plus flockgeek (out of scope). Results carry `app` + `id` |
| `notes_search` | notes | `searchNotes(q, under, hybrid)` | hybrid uses local embeddings — no AI quota |
| `note_get` | notes | `note(id)` | |
| `note_tags` | notes | `noteTags` | |
| `notes_list` | notes | `notes(tag/prefix/under, limit)` | capped |
| `tasks_today` | tasks | `dailyTasks(date, tzOffsetMinutes)` | |
| `tasks_week` | tasks | `weeklyTasks` | |
| `tasks_blocked` | tasks | `blockedTasks` | |
| `tasks_by_tag` | tasks | `tasksByTag` | |
| `books_list` | books | `books(page, limit, q, shelf, …)` | paginated, trimmed |
| `book_get` | books | `book(id)` | |
| `book_shelves` | books | `shelves` | |
| `games_list` | games | `games(page, limit, q, shelf, platform, …)` | paginated, trimmed |
| `game_get` | games | `game(id)` | `sessions` capped |
| `game_shelves` | games | `gameShelves` | |

### Redaction rules (enforced in the MCP layer, every tool)

- **Notes:** drop any note with `isLocked` or `isEncrypted` — from lists, search, and
  `note_get` (which returns them as-is from the resolver today). A fetch of one returns
  "not found", not "locked".
- **Tasks:** drop any task with `private: true`. (Glance search already excludes them;
  `tasks`/`dailyTasks`/etc. do not.)
- **Books / games:** household-shared by design (books have no owner field; games are
  household-scoped). Any key reads the whole household library — acceptable while Chef is
  the only key holder.

### Deliberately excluded

- basegeek admin / aiGeek / API-key surface.
- Anything that spends our AI quota: `whatNext`, `draftBookMetadata`, `suggestForNote`,
  `reviewDraft`, `glanceAsk`, `glanceDraft`.
- Journals, habits, note versions, collections, flock, fitness — not in v1 scope.

### Later (writes)

A few writes only (`add_task`, `create_note`), each with `destructiveHint: false` and client
confirmation. No deletes. Separate decision.

## 6. Guardrails

- Logging: tool name + argument **names** only, matching the `[GQL]` rule
  (`GRAPHQL.md` §1).
- Responses shaped for a model: small, flattened, ISO dates, explicit truncation markers
  (`truncated: true, total: N`).
- Body size: MCP requests are small; set a tight `express.json` limit on `/mcp` rather than
  inheriting `/graphql`'s mindmap-sized one.

## 7. Open questions

1. Antigravity remote-header support (§4) — verify before the spec's client section.
2. Claude connector "No sign-in + request headers" — verify in the claude.ai UI before
   Stage 2 relies on it.

## 8. Next step

Stage 1 spec: `DOCS/MCP_SPEC.md`.
