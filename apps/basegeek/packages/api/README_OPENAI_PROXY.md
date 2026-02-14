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

## Streaming
Set `"stream": true` to receive Server-Sent Events identical to OpenAI. Each chunk includes `choices[0].delta.content`. The final event signals finish and includes `provider` metadata.

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
