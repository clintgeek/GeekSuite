# aiGeek Usage Guide

Practical reference for callers of aiGeek's OpenAI-compatible endpoint.
Covers the three routing modes, structured output, tool calling, and a
worked example per use case.

**Endpoint:** `POST https://<basegeek-host>/openai/v1/chat/completions`
**Auth:** `Authorization: Bearer bg_<64-hex>` (permission: `ai:call`)
**Full API reference:** [packages/api/README_OPENAI_PROXY.md](../packages/api/README_OPENAI_PROXY.md)

## Three routing modes

### 1. Rotation (default — "keep me coding for free")

Pick a `basegeek-rotation` model (or any model name not prefixed with a
known provider). aiGeek cycles through free-tier providers by priority,
respects per-provider quotas, and cools providers after 429s. Best for
high-volume or cost-sensitive workloads.

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
`cohere`, `openrouter`, `cerebras`, `cloudflare`, `ollama`, `llm7`,
`llmgateway`, `onemin`.

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

Supported today: **Anthropic** (all models), **Gemini** (1.5-flash/pro),
**Groq** (llama-3.3-70b-versatile, llama-3.1-70b-versatile, llama-4-*,
gpt-oss-*, and others).

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

## Streaming

`stream: true` for SSE. Plain text streams in 50-char chunks for
responsive UX. When `tools` or `response_format` is active, the content
is emitted in a single chunk so the payload stays parseable.

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
- `supportsToolCalling` — `tools` / `tool_choice` native

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
