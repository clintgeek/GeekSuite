# OpenAI-Compatible Proxy for baseGeek aiGeek

The baseGeek API now exposes an OpenAI-compatible interface with automatic provider rotation aligned with the “Keep Me Coding” plan. Use this endpoint to drop-in replace OpenAI SDK calls while transparently cycling through free-tier providers based on quota.

## Endpoint

```
POST https://<your-basegeek-host>/openai/v1/chat/completions
model: basegeek-rotation (alias that triggers autoswitching)
```

## Authentication
- Requires a valid baseGeek API key (`bg_...`) with the `ai:call` permission.
- Pass the key via `Authorization: Bearer bg_...` or `x-api-key: bg_...`.
- Keys are generated via existing baseGeek key management tools.

## Provider rotation strategy
Rotation priority: Groq → Cerebras → Together.ai → OpenRouter → Cloudflare → Ollama Cloud.
The service monitors soft quotas (RPM, TPM, daily totals) and automatically cools providers for ~60s after a 429/limit response. Usage is persisted in `packages/api/logs/rotation-state.json`.

## Request body (OpenAI format)
```json
{
  "model": "basegeek-rotation",  // triggers autoswitching; override to force a specific backend
  "messages": [                    // required
    {"role": "system", "content": "You are a helpful coding assistant."},
    {"role": "user", "content": "Help me debug this React hook."}
  ],
  "temperature": 0.2,
  "max_tokens": 800,
  "stream": false
}
```

The proxy will:
1. Authenticate the API key.
2. Choose the best provider per rotation (honoring remaining quota and cooldown state).
3. Forward the chat completion request using that provider’s OpenAI-compatible API.
4. Return an OpenAI-style response. `response.provider` surfaces which backend handled the call.

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
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 220,
    "completion_tokens": 150,
    "total_tokens": 370
  },
  "provider": {
    "provider": "groq",
    "model": "qwen-2.5-coder-32b",
    "cached": false
  }
}
```

## Structured output (`response_format`)

Both the OpenAI-style `response_format: {type: "json_object"}` and
`response_format: {type: "json_schema", json_schema: {...}}` parameters work
transparently across every provider in the rotation:

- **Anthropic**: translated to tool-use forced-choice (for schemas) or
  system prompt + assistant prefill (for `json_object`).
- **Gemini**: maps to `generationConfig.responseMimeType` +
  `responseSchema`.
- **Everything else (Groq, Cerebras, Together, OpenRouter, Cloudflare,
  Ollama, LLM7, LLM Gateway)**: prompt-injection fallback — the system
  message is wrapped with an instruction to emit schema-conformant JSON,
  and the response goes through a JSON extractor (strips ```json fences,
  pulls the first balanced JSON object) before reaching the client.

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
calling. Other providers are capability-skipped by the rotation (no
fallback — tool-call responses require machine-parseable tool_calls
structure, not coerced text).

Currently native: **Anthropic** (all Claude models), **Gemini**
(1.5-flash/pro, and compatible), **Groq** (llama-3.3-70b-versatile,
llama-3.1-70b-versatile, meta-llama/llama-4-*, gpt-oss-*, and other
models listed in `TOOL_CALLING_CORRECTIONS`).

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
    "finish_reason": "tool_calls"
  }]
}
```

## Explicit provider/model pinning

Prepend `<provider>/` to the model string to bypass rotation and pin to a
specific provider/model. Useful when callers need deterministic output
from one provider (e.g., per-PR consistency in a code-review bot).

```json
{
  "model": "anthropic/claude-3-5-sonnet-20241022",
  "messages": [{"role": "user", "content": "..."}]
}
```

Known provider prefixes: `anthropic`, `groq`, `gemini`, `together`,
`cohere`, `openrouter`, `cerebras`, `cloudflare`, `ollama`, `llm7`,
`llmgateway`, `onemin`. Model IDs that naturally contain `/` (e.g.,
`meta-llama/Llama-3.3-70B-Instruct-Turbo-Free`) are left untouched
because their prefix isn't a provider name.

## Streaming
Set `"stream": true` to receive Server-Sent Events identical to OpenAI. Each chunk includes `choices[0].delta.content`. The final event signals finish and includes `provider` metadata.

When `tools` or `response_format` is active, the content is emitted in a
single chunk instead of 50-char fragments — tool-call JSON and
schema-conformant content can't fragment at arbitrary boundaries and
remain parseable.

## Environment/config notes
- Configure provider API keys via existing `AIConfig` entries; ensure Groq, Cerebras, Together, OpenRouter, Cloudflare, and Ollama credentials are populated and enabled.
- The proxy shares the core `aiService` cache/rate tracking. Rotation usage persists under `packages/api/logs/rotation-state.json` (ensure writable in your deployment).
- baseGeek CORS already permits backend localhost origins; extend if exposing externally.

## Testing
Use the OpenAI SDK with a custom base URL:
```bash
OPENAI_BASE_URL="https://localhost:3000/openai/v1" \
OPENAI_API_KEY="bg_..." \
node test-openai-client.mjs
```

The SDK should work without code changes beyond the base URL and API key.
