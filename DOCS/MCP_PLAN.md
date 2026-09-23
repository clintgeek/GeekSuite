# GeekSuite MCP — Plan

Status: **proposed, not started** (written 2026-09-22). No spec yet; this is the design
thinking to build one from. Surface reference: `DOCS/GRAPHQL.md`.

Goal: let ChatGPT (or Claude Desktop / Claude Code, or any MCP client) read — and later
carefully write — parts of the suite's data through a Model Context Protocol server.

## 1. Where it lives: a `/mcp` route inside basegeek

Not a new app. The route authenticates the caller, loads the owning user, builds the same
resolver context `/graphql` uses (`{ user }`), and executes **fixed** GraphQL operations
in-process against the existing schema.

Why not a standalone service calling `/graphql` over HTTP:

- An API-key caller is `req.user = { id: 'apikey_<keyId>', owner, type: 'api_key' }`
  (`middleware/apiKeyAuth.js`), not the user. Resolvers enforce ownership against the user,
  so a remote client authenticated by key would be refused — or we'd have to mint JWTs,
  which means sharing basegeek's secret with another container.
- No new container, no ninth Watchtower target, no new CI image.
- Resolvers already enforce ownership; the MCP layer inherits that for free.

## 2. Transport

**Streamable HTTP**, exposed publicly over HTTPS through the existing nginx
(`DOCS/RUNBOOK.md`, nginx section). ChatGPT only connects to remote servers, so stdio is out.
The same endpoint serves Claude clients.

Unlike `apps/fitnessgeek/tools/influx-mcp` (stdio, local-only), this one is outward-facing.

## 3. Auth — two stages

**Stage A — bearer API key.** Reuse the `APIKey` model. Add per-app permissions
(`mcp:notegeek`, `mcp:bujogeek`, `mcp:fitnessgeek`, …) to `validPermissions`. The key's
`createdBy` is the acting user; load them from Mongo and build the context as `/graphql` does.
Enough for Claude clients; fastest path to real use.

**Stage B — OAuth 2.1 over the existing SSO.** My understanding is that ChatGPT custom
connectors expect OAuth (or no auth), not a pasted bearer key. **Verify against current
OpenAI docs before building** — this is from memory, not checked. If ChatGPT is the primary
client, Stage B is the bulk of the effort (authorization server endpoints, consent screen,
dynamic client registration, token → user mapping, scopes = the per-app permissions above).

## 4. Tools — curated, never a raw GraphQL passthrough

A "run any query" tool would hand a chatbot `apiKeys`, `saveAIConfig`,
`removeAIProviderKey`, and the rest of the admin surface. Every tool instead owns one fixed
operation, a trimmed field selection, and a size cap.

### v1 (read-only)

| Tool | Backed by | Notes |
|---|---|---|
| `search` | `glanceSearch` | ChatGPT's deep-research mode looks for `search` + `fetch` by name |
| `fetch` | per-type lookup by id | dispatch on the `app`/`type` a search result carries |
| `today` | `glanceToday` | one-call daily overview |
| `notes_search`, `note_get` | `searchNotes`, `note` | exclude `isEncrypted` / `isLocked` notes |
| `tasks` | `dailyTasks` / `weeklyTasks` / `blockedTasks` | |
| `habits` | `habits`, `habitLogs` | |
| `fitness_day` | `dailySummary` | |
| `weight_trend` | `fitnessWeights` | date window, capped |
| `food_log_range` | `foodLogs(startDate, endDate)` | capped window |
| `books` | `books`, `shelves` | |
| `flock_eggs` | `eggProductions` | |

### Deliberately excluded

- Everything in basegeek's admin/aiGeek/API-key surface.
- `fitnessHouseholdMemberLogs` — other people's data.
- Anything that triggers our own AI calls (`glanceAsk`, `fitnessInsights*`, `whatNext`,
  `reviewDraft`, `suggestForNote`, `composeNote`): it would burn aiGeek quota to feed
  someone else's model. Revisit individually if a real use shows up.

### Later (writes)

A few writes only: `add_task`, `log_weight`, `create_note`. Each tool sets MCP annotations
(`readOnlyHint` / `destructiveHint`) so clients confirm before running. No deletes.

## 5. Guardrails

- Per-key rate limits — already in `APIKey.checkRateLimit()`.
- Logging: tool name + argument **names** only, matching the `[GQL]` rule in `GRAPHQL.md` §1.
- CSRF: bearer-only requests carry no cookie; **verify** the double-submit check exempts
  them rather than assuming it does.
- nginx body limit: basegeek's nginx has bitten us before (`client_max_body_size`); set it
  for `/mcp` deliberately. The nginx config is not in the repo.
- Responses shaped for a model: small, flattened, dates as ISO strings, explicit truncation
  markers so the client knows it didn't get everything.

## 6. Open questions for Chef

1. **Is ChatGPT specifically the target?** Yes → Stage B (OAuth) is required and is most of
   the work. No → Stage A ships in about a day.
2. **Health data** (blood pressure, medications, body composition, food) would leave the box
   for OpenAI's servers. Include it, make it an opt-in scope per app, or exclude it?
3. **Read-only for v1?** Recommended: yes.

## 7. Next step

Answer §6, then run `spec-builder` to turn this into a spec with acceptance criteria.
