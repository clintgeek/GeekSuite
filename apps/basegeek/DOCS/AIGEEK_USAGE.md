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
