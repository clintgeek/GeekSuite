# aiGeek Usage Guide

Practical reference for callers of aiGeek's OpenAI-compatible endpoint.
Covers the three routing modes, structured output, tool calling, and a
worked example per use case.

**Endpoint:** `POST https://<basegeek-host>/openai/v1/chat/completions`
**Auth:** `Authorization: Bearer bg_<64-hex>` (permission: `ai:call`)
**Full API reference:** [packages/api/README_OPENAI_PROXY.md](../packages/api/README_OPENAI_PROXY.md)

## Three routing modes

### 1. Rotation (default — "keep me coding for free")

Pick `basegeek-rotation` — or send no `model` at all. aiGeek cycles through
free-tier providers by priority, respects per-provider quotas, and cools
providers after 429s. Best for high-volume or cost-sensitive workloads.

(This used to say "or any model name not prefixed with a known provider".
That is no longer true, and was never a good idea: since 2026-09-05 a model
id aiGeek does not recognise is a **404 `model_not_found`** rather than a
silent reroute. See *Unknown model ids* below.)

```js
await openai.chat.completions.create({
  model: 'basegeek-rotation',
  messages: [{ role: 'user', content: 'Summarize this diff...' }]
});
```

### 2. Free-only

Identical to rotation but skips paid providers (Anthropic, Gemini when
not free-tier'd). Used by fitnessgeek and other suite apps for
background inference where any free model will do.

```js
await openai.chat.completions.create({
  model: 'basegeek-free',
  messages: [{ role: 'user', content: 'Name this food: chicken breast' }]
});
```

### 3. Explicit provider pin

Use `<provider>/<model>` to bypass rotation and target a specific
provider/model. Useful when caller needs deterministic output from one
provider (e.g., geekPR PR reviews need the same reviewer persona across
retries).

```js
await openai.chat.completions.create({
  model: 'anthropic/claude-3-5-sonnet-20241022',
  messages: [...]
});
```

Known provider prefixes: `anthropic`, `groq`, `gemini`, `together`,
`cohere`, `openrouter`, `cerebras`, `cloudflare`, `ollama`, `llmgateway`.

**A pin is a promise, and since 2026-09-05 it is kept.** The model half is
checked against that provider's catalog: `anthropic/gpt-4o-mini` names a real
provider and a model it has never served, and is a **404 `model_not_found`**
rather than a 200 from somewhere else. A pinned request also does **not** fall
back — if the pinned provider is down, rate-limited or out of quota, you get
the error, not another provider's default model wearing the name you pinned.
That is the whole point of pinning; if you would rather have *an* answer than
*that* answer, use `basegeek-rotation`.

(The catalog check fails open: if aiGeek cannot enumerate a provider's models
at that moment, the pin is allowed through rather than refused. "Cannot list"
is not "does not exist".)

`llm7` and `onemin` were retired on 2026-09-04 and their implementations
deleted on 2026-09-05; pinning either now fails like any other unknown
provider. See [AI_CATALOG.md](./AI_CATALOG.md#removed-2026-09-04).

### Unknown model ids

Anything that is not one of the three `basegeek-*` aliases, not a
`<provider>/<model>` pin, and not an id from `GET /openai/v1/models` is a
**404 `model_not_found`** whose message names the alternatives.

This is the one place aiGeek deliberately refuses to be a drop-in. LangChain's
`ChatOpenAI` defaults to `gpt-4o-mini`; Continue and Cursor-style tools ship a
`gpt-4o` default; every curl example copied from OpenAI's docs names a `gpt-*`
model. aiGeek serves its own catalog, and answering one of those with a
different model's completion at HTTP 200 would be worse than saying so. Set the
model as well as the base URL.

### When a provider fails

Upstream failures are reported in aiGeek's own words, from a fixed list — never
the provider's error body, which is why you will not find an org id, a quota
breakdown or a vendor's request id in a response. The provider that failed is
baseGeek's business, not the caller's; the credential that was rejected is
baseGeek's too.

| What happened | You get |
|---|---|
| The provider rate-limited us | `429 rate_limit_error` / `rate_limit_exceeded`, with `Retry-After` |
| The provider rejected the request shape | `400 invalid_request_error` / `upstream_invalid_request` |
| The provider does not have that model | `404 invalid_request_error` / `model_not_found` |
| The provider timed out | `504 server_error` / `upstream_timeout` |
| Bad provider credential, or a provider 5xx | `502 server_error` / `upstream_error` |
| Nothing left in the rotation | `503 server_error` / `upstream_unavailable` |
| Anything else | `500 server_error` / `internal_error` |

Every message ends with `(request id: <id>)` — the `X-Request-Id` on the
response, and the key to the log line that *does* hold the provider's full
answer. Quote it when you ask an operator what actually went wrong.

## Who is calling

Two decisions turn on the answer: which `AIAppConfig` row routes the call — so,
which model answers and at whose expense — and which app the usage lands
against. Until 2026-09-05 both read `config.appName` out of the request body,
which is to say aiGeek took the caller's word for it. Any holder of any key or
token could route through, and bill, any app it named.

The app now comes from the credential:

| Credential | App id | `verified` |
|---|---|---|
| API key (`Authorization: Bearer bg_...`) | the key's `appName` | ✅ |
| JWT | the token's `app` claim | ✅ |
| in-process caller (StartGeek Ask) | named in code | ✅ |
| a JWT with no `app` claim | `unattributed` | ❌ |

Ids are normalized: lowercased, and everything from the first `:` dropped.
`fitnessGeek`, `fitnessgeek` and `fitnessGeek:mealPlan` are one app.

### What the body may still say

One thing: **`feature`** — a slice of the app you already are.

```js
await axios.post('/api/ai/call', {
  prompt,
  feature: 'mealPlan',        // or config.feature
  config: { useAppConfig: true }
});
```

The legacy `appName: "app:feature"` spelling still works, but only its suffix
survives: the app half is discarded and replaced with the resolved one. A body
`appName` is now purely a *switch* — a body that names an app and no provider
still auto-routes through app config, exactly as before, but the row looked up
is the caller's own. `userId` in the body is honoured for **API-key callers
only**, because a service key has no session; without it every call from a
backend would share one free-tier quota bucket. The OpenAI proxy reads OpenAI's
own `user` field for the same purpose.

Usage groups the same way: one row per app, with `features` nested inside it,
so "what does fitnessgeek cost" has one answer instead of three.

This holds on **every** route that spends: `/api/ai/call`, `/api/ai/call-smart`,
`/api/ai/conversation/message`, `/api/ai/parse-json`, `/api/ai/test` and the
OpenAI proxy. `/api/ai/parse-json` was the one that got away in the first pass —
it had neither the `ai:call` check nor the resolver until 2026-09-05, so a key
minted with only `ai:models` could call it and name any app and any user. If you
have a key that has been reaching `/parse-json` without `ai:call`, it stops
working: mint it the permission it was always supposed to have.

### Minting a key for a backend

Each backend gets its own key. On the baseGeek host:

```sh
cd apps/basegeek/packages/api
node scripts/mint-api-key.js \
  --app storygeek --name "storygeek backend" \
  --permissions ai:call,ai:director \
  --write-env ../../../storygeek/.env.production --var AI_GEEK_API_KEY
```

`--write-env` upserts `VAR=key` into the target file at mode 600, preserving
every other line and **refusing to overwrite an existing value** unless
`--replace` — clobbering a live key breaks a running app in a way that looks
like an aiGeek outage. Without `--write-env` the key is printed once, to your
scrollback and shell history; prefer the file. It prints `keyId`, `keyPrefix`,
`appName`, the permissions and the env path — never a connection string.

Permissions are the APIKey enum: `ai:call`, `ai:models`, `ai:providers`,
`ai:stats`, `ai:director`, `ai:usage`. Add `ai:director` for a backend that
asks the model steward what is free (StoryGeek does; FitnessGeek does not).

`--app` refuses a `:feature` suffix: a key belongs to an app, and one minted
for `fitnessGeek:mealPlan` would silently be a `fitnessgeek` key.

### What the App Routing row keys on

The resolved app id. An admin pinning a model for `fitnessgeek` pins it for
every call from FitnessGeek — coach, meal plan and anything added later — and
the feature shows up in the usage breakdown rather than as a second app to
configure. Legacy rows are still honoured: the lookup falls back to a
case-insensitive match on the id or any `id:feature` spelling, so a row an
admin pinned months ago as `fitnessGeek` keeps routing. Nothing rewrites those
rows; renaming one is an admin decision.

## Structured output

`response_format: {type: "json_object" | "json_schema"}` works everywhere:

- Anthropic / Gemini: native translation (tool-use forcing / responseSchema).
- All other providers: prompt-injection fallback + JSON extraction on the
  response. Lower reliability than native but no provider is skipped.

```js
await openai.chat.completions.create({
  model: 'basegeek-rotation',
  messages: [{ role: 'user', content: 'List 3 fruits' }],
  response_format: {
    type: 'json_schema',
    json_schema: {
      name: 'FruitList',
      schema: {
        type: 'object',
        properties: { fruits: { type: 'array', items: { type: 'string' } } },
        required: ['fruits']
      }
    }
  }
});
```

With `instructor` (Python):

```python
import instructor, openai
from pydantic import BaseModel

class Person(BaseModel):
    name: str
    age: int

client = instructor.from_openai(openai.OpenAI(
    base_url="https://basegeek.clintgeek.com/openai/v1",
    api_key="bg_..."
))
person = client.chat.completions.create(
    model="anthropic/claude-3-5-sonnet-20241022",
    messages=[{"role": "user", "content": "Alice is 30."}],
    response_model=Person
)
```

## Tool calling

`tools` + `tool_choice` work on providers with native support. Others
are skipped by the rotation (no fallback — tool-call contract demands
machine-parseable structure).

Supported today: **Anthropic** (all models), **Gemini**, **Groq**
(llama-3.3-70b-versatile, llama-3.1-70b-versatile, llama-4-*, gpt-oss-*, and
the others in `TOOL_CALLING_CORRECTIONS`).

That list is now identical to the list of providers whose adapter actually puts
`tools` on the wire (`TOOL_FORWARDING_PROVIDERS`). It has to be: the rotation
*selects* on `supportsToolCalling`, so a provider advertised as capable with no
adapter behind it is not skipped — it is chosen, the `tools` array is dropped,
and the caller gets prose with `finish_reason: "stop"`. Groq was in exactly
that state until 2026-09-05, on twelve models, and this doc said so.

```js
await openai.chat.completions.create({
  model: 'anthropic/claude-3-5-sonnet-20241022',
  messages: [{ role: 'user', content: "What's the weather in Paris?" }],
  tools: [{
    type: 'function',
    function: {
      name: 'get_weather',
      description: 'Get current weather for a city',
      parameters: {
        type: 'object',
        properties: { location: { type: 'string' } },
        required: ['location']
      }
    }
  }],
  tool_choice: 'auto'  // or 'required' | 'none' | {type:'function', function:{name:'get_weather'}}
});
```

### Feeding the result back

The second half of the loop — the turn every agent framework runs — works on
all three native providers. Send the assistant's `tool_calls` turn back
unchanged, then a `role: "tool"` turn carrying the matching `tool_call_id`:

```js
messages: [
  { role: 'user', content: "What's the weather in Paris?" },
  { role: 'assistant', content: null, tool_calls: [
    { id: 'call_1', type: 'function',
      function: { name: 'get_weather', arguments: '{"location":"Paris"}' } }
  ]},
  { role: 'tool', tool_call_id: 'call_1', content: '{"tempC":18}' }
]
```

aiGeek translates both turns into each provider's idiom: Anthropic `tool_use` /
`tool_result` blocks, Gemini `functionCall` / `functionResponse` parts (keyed by
name, which aiGeek resolves from the `tool_call_id`), and Groq verbatim. Before
2026-09-05 both turns were flattened to plain text, so the first tool call
worked and the turn that fed the result back did not.

## Streaming

`stream: true` for SSE. Plain text streams in 50-char chunks for
responsive UX. When `tools` or `response_format` is active, the content
is emitted in a single chunk so the payload stays parseable.

- The first chunk carries `delta: {role: "assistant", content: ""}`.
- Streamed `delta.tool_calls[]` entries carry `index`.
- `stream_options: {include_usage: true}` emits a `choices: []` usage chunk
  before `data: [DONE]`.
- A failure before the first byte is a real HTTP error status, not a 200 with
  an error frame in the body.
- The terminal chunk carries `x_geeksuite` — which provider actually answered.

**Streaming is simulated.** The whole completion is awaited and then re-chunked,
so time-to-first-token equals time-to-last-token. The frames are spec-shaped and
every SSE client works; you just do not get the words any sooner.

## When to use which mode

| Scenario | Mode | Why |
|---|---|---|
| High-volume coding assist | `basegeek-rotation` | Free providers, auto-failover |
| Background/batch jobs | `basegeek-free` | Guaranteed no-cost |
| geekPR PR reviews | `anthropic/claude-3-5-sonnet-20241022` | Consistency across retries |
| Tool calling required | Rotation OR explicit pin | Rotation skips incapable providers |
| Strict JSON schema output | Rotation (prefers native first) | Fallback keeps non-native providers useful |

## Capability matrix

Per-provider support for `response_format` and `tools` is tracked in
`aiModelCapabilitiesService.js`. Key flags:

- `supportsJSONMode` — `response_format: {type:'json_object'}` native
- `supportsJSONSchema` — `response_format: {type:'json_schema'}` native
- `supportsToolCalling` — `tools` / `tool_choice` reach the provider. Note this
  is a claim about *our adapter*, not only about the model: it is false for
  every provider outside `TOOL_FORWARDING_PROVIDERS` however capable the model
  is. The looser "this model can call functions at all" signal is the legacy
  `supportsFunctionCalling`, which aiDirectorService scores on.

Providers without native support for a given feature fall through to
either prompt-injection fallback (structured output) or capability-skip
(tools). See [AIGEEK_POLISH.md](./AIGEEK_POLISH.md) for the design
rationale.

## Model steward

The free tiers move — a model that was free in June is retired in August, and
the fastest free model this month is not the one from last month. So aiGeek
answers two questions rather than making callers hardcode an answer:

- **`aiFreeModels`** — what free models exist right now, with their properties.
- **`aiRecommendModel`** — which of them fits a described task.

Both are **authenticated but not admin**: an app filling in its own routing has
to be able to ask. Neither returns a credential, a key hint, or anything
derived from one. The mutations that *change* routing (`saveAIAppConfig`) stay
admin-gated as before.

"Free" is the AIFreeTier record's `isFree`, never a guess from a `$0.00` price
— a zero price on a paid account is still a paid account. Providers that are
disabled or hold no key are excluded: a free model aiGeek cannot reach is not
an option.

### Browse the free catalog

```graphql
query FreeModels {
  aiFreeModels {
    provider
    modelId
    name
    contextWindow
    supportsFunctionCalling
    supportsJSONOutput
    supportsVision
    performance { speed quality reasoning }
    freeLimits { requestsPerMinute requestsPerDay tokensPerMinute tokensPerDay }
    pricing { input output }
    notes
    lastSeen    # when the catalog last confirmed this id exists upstream
    updatedAt   # when what we believe about it last changed
  }
}
```

Capability flags are non-null booleans, so `supportsJSONOutput: false` means
false and not "we never asked". `contextWindow`, `pricing` and the freshness
stamps are nullable — those are the fields the catalog genuinely may not know.

REST parity: `GET /api/ai/director/free-models` (permission `ai:director`),
returning `{ success, data: { models, count, providers } }`.

### Ask which model fits

```graphql
query Recommend {
  aiRecommendModel(
    task: "turn a natural language query into a JSON search plan"
    priority: "speed"      # cost (default) | speed | quality
    freeOnly: true         # default; pass false to include paid candidates
    limit: 3
  ) {
    priority
    freeOnly
    requirements { needsJSONOutput needsFunctionCalling needsVision }
    recommendations {
      provider
      modelId
      name
      reasoning     # the human sentence: "Free tier available, Returns structured JSON, 131k context window"
      score         # 0-100 capability fit
      contextWindow
      performance { speed quality }
    }
  }
}
```

REST parity: `POST /api/ai/director/recommend` takes `freeOnly` and `limit` as
optional body fields alongside the existing `task`, `budget`, `priority` and
`requirements`. A body without them behaves exactly as it always has, and the
response still nests the model as `recommendations[].model.id` — StoryGeek's
epub pipeline reads that shape.

**Ordering vs. score.** The list is ranked by `priority` — cheapest, fastest or
best, as it always was. `score` is capability fit, and only breaks ties inside
that ordering. It is what tells you two equally free models are not
interchangeable.

### How a task description is read

`priority` says how to rank; the task description says what to filter on.
Requirements are keyword-sniffed from it, and an explicit `requirements` field
always wins over the keywords:

| Requirement | Keywords (case-insensitive substrings) |
|---|---|
| `needsVision` | image, vision, photo, screenshot, ocr |
| `needsAudio` | audio, speech, whisper, transcri(be\|ption) |
| `needsFunctionCalling` | function, tool |
| `needsReasoning` | reason, logic, solve |
| `needsCodeGeneration` | code, program, script |
| `needsJSONOutput` | json, structured, schema, search plan |

A model that cannot meet a parsed requirement is not a candidate — describe the
job honestly and the ranking narrows itself.

### Setting the answer: the model is data, not code

AIGeek's **App Routing** tab (`aiFreeModels` + `aiRecommendModel` in the app
config dialog) writes the chosen provider/model into that app's `AIAppConfig`
row at tier `specific`. Callers then route through it:

```js
await openai.chat.completions.create({
  model: 'basegeek-app',           // or useAppConfig: true
  messages: [...]
});
```

StartGeek Ask (`DOCS/AI_SEARCH_PLAN.md`) does exactly this, with app id
`startgeek`. Which model answers a suite search is therefore a row in the
database that an admin can re-ask the steward about whenever the free tiers
shift — not a constant anyone has to redeploy.

## The AIGeek admin page

`/aigeek` in baseGeek. **Admin-only** — the config mutations always were, and
since 2026-09-05 the route and its sidebar row are gated client-side too, so a
non-admin is sent to Home with a toast rather than shown a page of 403s.
DataGeek and UserGeek are gated the same way. The gate reads `role` from
`GET /auth/profile`; the server remains the thing that actually enforces it.

Four tabs:

| Tab | What it settles |
|---|---|
| **Configuration** | Provider keys and enable switches, plus **Try it** (below) |
| **Usage & Cost** | Calls, tokens and spend, per provider and per app |
| **Catalog** | Every model: price per 1M, FREE/PAID, and its free-tier limits |
| **App Routing** | Which model answers for which app, plus the model steward |

**Catalog is the merge of what used to be two tabs.** "Free Tier Config" and
"AI Catalog" listed the same models from the same query through two different
save paths — the catalog wrote a single model immediately, the free-tier editor
batched on Save All — so editing a model on one tab left the other stale, and
Save All could put the old value back over the newer one. One list now, one
save path (`BULK_UPDATE_FREE_TIERS`). The advanced dialog still exists for the
audio limits and the notes, which have no column, and it clears that model's
pending row edit as it saves so the two cannot fight.

### Try it

A prompt box on the Configuration tab that posts to `POST /api/ai/call` — the
same endpoint the suite's apps use, not a special admin path — and reports the
provider and model that answered, the wall-clock latency, the token counts and
the raw envelope. Leave the provider on **Rotation** to exercise the free-tier
rotation exactly as a caller gets it; pick a provider to pin one. The JSON
schema toggle sends `responseFormat` and accepts either a bare schema or the
full `{ name, schema }` envelope.

It deliberately sends no `appName` and no `feature`: the route auto-routes any
call that names either and no provider through the caller's `AIAppConfig` row,
which would stop the panel testing the rotation at all. (Since routing is keyed
on the credential, the *value* an admin could type there wouldn't matter — but
its presence would still flip the switch.)

Two additive fields on the non-streaming `/api/ai/call` response make this
possible, and are useful to any caller:

- **`provider`** — which provider actually answered. Rotation callers name none
  on the way in and previously had no way to learn it on the way out.
- **`usage`** — real counts instead of three hardcoded zeros. They are local
  estimates from the same `tokenCounter` the `/smart` route uses (not every
  provider in the rotation returns usage), and say so: `usage.estimated` is
  `true`. Existing OpenAI clients ignore both fields.
