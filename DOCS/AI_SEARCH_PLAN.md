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

**basegeek (S–M).** One new GraphQL query in `graphql/glance`:

```graphql
glanceAsk(query: String!, limit: Int): GlanceAsk!
type GlanceAsk {
  intent: GlanceIntent!          # kind, keywords, apps, types, since, shelf, tags
  answer: String                 # null unless grounded
  citations: [ID!]!              # result ids the answer used
  results: [GlanceResult!]!      # the merged glanceSearch hits
  draft: GlanceDraft             # a proposed task/note when kind = command
  provider: String               # which provider answered, for the footer
}
```

The resolver calls `aiService` server-side (`model: "basegeek-free"`, `response_format:
json_schema`, `app: "startgeek"` for usage attribution), then runs the existing
`glanceSearch` logic with the plan. No key or provider detail reaches the browser; the
user's cookie session is the only credential. Locked and encrypted notes are already excluded
from search and stay excluded from the model's context.

**startgeek (S).** `CommandBox` keeps the instant regex results exactly as today. Two triggers
add the AI layer on top, never instead: pressing Enter with no result selected, or a query
that looks like language (three or more words, or ends with `?`). While `glanceAsk` runs, a
quiet "thinking" state on the mode chip; on return, the answer card and the intent chips
appear above the list. Any failure or timeout (3 s) leaves the plain results in place.
`SearchResults` gains an `answer` slot; a new `AnswerCard` shows the line, the provider in
mono at 11px, and the citations as the highlighted rows.

## Decisions for Chef

1. **Opt-in.** Note content leaving the box to a third-party free-tier provider is new. Default
   the AI layer off, with a Settings toggle ("Ask the suite with AI") and a per-query override
   (`??` prefix)? Or on by default for titles only, content only when toggled?
2. **Trigger.** Auto-detect language-shaped queries, or require the explicit `??` prefix so the
   cost and latency are always the user's choice? Recommendation: explicit prefix first, auto
   later once latency is known.
3. **Provider.** `basegeek-free` rotation (free, 1–3 s, variable quality) or a pinned paid model
   for this one surface (consistent, costs money)? Recommendation: start on rotation; the
   schema-validated output makes quality differences survivable.

## Order of work

1. AIGeek phase B lands first (admin gating on keys, toasts) — this adds a new AI-calling
   surface and should not land on the current unguarded config.
2. basegeek `glanceAsk` with the intent + search layer only, behind a feature flag, with a
   Jest test that feeds a canned model response and asserts the merged results. **S–M**
3. startgeek answer card + `??` prefix. **S**
4. Grounded answers from `glanceToday`. **S**
5. Command routing fallback for `>` and `<`. **S**

Effort overall: **M**. Depends on nothing in the Pocket Pass.
