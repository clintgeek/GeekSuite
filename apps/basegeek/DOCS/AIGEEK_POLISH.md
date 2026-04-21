# aiGeek Polish — OpenAI Compatibility + Tool Calling

**Status:** Planning — work not yet started
**Branch target:** `feat/aigeek-polish` (off `main`, after parking CI/CD docs on `ci-cd`)
**Driver:** Needed before geekPR (portfolio project) can use aiGeek as its LLM backend. Also upgrades aiGeek itself to be a more capable OpenAI-compatible proxy for the whole suite.

## The short version

aiGeek is the AI subsystem inside basegeek. It already does a clever thing: round-robins free-tier providers (Groq, Cerebras, Together, OpenRouter, Cloudflare, Ollama Cloud, LLM Gateway) with per-provider quota tracking and cooling, so GeekSuite apps get "keep me coding" inference for free. It exposes an OpenAI-compatible endpoint at `POST /openai/v1/chat/completions`.

What works today:
- Chat completions (messages → choices[0].message.content)
- Provider rotation via `model: "basegeek-rotation"` or `"basegeek-free"`
- Bearer-token auth (`bg_...` keys) with `ai:call` permission
- Streaming (SSE)
- `/api/ai/config` UI for per-user Anthropic/Gemini keys (encrypted via cryptoVault)

What's broken or missing:
- `response_format` — accepted and silently dropped
- `tools` / `tool_choice` — not accepted at all
- Specific `provider/model` pin — partially supported via explicit model names but not documented/clean
- Cache key (line 1302 of aiService.js) doesn't include structured-output params → identical prompts with different `response_format` would collide
- Message flattening (line 1257) collapses the full messages array into a prompt string before dispatch → breaks multi-turn tool use
- No capability matrix — nothing tells the rotation "skip Groq for this request, it can't do tool calling"

## Design goals

1. **Truly OpenAI-compatible.** Drop-in for OpenAI SDK callers, including ones that use `response_format: {type: "json_schema", ...}` or `tools: [...]` (the parameters `instructor`, LangChain, and most modern frameworks require).
2. **Capability-aware rotation.** If a request needs tool calling, skip providers that can't do it — don't let them fail and cool.
3. **Graceful fallback for structured output.** Providers without native JSON-schema support should still produce schema-compliant JSON via prompt-injection + validation, so rotation isn't crippled.
4. **Explicit model pinning.** `model: "anthropic/claude-3-5-sonnet-20241022"` or `model: "groq/llama-3.3-70b-versatile"` should bypass rotation and use that exact provider/model — documented and tested.
5. **Don't break existing callers.** fitnessgeek and other current consumers must continue working unchanged.

## Current aliases (keep)

- `basegeek-rotation` — full auto-rotate, prefer free but fall through to paid
- `basegeek-free` — free tier only
- `basegeek-app` — use per-app server-side routing config
- Specific model name — already works; needs doc + polish

## Work items

Each is a separate commit on `feat/aigeek-polish`.

### 1. Capability matrix
Add `supportsJSONMode`, `supportsJSONSchema`, `supportsToolCalling` flags to `aiModelCapabilitiesService.js` per provider/model. Source of truth for rotation filtering.

### 2. Cache key fix
Include `response_format` fingerprint and `tools` signature in `getCacheKey()` so structured requests don't serve stale plain responses.

### 3. Preserve messages array end-to-end
Stop flattening `messages` to a single prompt string in `aiService.callAI()` when the provider can consume the array natively. Each `call*()` method picks array or flat. Critical for tool use (assistant → tool_call → tool_result → assistant loop).

### 4. `response_format` pass-through (native providers)
Forward `response_format` to Anthropic and Gemini natively. Capability-check before dispatch; if no rotation candidate supports it, fall through to item 5.

### 5. Prompt-injection fallback for `response_format`
For requests with `response_format: json_schema` where the selected provider lacks native support, wrap the system message with schema instructions ("respond ONLY with valid JSON matching this schema: ...") and validate/repair the response. Preserves the rotation — every provider can "do" structured output, just with varying fidelity.

### 6. `tools` / `tool_choice` pass-through (native providers only)
Anthropic and Gemini get native function calling. No fallback — tool calling is too complex to fake via prompt injection. Incapable providers get skipped via the capability matrix.

### 7. Explicit provider/model routing
Document and test `model: "<provider>/<model>"` syntax. Bypass rotation entirely. For geekPR, this is the preferred mode — single provider per PR review keeps results consistent.

### 8. Streaming correctness with structured output
When `tools` or `response_format` is active, disable the 50-char hardcoded chunking (aiService.js:274) and buffer the full response before emitting. Tool JSON can't fragment.

### 9. Tests
- Per-provider fixture: structured output round-trips
- Rotation correctness: incapable providers skipped when `tools` is requested
- Fallback correctness: prompt-injection produces schema-valid JSON
- Cache isolation: plain vs structured requests don't collide
- Explicit pinning: `anthropic/claude-*` bypasses rotation

### 10. Docs
- Update `README_OPENAI_PROXY.md` with structured output + tool calling examples
- Update `AI_CATALOG.md` with capability flags per model
- Add `AIGEEK_USAGE.md` with the three modes: rotation, free-only, explicit pin

## Explicitly out of scope

- Streaming tool calls (complex; geekPR doesn't need it)
- `n > 1` parallel completions (already rejected at proxy layer)
- Vision / multimodal inputs
- Embeddings endpoint
- Rotation state moving to Redis (file-backed is fine for current scale)
- Breaking changes to existing consumers (fitnessgeek, etc.)

## How this unblocks geekPR

Once items 1, 2, 3, 4, 6, 7 land, geekPR can:
- Point `OPENAI_BASE_URL` at `https://basegeek.clintgeek.com/openai/v1`
- Use `instructor` library with a Pydantic `RefactorSuggestion` schema
- Pin to a single provider per PR review via `model: "anthropic/claude-3-5-sonnet-20241022"` (or whichever proves best)
- Get clean structured JSON back every time

## Landmines (from inspection pass)

- Rotation state in `logs/rotation-state.json` is per-process and file-backed. Adding params doesn't change that, but if we ever horizontally scale basegeek, it needs to move to Redis.
- Cerebras has prompt-strategy injection in `callCerebras()` that prepends to system message BEFORE our code runs. Prompt-injection fallback (item 5) must respect that, not overwrite.
- AIConfig schema enum validates provider names — if we add new providers later, update the enum or key setting fails silently.

## Next session

Start with item 1 (capability matrix) since everything else filters on it.
