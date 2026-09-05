# StartGeek Ask — aiGeek behind the suite search

Proposal, 2026-09-04. What we could do with aiGeek's inference behind StartGeek's meta
search, wired through basegeek's GraphQL. Nothing here is built.

## What exists

- **StartGeek command box** (`apps/startgeek/src/components/CommandBox.jsx`,
  `lib/commandMode.js`): one input, four modes by prefix — `>` task capture, `<` note capture,
  `?` suite search, anything else is a web search via the chosen engine. Suite search calls the
  GraphQL query `glanceSearch(query, limit)` after a debounce and renders a result list
  (`SearchResults.jsx`: title, type, snippet).
- **`glanceSearch`** (`apps/basegeek/packages/api/src/graphql/glance/resolvers.js:322`): a
  case-insensitive regex over the user's notes (title, unlocked content), tasks, books (title,
  authors) and birds; returns `{ id, app, type, title, snippet, url, updatedAt }` — already the
  unified "Thing" result shape the unification plan asks for (§6).
- **`glanceToday`**: everything the start page shows in one round trip — due and overdue tasks,
  habits, recent notes, books being read, fitness summary, flock counts.
- **aiGeek** (`apps/basegeek/packages/api/src/services/aiService.js`, `/api/ai/call`,
  `/openai/v1/chat/completions`): free-tier provider rotation with quotas and cooling,
  explicit provider pinning, `response_format: json_schema` with a prompt-injection fallback,
  usage tracked per app. Callers today are storygeek and fitnessgeek backends.

So the pieces are there: a search that knows where everything lives, a snapshot of the
user's day, and a model that can return validated JSON for free.

## What AI adds — three layers, each useful alone

### 1. Understand the query (intent + filters)

Regex search fails the moment the user types a sentence: "unread sci-fi from last year",
"notes about the coop", "what am I reading". aiGeek turns natural language into a structured
search plan the existing resolvers can run:

```json
{ "kind": "search",
  "keywords": ["coop", "chicken coop", "henhouse"],
  "apps": ["notegeek", "flockgeek"],
  "types": ["note", "bird"],
  "since": "2025-01-01", "shelf": null, "tags": [] }
```

Then `glanceSearch` runs once per keyword (or the resolvers accept the plan directly), results
are merged and de-duplicated, and the plan is shown back as removable chips ("notes · flock ·
since 2025") so the user sees and can correct what the model understood.

### 2. Answer from the user's own data (grounded, with citations)

For question-shaped queries ("what am I reading", "what's due today", "how many eggs this
week") the model is given `glanceToday` plus the top search hits as context and asked for a
one-line answer **with the ids of the Things it used**. StartGeek renders an answer card above
the result list, and the cited Things are the results. The model never gets to invent: if the
answer is not in the context, the schema forces `"answer": null` and the card is not shown.

### 3. Route commands the parser cannot

`>` capture already has a deterministic parser (`lib/parseTaskInput.js`). Keep it first. Only
when it fails or the text is ambiguous ("remind me to call the vet friday afternoon #flock")
does aiGeek produce a `CREATE_TASK` / `CREATE_NOTE` payload against the mutation's schema; the
box shows it as a preview chip ("Task · Fri 2 PM · #flock") and Enter confirms. Same UX, one
more escape hatch.

## Where the code goes

**basegeek (S–M).** *Landed 2026-09-04.* One new GraphQL query in `graphql/glance`
(`typeDefs.js`, `resolvers.js`, new `askService.js`):

```graphql
glanceAsk(query: String!, limit: Int = 12): GlanceAsk!

type GlanceAsk {
  intent: GlanceIntent!          # what the model made of the query
  answer: String                 # null unless grounded
  citations: [ID!]!              # result ids the answer used
  results: [GlanceSearchResult!]! # the merged, de-duped search hits
  provider: String               # which provider answered, for the footer
  model: String                  # and which model
}

type GlanceIntent {
  kind: String!                  # "search" | "answer"
  keywords: [String!]!
  apps: [String!]!
  types: [String!]!
  since: String
  shelf: String
  tags: [String!]!
}
```

The result type is the existing `GlanceSearchResult` that `glanceSearch` already
returns, not a new `GlanceResult` — one shape, one place. `draft` is not built;
it belongs to step 5.

`askService.planQuery` calls `aiService.callAI` server-side with
`useAppConfig: true, appName: 'startgeek'` — the same normalization
`/api/ai/call` performs for `model: "basegeek-app"`, so routing is whatever the
App Routing config says — plus `responseFormat: { type: 'json_schema' }` for the
intent shape and a 3 s timeout. Any failure returns a degraded plan
(`kind: 'search'`, the literal query as the only keyword) so the resolver still
answers with real regex results. `answerFrom` makes the second call only when
`kind === 'answer'`, with a trimmed `glanceToday` (tasks due/overdue, reading,
habits, fitness, flock) and the top hits as JSON context; the schema forces
`answer: null` when the context does not contain it, and citations are filtered
down to ids that were actually in the context.

The resolver refactor that made this possible: `glanceSearch`'s body is now
`searchThings(userId, term, { apps, types, since, shelf, tags, limit })`, which
both resolvers share — with no filters it behaves exactly as before — and
`glanceToday`'s body is now `fetchGlanceToday(context, date)` so `glanceAsk` can
reuse the snapshot. No key or provider detail reaches the browser; the user's
cookie session is the only credential. Locked and encrypted notes are excluded
from search and stay excluded from the model's context, asserted in
`src/__tests__/glanceAsk.test.js`.

**startgeek (S).** *Landed 2026-09-04.* `CommandBox` keeps the instant regex
results exactly as today under `?`. `??` is a separate mode
(`lib/commandMode.js`, checked before `?`) that never searches as you type: Enter
runs `GLANCE_ASK` (`lib/queries.js`) with a "thinking" state on the mode chip.
`components/AnswerCard.jsx` renders above the results — the answer line, the
intent as chips, the provider/model in mono at 12px — and `SearchResults` marks
cited rows with an accent rule. Any error falls back to running the plain
`glanceSearch` for the query. The layer is opt-in: "Ask the suite with AI" in
`SettingsSheet.jsx` (off by default, stored with the other console settings in
`localStorage`); with it off, `??` shows a one-line hint and a button that opens
settings.

## Decisions (Chef, 2026-09-04)

1. **Opt-in.** The AI layer is off by default; a StartGeek setting ("Ask the suite with AI")
   turns it on. Locked and encrypted notes stay out of the model's context regardless.
2. **Trigger: explicit.** `??` invokes Ask; `?` stays the instant regex search. Automatic
   detection of sentence-shaped queries is deferred until real latency is known.
3. **Provider: let aiGeek choose, as data.** Ask routes through `model: "basegeek-app"` with app
   id `startgeek`, so the model is whatever the App Routing config says. aiGeek grows a
   **model steward** surface to fill that config well: `recommendProvider(task, { freeOnly,
   priority })` ranks free models for a task description (the director already does most of
   this: keyword-parsed requirements, capability filtering, cost/speed/quality ordering, free-tier
   flags per model), `listFreeModels()` returns the current free models with their known
   properties (context window, JSON/tool support, speed/quality, free-tier limits), both exposed
   as authenticated GraphQL (`aiRecommendModel`, `aiFreeModels`) and REST, and the AIGeek App
   Routing dialog gets a "Recommend a free model" block plus a browsable free-model picker so
   the default can be set by asking, or by hand. Keeps the choice current as free tiers move.

## Order of work

1. ~~AIGeek phase B (admin gating on keys, toasts)~~ landed 2026-09-04 (`4fac2ef`).
1b. aiGeek model steward (recommend free model for a task, list free models, App Routing UI). **S–M**
2. ~~basegeek `glanceAsk` with the intent + search layer~~ **landed 2026-09-04.** The flag is
   the client-side opt-in rather than a server flag: `glanceAsk` is always available, but
   only `??` calls it. 19 Jest tests in `src/__tests__/glanceAsk.test.js` feed canned model
   responses and assert the merged results, the degraded path, and the locked-note exclusion.
3. ~~startgeek answer card + `??` prefix~~ **landed 2026-09-04.**
4. ~~Grounded answers from `glanceToday`~~ **landed 2026-09-04.**
5. Command routing fallback for `>` and `<` (the `draft` field on `GlanceAsk`). **S** — not started.

Effort overall: **M**. Depends on nothing in the Pocket Pass.
