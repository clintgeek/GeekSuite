# aiGeek OpenAI-Compatibility Audit

**Date:** 2026-09-05
**Scope:** `POST /openai/v1/chat/completions`, `GET /openai/v1/models[/{id}]`
(`packages/api/src/routes/openaiProxy.js`, mounted at `server.js:169`), the
service beneath it (`services/aiService.js`,
`services/aiModelCapabilitiesService.js`), the key gate
(`middleware/apiKeyAuth.js`), and the legacy second endpoint at
`/api/ai/v1/chat/completions` (`routes/aiRoutes.js:1391`).
**Executable evidence:** `packages/api/src/__tests__/openaiCompat.test.js`
— 72 cases, 50 asserting conformance we have, 22 marked `it.failing` and
carrying a finding id from this document.
**Method:** read-only. No source file was modified for this audit.

> **The tree was mid-edit while this was written.** Two other agents were
> working in `routes/`, `services/` and the UI. `openaiProxy.js`,
> `aiRoutes.js`, `server.js`, `apiKeyAuth.js` and `aiService.js` all carry
> uncommitted changes; `lib/logger.js` was moved onto a new `@geeksuite/logger`
> workspace package partway through, which broke every Jest suite in the API
> until the link was created. Line numbers below were re-checked against the
> working tree at the end of the audit and may drift again. The findings
> themselves were re-verified after those edits: the conformance suite still
> reports all 22 as open.

---

## What the contract was checked against

`platform.openai.com/docs/api-reference` answers automated fetches with HTTP
403, so this audit was written against OpenAI's own machine-readable spec —
the document the docs site renders and from which the official SDKs are
generated:

| Reference | Retrieved | Used for |
|---|---|---|
| `https://raw.githubusercontent.com/openai/openai-openapi/master/openapi.yaml` — openapi 3.1.0, `info.version` **2.3.0** | 2026-09-05 | `CreateChatCompletionRequest`, `CreateChatCompletionResponse`, `CreateChatCompletionStreamResponse`, `ChatCompletionStreamOptions`, `CompletionUsage`, `Error`, `Model` / `ListModelsResponse` |
| `https://platform.claude.com/docs/en/api/messages` (`docs.anthropic.com/en/api/messages` 301s here) | 2026-09-05 | The Anthropic Messages API shape in the last section |
| `https://platform.openai.com/docs/api-reference/{chat,chat/streaming,models,errors}` | 2026-09-05 | **403 Forbidden — not readable.** Substituted by the spec above, which is the same contract in machine-readable form. |

The `openai` npm SDK is not installed anywhere under this repo
(`find . -name openai -path '*node_modules*'` → nothing) and the audit was not
permitted to add it, so the conformance suite issues requests with `supertest`
using the exact body and header shapes the SDK puts on the wire
(`Authorization: Bearer`, `User-Agent: OpenAI/JS …`, `X-Stainless-Lang`,
`stream_options`, `max_completion_tokens`, …).

---

## The short answer

**It is OpenAI-*shaped*, not OpenAI-compatible.** The envelope is right, the
aliases and the rotation are a genuinely good idea, and the structured-output
work from `AIGEEK_POLISH.md` really did land. But a request is not a shape: of
the twelve `CreateChatCompletionRequest` parameters a normal client sends,
**five are accepted at the door and never reach a provider**, tool calling is
advertised on a provider that never puts `tools` on the wire, the response text
is rewritten in transit, and a model id the proxy doesn't recognise — including
the `gpt-4o-mini` that LangChain, Continue and half of Stack Overflow default
to — becomes a 500.

None of that is loud. Every one of those failures is silent: HTTP 200, a
well-formed body, the wrong answer.

---

## Compatibility matrix

| Feature | Verdict | Test |
|---|---|---|
| `chat.completion` envelope (`id` `chatcmpl-*`, `object`, `created`, `model`) | **pass** | `returns id/object/created/model and a well-formed choices[0]` |
| `choices[].index / message.role / message.content / finish_reason` | **pass** | same |
| `choices[].logprobs` (spec-required key, nullable) | **fail** F-11 | `F-11: choices[] carries the spec-required logprobs key` |
| `usage.prompt_tokens / completion_tokens / total_tokens` | **pass** (locally estimated, not provider-reported) | `returns a usage block whose totals add up` |
| `system_fingerprint` | not offered (optional + deprecated in spec) | — |
| Assistant content returned verbatim | **fail** F-01 | `F-01: assistant content is returned verbatim` |
| SSE transport, `chat.completion.chunk`, stable `id`/`created`, `data: [DONE]` | **pass** | `streams text/event-stream chunks terminated by data: [DONE]` |
| `finish_reason` null on content chunks, set once on the last | **pass** | `sets finish_reason on exactly one terminal chunk` |
| First chunk carries `delta.role` | **fail** F-05 | `F-05: the first streamed chunk carries delta.role` |
| `stream_options: {include_usage:true}` usage chunk | **not offered** F-06 | `F-06: stream_options {include_usage:true} emits a usage-only final chunk` |
| Streaming errors as an HTTP status | **fail** F-07 (always 200 + an error frame) | `F-07: an upstream failure before the first chunk is an HTTP error status` |
| Real token-by-token streaming | **partial** F-21 (buffered, then re-chunked at 50 chars) | see notes |
| `messages[]` preserved end to end (multi-turn, `system`, `name`) | **pass** at the transport | `the route hands aiService the whole array`; `callAI dispatches the messages array unflattened` |
| Conversation history in the cache key | **fail** F-03 | `F-03: two conversations sharing a last user turn get different answers` |
| `tools` / `tool_choice` accepted and forwarded | **pass** (all four `tool_choice` forms) | `passes tools and tool_choice %j through to the service` |
| `tools` reach Anthropic natively | **pass** | `callClaude translates OpenAI tools and every tool_choice form` |
| `tools` reach Groq (advertised as native) | **fail** F-04 | `F-04: callGroq forwards tools that the capability matrix says it supports` |
| `message.tool_calls[]` shape, `arguments` as a JSON string, `finish_reason: tool_calls` | **pass** | `returns OpenAI-shaped tool_calls with arguments as a JSON string` |
| `role:"tool"` follow-up turn accepted by the route | **pass** | `accepts a follow-up turn with role:"tool" and tool_call_id` |
| `role:"tool"` follow-up turn survives to the provider | **fail** F-02 | `F-02: callClaude round-trips an assistant tool_calls turn and its tool result` |
| Streaming `delta.tool_calls[].index` | **fail** F-08 | `F-08: streamed delta.tool_calls entries carry an index` |
| Tool-incapable providers skipped by rotation, not failed | **pass** | `rotation skips a tool-incapable provider` |
| `response_format: json_object` / `json_schema` accepted | **pass** | `passes response_format %j to the service` |
| Native pass-through where supported (anthropic, gemini) | **pass** | `reaches a natively capable provider unchanged` |
| Prompt-injection fallback + JSON repair elsewhere | **pass** | `falls back to prompt injection on an incapable provider` |
| Cache key segregates response formats | **pass** (moot — structured requests bypass the cache) | `the cache key separates identical prompts`; `structured and tool requests bypass the cache entirely` |
| `temperature`, `max_tokens` | **pass** | `temperature and max_tokens reach the provider` |
| `top_p` | **fail** F-09 | `F-09: top_p reaches the provider` |
| `stop` (string and array) | **fail** F-09 | `F-09: stop (string form)…`, `…(array form)…` |
| `seed` | **fail** F-09 | `F-09: seed reaches the provider` |
| `presence_penalty` / `frequency_penalty` | **fail** F-09 | `F-09: presence_penalty and frequency_penalty reach the provider` |
| `max_completion_tokens` | **not offered** F-10 | `F-10: max_completion_tokens is honoured as an alias for max_tokens` |
| `n > 1` rejected with the OpenAI envelope | **pass** (documented out of scope) | `rejects n > 1 with the OpenAI error envelope` |
| `logit_bias`, `logprobs`, `top_logprobs`, `store`, `metadata`, `service_tier`, `parallel_tool_calls` ignored gracefully | **pass** | `ignores logit_bias / logprobs / top_logprobs rather than 500ing` |
| `user` accepted | **partial** F-14 (used as the quota subject) | `accepts the "user" end-user identifier` |
| Error envelope `{error:{message,type,param,code}}` | **fail** F-12 (`param` never emitted; `code` dropped when null) | `F-12: a 400 carries the spec-required param and code keys` |
| 401 `invalid_api_key` | **fail** F-13 (`authentication_error` / `INVALID_API_KEY`) | `F-13: an invalid key reports code invalid_api_key` |
| 400 `invalid_request_error` | **pass** | `400 for a missing messages array` |
| 403 for a key without `ai:call` | **pass** | `403 when the key lacks ai:call` |
| 404 `model_not_found` on `/models/{id}` | **pass** | `GET /v1/models/{unknown} is a 404 model_not_found` |
| 404 `model_not_found` on chat/completions | **fail** F-16 (unknown model → 500) | `F-16: an unknown model id is a 404 model_not_found` |
| 429 with `Retry-After` and `rate_limit_exceeded` | **fail** F-15 | `F-15: a 429 carries Retry-After and code rate_limit_exceeded` |
| 5xx envelope on total provider failure | **pass** | `500 with the envelope when every provider fails` |
| `GET /v1/models` list shape | **pass** | `returns {object:"list", data:[Model]}` |
| `GET /v1/models/{id}` | **pass** | two cases |
| `Authorization: Bearer` and `x-api-key` | **pass** | two cases |
| `OpenAI-Organization` / `-Project` / `-Beta` ignored | **pass** | `ignores OpenAI-Organization, OpenAI-Project and OpenAI-Beta` |
| `X-Request-Id` on responses, caller-supplied id echoed | **pass** | two cases |
| CORS preflight | **fail** F-17 (the key gate answers `OPTIONS`) | `F-17: a CORS preflight is answered before the API-key gate` |
| `basegeek-rotation` / `basegeek-free` aliases | **pass** | two cases |
| `basegeek-app` alias | **partial** F-18 (echoes `basegeek-rotation` back) | `F-18: basegeek-app echoes the model the caller actually asked for` |
| `<provider>/<model>` pinning; slashy model ids left alone | **pass** | two cases |
| `provider` metadata on the response (README promises it) | **fail** F-20 (never emitted) | see notes |
| One endpoint per contract | **fail** F-19 (a second, worse one at `/api/ai/v1`) | `F-19: only one endpoint in this service claims OpenAI compatibility` |
| **Anthropic Messages API (`/v1/messages`)** | **not offered** | `is not offered at /openai/v1/messages` |

---

## Top findings, ranked by how many real clients they break

### 1. F-09 — five sampling parameters are accepted and silently dropped

`openaiProxy.js:258-265` carefully copies `top_p`, `stop`, `presence_penalty`,
`frequency_penalty` and `seed` into the call config. `aiService.callAI` never
destructures any of them (`aiService.js:1335-1351`), and `callProvider` builds
its downstream config from a fixed whitelist that does not include them
(`aiService.js:1833-1838`). They travel exactly one function call and die.

**Who this breaks:** everyone. `stop` is how a curl user ends a completion at a
delimiter; `top_p` and the penalties are how anyone tunes a summariser; `seed`
is the whole basis of reproducible evaluation, and `instructor`'s retry loop
assumes a `seed` it passes is honoured. A request that asks for `stop: ["\n\n"]`
gets a wall of text back with HTTP 200 and no indication anything was ignored.

**Fix:** add the five to the `callAI` destructure and to the `callConfig` object
at `aiService.js:1838`, then map them per provider — trivial for the
OpenAI-compatible ones (`callGroq`, `callCerebras`, `callTogether`,
`callOpenRouter`, `callLLMGateway`, `callOllama` — same field names), a small
translation for `callClaude` (`stop` → `stop_sequences`, no penalties, no seed)
and `callGemini` (`generationConfig.topP`, `.stopSequences`).
**Size:** ~40 lines, one afternoon. Flip six `it.failing` to `it`.

---

### 2. F-16 — an unrecognised model id is a 500, not a `model_not_found`

`openaiProxy.js:208-211` treats any model string that is not one of the three
`basegeek-*` aliases as an explicit pin, and hands it to whichever provider
happens to be `aiService.currentProvider` (`:268-270`). `gpt-4o-mini` is not a
Groq model, so the upstream 404 surfaces as a generic
`{type:"server_error", code:"ai_call_error"}` 500.

**Who this breaks:** first contact with almost every third-party client.
LangChain's `ChatOpenAI` defaults to `gpt-4o-mini`. Continue and Cursor-style
tools ship a `gpt-4o` default in their config templates. Every curl example
copied from OpenAI's docs names a `gpt-*` model. A user who follows
`README_OPENAI_PROXY.md`'s "point `OPENAI_BASE_URL` here" instruction without
also changing the model gets a 500 with no hint of what's wrong.

**Fix:** validate the model before dispatch. If the string has no known provider
prefix and matches no id in the catalog, either (a) return
`404 {code:"model_not_found"}` naming the three aliases in the message, or
(b) — friendlier, and closer to what the rotation is *for* — treat unknown ids
as `basegeek-rotation` and say so in the echoed `model`. Option (b) makes the
"drop-in replacement" claim literally true.
**Size:** ~25 lines in `openaiProxy.js`, plus a decision from Chef on (a) vs (b).

---

### 3. F-04 + F-02 — tool calling is advertised more widely than it is implemented, and the loop cannot complete

Two halves of one problem.

**F-04, the wrong provider gets picked.** `TOOL_CALLING_CORRECTIONS`
(`aiModelCapabilitiesService.js:33-46`) marks twelve Groq models tool-capable,
and `README_OPENAI_PROXY.md` and `AIGEEK_USAGE.md` both name Groq as natively
supported. The rotation's capability gate (`aiService.js:1579-1583`) therefore
happily routes a `tools` request to Groq — and `callGroq`
(`aiService.js:2167-2179`) destructures `{maxTokens, temperature, model,
messages}` and never puts `tools` on the wire. The caller gets prose and
`finish_reason: "stop"` where the contract promised `tool_calls`. Only
`callClaude` and `callGemini` implement `tools` at all.

**F-02, the second turn is lost.** `callClaude` maps every non-system turn with
`{role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content ?? ''}`
(`aiService.js:2019-2030`). An assistant turn carrying `tool_calls` becomes an
assistant turn with empty content (which Anthropic rejects outright), and the
`role:"tool"` result becomes a `user` turn with its `tool_call_id` discarded. So
the first tool call works and the turn that feeds the result back does not.
`callGemini` (`aiService.js:2207+`) collapses roles the same way.

**Who this breaks:** every agent framework — LangChain agents, `instructor`'s
function-calling mode, OpenAI's own `runTools` helper, any Cursor/Continue tool
use. Note this is the exact case `AIGEEK_POLISH.md` was written to unblock for
geekPR.

**Fix:** (a) shrink `TOOL_CALLING_CORRECTIONS` to providers whose `call*()`
actually forwards `tools`, *or* forward `tools`/`tool_choice` in `callGroq` and
the other OpenAI-compatible providers (they take the parameter verbatim — this
is a five-line change per provider plus a `tool_calls` reader on the response).
(b) In `callClaude`/`callGemini`, translate `assistant.tool_calls[]` into
`tool_use` content blocks and `role:"tool"` into a `tool_result` block keyed by
`tool_use_id`.
**Size:** (a) ~30 lines and a test; (b) ~60 lines and the fiddliest work in this
document. Do (a) first — it is the one that is actively lying.

---

### 4. F-01 — the proxy rewrites the model's answer

`openaiProxy.js:361` (and `:280` on the streaming path) runs every completion
through `formatResponse` (`utils/responseFormatter.js:186`), which was written
for CodeGeek's XML tool UI. `convertFunctionCallToXML`
(`responseFormatter.js:88`) scans the text for `word(args)` where `word` is in a
25-entry list — `grep`, `web_search`, `list_dir`, `read_file`, `todo_write`,
`execute_command`, … — rewrites each into XML, and prepends invented prose.

The suite's evidence: `Use grep("needle") to find it, then list_dir("/src") to
browse.` comes back as

```
Use I'll search for that pattern in the codebase.

<grep>
<path>needle</path>
</grep> to find it, then Let me check what's in that directory.
…
```

**Who this breaks:** the proxy's primary audience. A coding assistant's answers
are full of `grep(...)` and `read_file(...)`. Worse, this runs *after* the JSON
repair pass, so a `response_format` payload containing such a substring inside a
string value is corrupted into unparseable output. And every word of it arrives
as HTTP 200.

**Fix:** delete the call from `openaiProxy.js`. The OpenAI surface has no
business applying a CodeGeek UI transform; whoever needs it can call it at the
CodeGeek client. If it has to stay, gate it behind an explicit opt-in
(`x-basegeek-format: codegeek-xml`).
**Size:** one line to remove, plus checking whether CodeGeek is calling through
this endpoint rather than `/api/ai/call`.

---

### 5. F-03 — the response cache ignores the conversation

`openaiProxy.js:205-206` reduces the request to the **last user message** for
routing, and `aiService.getCacheKey` (`aiService.js:742-752`) hashes that
string. The proxy's cache-namespace hash (`openaiProxy.js:235-245`) hashes the
same string again, so it adds nothing. Earlier turns never enter the key.

Two different conversations whose last user turn is `"continue"` — or `"why?"`,
`"go on"`, `"summarise that"`, `"fix it"` — collide, and the second caller is
served the first caller's answer for up to 30 minutes. Across a shared baseGeek
that means one app's completion answered from another app's conversation.

**Who this breaks:** every multi-turn chat client, which is all of them. It is
also a small cross-tenant information leak, since the cache is process-global
and keyed only on prompt/provider/model/temperature/namespace.

**Fix:** hash the whole normalized `messages` array into the cache key rather
than the routing prompt (`aiService.js:1472-1478` already computes a full
`basePrompt` from the messages when `prompt` is empty — use that unconditionally
for the key). Nothing else needs to change; the structured fingerprint work from
`AIGEEK_POLISH` item 2 already sits alongside it.
**Size:** ~5 lines. The cheapest large win in this document.

*(Honourable mentions just off the list: **F-07**, every streaming failure
arriving as a 200 with an error frame the SDK cannot classify as an error;
**F-15**, a 429 with no `Retry-After`, which disables the automatic retry in
every official SDK; **F-05/F-06/F-08**, the streaming delta details that break
delta-accumulating clients and every usage meter built on `include_usage`.)*

---

## What `AIGEEK_POLISH.md` planned vs what is actually there

The plan file still says **"Status: Planning — work not yet started."** That is
stale: most of it shipped. Item by item.

| # | Plan item | Reality |
|---|---|---|
| 1 | Capability matrix (`supportsJSONMode/JSONSchema/ToolCalling`) | **Landed.** `aiModelCapabilitiesService.js:21-60`, `:1301-1313`. Tested in `aiModelCapabilities.test.js`. But it over-claims: twelve Groq models are marked tool-capable with no implementation behind them → **F-04**. |
| 2 | Cache key includes `response_format` + `tools` | **Landed** (`structuredOutputFingerprint`, `aiService.js:754-766`) **and then made moot** — `aiService.js:1529` now bypasses the cache entirely for structured and tool requests. The plan diagnosed a real cache bug at the wrong altitude: the damaging collision is history-blindness, which the plan never mentions → **F-03**. |
| 3 | Preserve the messages array end to end | **Landed at the transport.** Proxy → `callAI` → `callProvider` → provider all carry the array, and `name` survives. **Not landed at the provider translations**: `callClaude` and `callGemini` still collapse every non-assistant role to `user` → **F-02**. |
| 4 | `response_format` native pass-through | **Landed** for Anthropic (tool-forcing / assistant prefill, `aiService.js:2049-2059`) and Gemini (`responseMimeType` + `responseSchema`). |
| 5 | Prompt-injection fallback | **Landed.** `wrapMessagesForStructuredFallback` + `repairJSONContent`, tested in `aiServiceHelpers.test.js`. Solid work. |
| 6 | `tools` / `tool_choice` native | **Partially landed.** Real in `callClaude` and `callGemini`, including all four `tool_choice` forms. Absent everywhere else while the matrix says otherwise → **F-04**. |
| 7 | Explicit `<provider>/<model>` pinning | **Landed** (`aiService.js:1360-1372`), including the "don't split `meta-llama/…`" rule. Now covered by tests. |
| 8 | Streaming correctness with structured output | **Landed** — single-chunk emission when `tools` or `response_format` is active (`openaiProxy.js:294-318`). |
| 9 | Tests | **Half landed.** The two unit files exist (`aiServiceHelpers.test.js`, `aiModelCapabilities.test.js`) and cover the fingerprint, the repair and the matrix. The plan's other three cases — rotation skipping incapable providers, fallback producing schema-valid JSON end to end, explicit pinning — had **no test until this audit**. Nothing tested the HTTP contract at all. |
| 10 | Docs | **Landed** — `README_OPENAI_PROXY.md` rewritten, `AIGEEK_USAGE.md` written, `AI_CATALOG.md` updated. Two claims in them are not true of the code: Groq native tool calling (**F-04**), and `response.provider` / streaming provider metadata (**F-20** — `openaiProxy.js:398-415` emits no `provider` key, and the final SSE chunk carries none either, though `README_OPENAI_PROXY.md` shows both). |

The plan's "explicitly out of scope" list mostly held: `n > 1` is still rejected,
no embeddings, no vision, rotation state still file-backed. One exception —
"streaming tool calls (complex; geekPR doesn't need it)" was half-implemented
anyway (`openaiProxy.js:294-308`), and the half that shipped is missing the
`index` field that makes it usable → **F-08**.

---

## Additional notes

- **F-19 — two endpoints, one contract.** `routes/aiRoutes.js:1391-1477` is a
  second, much older "OpenAI-compatible" endpoint at
  `/api/ai/v1/chat/completions`. It flattens `messages` into a single
  `"role: content"` string (`:1424-1429`), accepts `stream` and ignores it,
  supports no `tools` or `response_format`, and uses `provider:model` rather
  than `provider/model` for pinning. It is not documented in either aiGeek doc.
  Anyone who finds it will conclude aiGeek is far less compatible than it is.
  Recommend deleting it or 308-redirecting it to `/openai/v1`.
- **F-21 — streaming is simulated.** `openaiProxy.js:279` awaits the *entire*
  completion, then re-chunks it at 50 characters. The frames are spec-shaped and
  a client works fine, but time-to-first-token equals time-to-last-token, so
  streaming buys the caller nothing but a nicer-looking spinner. Worth saying out
  loud in the docs, since "streaming works" implies otherwise.
- **F-14 — `user` is treated as an account.** OpenAI's `user` is an opaque
  abuse-monitoring tag for their trust-and-safety pipeline, not an identity the
  API resolves. `openaiProxy.js:174-189` reads it as `bodyUserId` and resolves
  `caller.userId ?? bodyUserId` into `callConfig.userId`, which
  `aiService.js:1554` then uses as the *quota subject* for
  `checkIfModelAvailable`. So a client that dutifully sends a per-end-user id
  can have providers skipped for reasons it has no way to see. (This is the one
  finding the concurrent caller-identity work has already moved — the
  attribution is now deliberate rather than accidental; what remains is that an
  opaque tag still gates provider selection.)
- **F-17 — preflight.** `openaiProxy.js:90` mounts the key gate with
  `router.use`, which runs on `OPTIONS` too. In production the global `cors()`
  at `server.js:119-143` answers preflights from allowlisted origins before the
  router sees them — but a browser client from any other origin gets a `401`
  (and a disallowed origin gets a *500*, by the deliberate design noted at
  `server.js:100-116`). Server-side callers are unaffected; browser callers
  outside the suite cannot use this endpoint at all.
- **The cache is on by default for plain completions**, 30-minute TTL, keyed
  without `max_tokens` or the messages history. Combined with F-03 this means a
  caller at `temperature: 1` asking the same question twice gets the identical
  answer — surprising for anyone who knows OpenAI's semantics. Consider honouring
  `store: false` or a `x-basegeek-cache: bypass` header.

---

## Should aiGeek also offer the Anthropic Messages shape?

**Today:** not offered, and nothing claims it. `POST /openai/v1/messages` is a
plain 404; no route anywhere in the API exposes `/v1/messages`; neither
`README_OPENAI_PROXY.md` nor `AIGEEK_USAGE.md` mentions it. (Anthropic *is* a
provider behind the rotation — `callClaude` speaks the Messages API upstream —
but that is the back of the proxy, not the front.)

**Recommendation: not yet — and the reason matters.** The Messages surface is
cheap to build: the internal model already has everything it needs. `callClaude`
already constructs `{model, max_tokens, system, messages, tools, tool_choice}`
and reads back `content` blocks, `stop_reason` and `usage.input_tokens`; the
adapter would be a request translation (`system` out of `messages`,
`stop_sequences`, `input_schema`) and a response translation (`content: [{type:
"text"}]`, `stop_reason: end_turn|tool_use|max_tokens`,
`usage.{input,output}_tokens`). Perhaps 200 lines, mostly mechanical, with the
SSE event grammar (`message_start` / `content_block_delta` / `message_delta` /
`message_stop`) as the only genuinely new work.

But a second front door inherits every finding above — the dropped sampling
parameters, the history-blind cache, the rewritten content, the broken tool
loop — and adds a second place for them to drift. **F-19 is the cautionary
tale:** this service already carries two endpoints claiming one contract, and
the second one rotted precisely because nobody tested it.

So: fix F-01, F-03, F-04, F-09 and F-16 first, get the OpenAI surface to the
point where the suite's `it.failing` count is near zero, and *then* build
`/anthropic/v1/messages` on top of a service that is actually honest. At that
point it is a weekend, it opens the door to the Claude SDKs and to
`ANTHROPIC_BASE_URL`-style tooling, and the audit for it is this file with the
nouns changed.

---

## Running the evidence

```bash
cd apps/basegeek/packages/api
pnpm test src/__tests__/openaiCompat.test.js
```

72 tests, all green. The 22 `it.failing` cases are the findings: Jest passes a
`failing` test whose body throws, and **fails the run the moment the body starts
passing**. So the day someone closes a gap, the suite says so and asks for the
test to be promoted to `it`. Each carries its finding id in the title and the
spec citation in a comment above it.
