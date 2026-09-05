# OpenAI-Compatible Proxy for baseGeek aiGeek

The baseGeek API exposes an OpenAI-compatible interface with automatic provider
rotation aligned with the “Keep Me Coding” plan. Point an OpenAI SDK at it and
it works — base URL and API key are the only changes.

> **Conformance.** The claim above is tested, not asserted:
> `src/__tests__/openaiCompat.test.js` issues the exact request shapes the
> OpenAI SDK puts on the wire and checks them against OpenAI's machine-readable
> spec (`openai/openai-openapi`, openapi 3.1.0, `info.version` 2.3.0). The gaps
> that suite found are catalogued in
> [`DOCS/OPENAI_COMPAT_AUDIT.md`](../../DOCS/OPENAI_COMPAT_AUDIT.md); they were
> closed on 2026-09-05. Run it with `pnpm test -- openaiCompat`.

## Endpoint

```
POST https://<your-basegeek-host>/openai/v1/chat/completions
GET  https://<your-basegeek-host>/openai/v1/models
GET  https://<your-basegeek-host>/openai/v1/models/{id}
model: basegeek-rotation (alias that triggers autoswitching)
```

There is exactly one OpenAI surface in this service. `/api/ai/v1/chat/completions`
and `/api/ai/v1/models` were an older, much worse second implementation of the
same contract; since 2026-09-05 they answer `308 Permanent Redirect` to the
paths above. A 308 preserves the method and the body, so a client still pointed
at the old address completes its call and learns the new one.

## Authentication
- Requires a valid baseGeek API key (`bg_...`) with the `ai:call` permission.
- Pass the key via `Authorization: Bearer bg_...` or `x-api-key: bg_...`.
- Keys are generated via existing baseGeek key management tools.
- The key is also the caller's identity: which app a call is attributed to and
  routed for comes from the key's `appName`, never from a request body field.
  See `services/callerIdentity.js`.

## Provider rotation strategy
Rotation priority: Groq → Cerebras → Together.ai → OpenRouter → Cloudflare →
Ollama Cloud. The service monitors soft quotas (RPM, TPM, daily totals) and
automatically cools providers for ~60s after a 429/limit response. Usage is
persisted in `packages/api/logs/rotation-state.json`.

## Model ids

| Model string | Effect |
|---|---|
| `basegeek-rotation` (or no `model` at all) | Free-tier rotation, quota-aware |
| `basegeek-free` | Free tier only, never a paid provider |
| `basegeek-app` | Route by the calling app's `AIAppConfig` row |
| `<provider>/<model>` | Pin exactly, no rotation — e.g. `anthropic/claude-3-5-sonnet-20241022` |
| any id in `GET /openai/v1/models` | Routed to the provider that owns it |
| anything else | **404 `model_not_found`** |

That last row is deliberate. `gpt-4o-mini` is what LangChain's `ChatOpenAI`,
Continue and every curl example copied from OpenAI's docs default to, and this
proxy does not serve OpenAI's catalog — it serves its own. It used to hand such
an id to whichever provider happened to be current and surface the upstream 404
as a generic 500; now it answers a 404 whose message names the three aliases
and the `<provider>/<model>` form, which is what an SDK's `NotFoundError` is
for. Model ids that merely *contain* a slash (`meta-llama/Llama-3.3-70B-…`) are
not split, because their prefix is not a provider name.

## Request body (OpenAI format)
```json
{
  "model": "basegeek-rotation",
  "messages": [
    {"role": "system", "content": "You are a helpful coding assistant."},
    {"role": "user", "content": "Help me debug this React hook."}
  ],
  "temperature": 0.2,
  "max_completion_tokens": 800,
  "stream": false
}
```

The proxy will:
1. Authenticate the API key and resolve the calling app from it.
2. Choose the best provider per rotation (honoring remaining quota and cooldown state).
3. Forward the chat completion request using that provider’s API, translating
   the OpenAI request into the provider's own idiom where it differs.
4. Return an OpenAI-style response. `x_geeksuite` says which backend answered.

### Sampling and control parameters

| Parameter | Status |
|---|---|
| `temperature`, `max_tokens` | honoured everywhere |
| `max_completion_tokens` | honoured, as the alias for `max_tokens` the spec now prefers; wins if both are sent |
| `top_p` | honoured everywhere (`generationConfig.topP` on Gemini) |
| `stop` (string or array) | honoured everywhere except Cloudflare Workers AI, which has no such field (`stop_sequences` on Anthropic, `generationConfig.stopSequences` on Gemini) |
| `seed` | honoured on the OpenAI-shaped providers and Ollama; Anthropic and Gemini have no equivalent |
| `presence_penalty`, `frequency_penalty` | honoured on the OpenAI-shaped providers, Ollama and Cloudflare; Anthropic and Gemini have no equivalent |
| `n` | only `n=1`; anything else is a 400 |
| `user` | accepted and used for per-user usage attribution |
| `logit_bias`, `logprobs`, `top_logprobs`, `store`, `metadata`, `service_tier`, `parallel_tool_calls` | accepted and ignored — never a 500 |

A parameter a given provider cannot express is dropped at that provider's
adapter rather than sent upstream to become a 400. It is never dropped silently
at the door, which is what used to happen to all five of `top_p`, `stop`,
`seed`, `presence_penalty` and `frequency_penalty`.

## Response (non-streaming)
```json
{
  "id": "chatcmpl-...",
  "object": "chat.completion",
  "created": 1730505000,
  "model": "basegeek-rotation",
  "choices": [
    {
      "index": 0,
      "message": {"role": "assistant", "content": "..."},
      "logprobs": null,
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 220,
    "completion_tokens": 150,
    "total_tokens": 370
  },
  "x_geeksuite": {
    "provider": "groq",
    "model": "llama-3.3-70b-versatile",
    "cached": false,
    "app": "codegeek",
    "feature": null
  }
}
```

`x_geeksuite` is baseGeek's own extension, not part of the OpenAI schema —
behind rotation, *which* backend answered is the one thing a caller cannot work
out for itself. It is namespaced with an `x_` prefix precisely so a client that
validates responses against the spec can ignore it rather than reject it. Every
SDK ignores keys it does not recognise.

`usage` totals are **locally estimated** from the message and completion text,
not reported by the provider: not every provider in the rotation returns usage,
and an honest estimate beats a zero that lies.

## Structured output (`response_format`)

Both the OpenAI-style `response_format: {type: "json_object"}` and
`response_format: {type: "json_schema", json_schema: {...}}` parameters work
transparently across every provider in the rotation:

- **Anthropic**: translated to tool-use forced-choice (for schemas) or
  system prompt + assistant prefill (for `json_object`).
- **Gemini**: maps to `generationConfig.responseMimeType` + `responseSchema`.
- **Everything else (Groq, Cerebras, Together, OpenRouter, Cloudflare,
  Ollama, LLM Gateway)**: prompt-injection fallback — the system message is
  wrapped with an instruction to emit schema-conformant JSON, and the response
  goes through a JSON extractor (strips ```json fences, pulls the first
  balanced JSON object) before reaching the client.

```json
{
  "model": "basegeek-rotation",
  "messages": [
    {"role": "user", "content": "Extract structured info from: 'Alice is 30 years old.'"}
  ],
  "response_format": {
    "type": "json_schema",
    "json_schema": {
      "name": "Person",
      "schema": {
        "type": "object",
        "properties": {
          "name": {"type": "string"},
          "age": {"type": "integer"}
        },
        "required": ["name", "age"]
      }
    }
  }
}
```

## Tool calling (`tools` / `tool_choice`)

OpenAI-style function tools are supported on providers with native tool
calling. Other providers are capability-skipped by the rotation (no fallback —
tool-call responses require a machine-parseable `tool_calls` structure, not
coerced text).

Native today: **Anthropic** (all Claude models), **Gemini**, **Groq** (the
models listed in `TOOL_CALLING_CORRECTIONS`). That list is now the same list as
the providers whose adapter actually puts `tools` on the wire
(`TOOL_FORWARDING_PROVIDERS` in `aiModelCapabilitiesService.js`) — a provider
cannot be advertised as tool-capable unless its `call*()` forwards the
parameter, because the rotation *selects* on that flag and a wrong one produces
prose where the contract promised `tool_calls`.

All four `tool_choice` forms work: `"auto"`, `"none"`, `"required"`, and
`{type: "function", function: {name}}`.

```json
{
  "model": "basegeek-rotation",
  "messages": [{"role": "user", "content": "What's the weather in Paris?"}],
  "tools": [{
    "type": "function",
    "function": {
      "name": "get_weather",
      "description": "Get current weather for a location",
      "parameters": {
        "type": "object",
        "properties": {"location": {"type": "string"}},
        "required": ["location"]
      }
    }
  }],
  "tool_choice": "auto"
}
```

Response (when the model invokes a tool):
```json
{
  "choices": [{
    "index": 0,
    "message": {
      "role": "assistant",
      "content": null,
      "tool_calls": [{
        "id": "toolu_abc123",
        "type": "function",
        "function": {
          "name": "get_weather",
          "arguments": "{\"location\":\"Paris\"}"
        }
      }]
    },
    "logprobs": null,
    "finish_reason": "tool_calls"
  }]
}
```

### The second half of the loop

Feeding a tool result back — the turn every agent framework runs — works on all
three native providers:

```json
"messages": [
  {"role": "user", "content": "What's the weather in Paris?"},
  {"role": "assistant", "content": null, "tool_calls": [{"id": "call_1", "type": "function",
    "function": {"name": "get_weather", "arguments": "{\"location\":\"Paris\"}"}}]},
  {"role": "tool", "tool_call_id": "call_1", "content": "{\"tempC\":18}"}
]
```

- **Anthropic** — the assistant turn becomes `tool_use` content blocks and the
  tool turn becomes a user turn holding `{type:"tool_result", tool_use_id}`.
  Consecutive tool results merge into one user turn, as the Messages API wants.
- **Gemini** — `functionCall` parts on a `model` turn, `functionResponse` parts
  on a `user` turn. Gemini keys a response by function *name* rather than by an
  id, so `tool_call_id` is resolved back to a name from the assistant turn that
  issued it.
- **Groq** — no translation needed; its API is OpenAI-shaped, so the
  conversation goes on the wire as written.

## Explicit provider/model pinning

Prepend `<provider>/` to the model string to bypass rotation and pin to a
specific provider/model. Useful when callers need deterministic output from one
provider (e.g., per-PR consistency in a code-review bot).

```json
{
  "model": "anthropic/claude-3-5-sonnet-20241022",
  "messages": [{"role": "user", "content": "..."}]
}
```

Known provider prefixes: `anthropic`, `groq`, `gemini`, `together`, `cohere`,
`openrouter`, `cerebras`, `cloudflare`, `ollama`, `llmgateway`. Model IDs that
naturally contain `/` (e.g. `meta-llama/Llama-3.3-70B-Instruct-Turbo-Free`) are
left untouched because their prefix isn't a provider name.

## Streaming

Set `"stream": true` to receive Server-Sent Events identical to OpenAI's.

- The first chunk carries `delta: {role: "assistant", content: ""}`, which is
  what delta-accumulating clients (LangChain's stream handler, the Vercel AI
  SDK, the Python SDK's `ChatCompletionStreamState`) key off.
- Content chunks carry `delta.content` and `finish_reason: null`; exactly one
  terminal chunk carries `delta: {}` and the real `finish_reason`, and also the
  `x_geeksuite` metadata.
- Streamed `delta.tool_calls[]` entries carry `index`, which is what lets a
  client reassemble fragments into the right call.
- `stream_options: {include_usage: true}` emits one extra chunk before
  `data: [DONE]` with `choices: []` and the full `usage` block.
- A failure that happens **before** the first byte is an ordinary HTTP error
  with the ordinary envelope, not a 200 carrying an error frame — the SDK
  raises `APIError` with a status, as it should.
- When `tools` or `response_format` is active the content is emitted in a
  single chunk instead of 50-char fragments; tool-call JSON and
  schema-conformant content cannot fragment at arbitrary boundaries and stay
  parseable.

> **Streaming here is simulated.** The whole completion is awaited and then
> re-chunked at 50 characters. The frames are spec-shaped and any SSE client
> works, but time-to-first-token equals time-to-last-token — streaming buys a
> nicer-looking spinner, not a faster first word. Real token streaming needs a
> streaming adapter per provider, which is separate work.

## Errors

The envelope is `{"error": {"message", "type", "param", "code"}}`. `param` and
`code` are always present, `null` when there is nothing to name — the spec
requires the keys, and the Python SDK reads `err.param` when raising
`BadRequestError`.

| Status | `type` | `code` | When |
|---|---|---|---|
| 400 | `invalid_request_error` | `missing_messages` / `invalid_tools` / `unsupported_parameter` | bad request body; `param` names the field |
| 401 | `invalid_request_error` | `invalid_api_key` | missing, malformed, unknown or expired key |
| 403 | `permission_error` | `INSUFFICIENT_PERMISSIONS` | key lacks `ai:call` |
| 404 | `invalid_request_error` | `model_not_found` | unknown model id, on both chat and `/models/{id}` |
| 429 | `rate_limit_error` | `rate_limit_exceeded` | key over its quota — carries `Retry-After` |
| 500 | `server_error` | `ai_call_error` | every provider failed |

`Retry-After` matters more than it looks: every official OpenAI SDK's automatic
retry reads that header and, finding none, hands the error straight to the
caller. The value reflects which of the key's three buckets (minute, hour, day)
was hit.

## CORS

The router answers its own preflight ahead of the key gate: `OPTIONS` returns
`204` with `Access-Control-Allow-Origin` echoing the caller's origin,
`Access-Control-Allow-Methods: GET, POST, OPTIONS`, and the requested headers
echoed back. `Access-Control-Expose-Headers` covers `X-Request-Id` and
`Retry-After`.

There is no `Access-Control-Allow-Credentials`: this endpoint authenticates by
API-key header, never by cookie. Worth saying plainly — calling it from a
browser at all means a `bg_` key is sitting in client-side code. The CORS
answer is here so a proxy or a browser extension can work, not as an
endorsement of shipping keys to a page.

`X-Request-Id` is echoed when the caller supplies one, and generated otherwise.

## Caching

Plain-text completions are cached for 30 minutes, keyed on the **whole
conversation** (every message's role, content, `name`, and both halves of a
tool loop), plus provider, model, temperature, namespace, and a fingerprint of
`response_format`/`tools`. It used to be keyed on the last user turn alone,
which meant two different conversations ending in "continue" shared an answer.

Structured (`response_format`) and tool (`tools`) requests bypass the cache
entirely: `instructor`'s retry loop would otherwise hit the cache on its second
attempt and get whatever was wrong with the first.

A caller who needs a fresh answer for an identical prompt can vary the cache
namespace with the `x-cache-namespace` header or a `cache_namespace` body field.

## Environment/config notes
- Configure provider API keys via existing `AIConfig` entries; ensure Groq,
  Cerebras, Together, OpenRouter, Cloudflare, and Ollama credentials are
  populated and enabled.
- The proxy shares the core `aiService` cache/rate tracking. Rotation usage
  persists under `packages/api/logs/rotation-state.json` (ensure writable in
  your deployment).
- `server.js`'s global `cors()` answers preflights from the suite's allowlisted
  origins before this router sees them; the router's own CORS handling covers
  every other origin.

## Testing
Use the OpenAI SDK with a custom base URL:
```bash
OPENAI_BASE_URL="https://localhost:3000/openai/v1" \
OPENAI_API_KEY="bg_..." \
node test-openai-client.mjs
```

The SDK works without code changes beyond the base URL and API key. For the
contract itself:

```bash
cd apps/basegeek/packages/api
pnpm test -- openaiCompat
```
