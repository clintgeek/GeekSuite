# StoryGeek Gateway Decision

Decides SUITE_TODO.md item 5. Deciding fact up front: **the gateway's storygeek module has
zero live callers.** Not "unused by the frontend" — unused, period. Delete it.

## 1. What exists

### basegeek's gateway module — `apps/basegeek/packages/api/src/graphql/storygeek/`

| File | Lines | What it does |
|---|---|---|
| `typeDefs.js` | 86 | `Story` type (+ 6 nested types: character, location, dice, event, world state, stats). `Query { stories(status), story(id) }`. `Mutation { createStory, updateStoryStatus, deleteStory }`. No character/inventory/skill mutations — those exist only as embedded read fields. |
| `resolvers.js` | 98 | `stories` — list, owner-filtered, optional status filter. `story` — single read, owner-scoped, malformed/foreign id → `null` (no existence oracle). `createStory` — stamps caller as owner, seeds default `worldState`/`stats`. `updateStoryStatus` / `deleteStory` — owner-scoped, foreign/malformed id → `"Story not found"`. Field resolvers for `id` and `currentLocation`. |
| `models/Story.js` | 114 | Full Mongoose schema (characters, locations, dice, events, `aiContext`, `storyState`, stats) on its own connection (`getAppConnection('storygeek')` — storygeek's own Mongo, not shared with any other gateway module). Structurally a near-duplicate of `apps/storygeek/backend/src/models/Story.js` (266 lines; superset — adds tags, checkpoints, canon/provenance fields the gateway copy has never grown). |
| `__tests__/storygeekOwnership.test.js` | 172 | 13 jest cases proving owner-scoping, malformed-id handling, unauth rejection. Calls `resolvers`/`Story` directly (no HTTP layer, no schema exercised) — it tests the module in isolation, not any request path. |

**298 lines of schema/resolver/model + 172 lines of test = 470 lines total**, wired into the
gateway schema in `apps/basegeek/packages/api/src/graphql/index.js:26-27` via `mergeTypeDefs`/
`mergeResolvers`.

### storygeek's own REST surface — `apps/storygeek/backend/src/routes/`

Per today's zod pass (`apps/storygeek/DOCS/CONTEXT.md`), five route families, one controller
(`controllers/storyController.js`, 494 lines) and 13 services (3,732 lines: `aiService`,
`bookService`, `epubService`, `canonQueryService`/`canonValidationService`, `characterService`,
`checkpointService`, `contextService`, `diceService`, `stateCommitService`/
`stateExtractionService`, `storyStateService`, `summaryService`, `tagService`):

| Route file | Lines | Surface |
|---|---|---|
| `stories.js` | 42 | `POST /start`, `POST /:storyId/continue` (streaming AI turn via `aiService`), `GET /user/:userId`, `GET /:storyId/summary`, `GET /:storyId`, `PATCH /:storyId/status`, `DELETE /:storyId` |
| `characters.js` | 141 | Full character CRUD against `story.characters` (the embedded array — the standalone `models/Character.js` is dead, touched only by `characterService.js`, no route calls it) |
| `export.js` | 48 | `POST /stories/:storyId/bookify`, `POST /stories/:storyId/epub` (binary EPUB response) |
| `ai.js` | 37 | `GET /gm-config`, `GET /providers`, `GET /director/models` (proxies to basegeek's `/api/ai/*`) |
| `auth.js` | 102 | `POST /refresh`, `GET /me`, `POST /logout` |

This REST surface is the one that just went through the zod validation pass (2026-09-05) and
got a service key for its own AI calls (`AI_GEEK_API_KEY`, `aiService.js:44-58` — a server-to-
server bearer credential for app `storygeek` against basegeek's `/api/ai/call`, orthogonal to
the GraphQL gateway's cookie/JWT model).

### storygeek's frontend client

- `frontend/src/api.js` (8 lines) — the axios instance every page actually uses
  (`StoryList.jsx`, `StoryCreation.jsx`, `StoryPlay.jsx` all `import api from '../api'`).
- `frontend/src/apolloClient.js` (5 lines) — **is** wired into `App.jsx` (`ApolloProvider`
  wraps the whole app, line 70), so the SUITE_TODO note "never imported" is slightly off: the
  provider is mounted. But nothing under it fires.
- `frontend/src/graphql/queries.js` / `mutations.js` — `GET_STORIES`, `GET_STORY`,
  `CREATE_STORY`, `UPDATE_STORY_STATUS`, `DELETE_STORY` — a hand-written, schema-matching set
  of operations. **No component imports either file.** `grep` for `graphql/queries` /
  `graphql/mutations` across `frontend/src` returns nothing. The Apollo plumbing is fully
  assembled and fully inert — a wired outlet with nothing ever plugged in.

## 2. Who calls what

Grepped the whole repo (excluding the module's own files) for `graphql/storygeek`: the only
two hits are `graphql/index.js` (the merge) and the ownership test. Checked the two places a
live cross-app dependency would show up:

- **startgeek's day-at-a-glance / Ask** (`apps/basegeek/packages/api/src/graphql/glance/{resolvers,askService,typeDefs}.js`,
  `apps/startgeek/src`) — no reference to `story`/`stories`/`createStory`/etc., and no import
  of anything under `graphql/storygeek`. Glance does not read stories.
- **basegeek's Home/registry and StartGeek's app tiles** (`BaseGeekHome.jsx`, `PortalPage.jsx`)
  — reference storygeek only as static registry metadata (name, icon, color, URL for the login
  link). No GraphQL query involved.

**Conclusion: no live caller anywhere in the suite.** The module is reachable only by direct
GraphQL request (nobody sends one) and by its own test (which bypasses the schema entirely).

## 3. Option A — drop the module

**Delete:**
- `apps/basegeek/packages/api/src/graphql/storygeek/` (typeDefs.js, resolvers.js, models/Story.js — 298 lines)
- `apps/basegeek/packages/api/src/__tests__/storygeekOwnership.test.js` (172 lines)
- The 2-line import + merge entries in `graphql/index.js:26-27` (and wherever `storyTypeDefs`/`storyResolvers` feed `mergeTypeDefs`/`mergeResolvers`)
- `apps/storygeek/frontend/src/apolloClient.js`, `graphql/queries.js`, `graphql/mutations.js`, the `ApolloProvider` wrap in `App.jsx` (lines 6, 10, 70), and the `@apollo/client` / `@geeksuite/api-client` deps from storygeek's frontend `package.json` if nothing else in that app uses them (worth a quick grep before pulling the dep, not before pulling the files)

**No shared model or collection is affected.** `getAppConnection('storygeek')` opens storygeek's
own Mongo connection — the same database storygeek's own backend already writes to directly, not
a shared one another gateway module also touches (unlike, say, fitnessgeek's 13-model overlap).
Deleting the gateway's copy does not touch a single document; it just stops maintaining a second,
thinner schema against the same data that nothing reads.

**basegeek's Home/registry and StartGeek reference storygeek only as static app-tile metadata**
(confirmed above) — untouched by this deletion.

**Risk: XS.** Dead code with a passing-but-pointless test; no runtime path exercises it.
**Effort: XS** (single PR, delete-only, no migration).

## 4. Option B — build it out

To actually replace `/stories/:storyId/continue`, `/export/*`, `/ai/*`, and character/inventory
CRUD, the schema would need:

| REST route | GraphQL fit |
|---|---|
| `POST /:storyId/continue` | **Poor fit.** Streams an AI turn (aiService, dice rolls, state extraction/commit) — this repo's GraphQL layer has no subscription/streaming precedent; would degrade to a single blocking mutation, losing progressive narration. Stays REST. |
| `POST /export/stories/:storyId/{bookify,epub}` | **Poor fit.** Binary response (`Content-Type: application/epub+zip`, `Content-Disposition` attachment). GraphQL doesn't serve binaries. Stays REST regardless. |
| `GET /ai/{gm-config,providers,director/models}` | Thin proxies to basegeek's own `/api/ai/*` — could be GraphQL queries, but they're just passthroughs; low value either way. |
| Character/inventory/skill CRUD (`routes/characters.js`, 141 lines) | Fair fit — CRUD shape, but the gateway schema today has **zero** mutations for it (only read-only embedded fields on `Story`). Full parity means writing `addCharacter`/`updateCharacter`/`addInventoryItem`/etc. from scratch. |
| Story CRUD (list/get/status/delete) | Already modeled — this is the one slice basegeek's schema already covers. |

**Effort: L.** Real work is the character/inventory mutation set (currently absent) plus
picking apart `storyController.js` (494 lines) and `characterService.js`/`contextService.js`/
`stateCommitService.js`/etc. to decide what a resolver may safely call vs. what stays
route-only (continue/export/ai would remain REST no matter what — see above). Two-thirds of
the REST surface (continue, export, ai) is not replaceable in GraphQL at all, so "build it out"
only ever gets you the CRUD third.

**What it buys:** one auth path for the CRUD slice (cookie/JWT through the gateway, same model
bujogeek/notegeek use) instead of two. Doesn't touch the AI service-key pattern
(`AI_GEEK_API_KEY`, minted today for storygeek's own REST→basegeek AI calls) — that's a
different, already-working auth path for a different hop (storygeek backend → basegeek AI),
untouched by anything GraphQL does here.

## 5. Option C — hybrid

Keep `/continue`, `/export/*`, `/ai/*` on REST (they have to stay there regardless — see the
fit table above); move only story list/get/status/delete and character/inventory CRUD onto the
gateway, so StartGeek/basegeek could read stories through one place if they ever wanted to.

**Effort: M.** Smaller than Option B (no need to touch continue/export/ai at all), but still
requires writing the character/inventory mutations from zero and then migrating storygeek's own
frontend off `api.js` for that slice — real work with, today, **zero requesters**. Nothing in
the suite currently wants to read story data from anywhere but storygeek's own frontend.

## 6. Recommendation

**Drop the module (Option A).** The deciding fact: grepping the entire suite — startgeek's
glance/Ask, basegeek's Home/registry, storygeek's own frontend — turns up no caller of
`stories`/`story`/`createStory`/`updateStoryStatus`/`deleteStory` anywhere, so this isn't a
migration, it's deleting 470 lines (298 module + 172 test) of accurate-but-pointless code that
duplicates a schema storygeek's REST API already serves better. Revisit Option C only if a
concrete second consumer (e.g., StartGeek's glance wanting a "recent stories" tile) actually
shows up — until then there's no requester to build B or C for.
