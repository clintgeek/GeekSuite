# aiGeek OpenAI-Compatibility Audit

**Date:** 2026-09-05
**Scope:** `POST /openai/v1/chat/completions`, `GET /openai/v1/models[/{id}]`
(`packages/api/src/routes/openaiProxy.js`, mounted at `server.js:169`), the
service beneath it (`services/aiService.js`,
`services/aiModelCapabilitiesService.js`), the key gate
(`middleware/apiKeyAuth.js`), and the legacy second endpoint at
`/api/ai/v1/chat/completions` (`routes/aiRoutes.js:1391`).
**Executable evidence:** `packages/api/src/__tests__/openaiCompat.test.js`
— 82 cases, **all `it`, none `it.failing`.**
**Method:** read-only. No source file was modified for this audit.

---

> ## Status: all 24 findings closed — 2026-09-05
>
> *(22 from the morning audit; **F-22** and **F-23** were added by the
> cross-stream burn review the same evening — see `DOCS/BURN_REVIEW.md` #10 and
> #11 — and closed with it. Both are the same shape as the originals: silent,
> HTTP 200 or a helpful-looking error, and wrong.)*
>
> The audit was written in the morning and worked through the same day. Every
> `it.failing` case in the conformance suite has been promoted to `it`; the
> suite is 82 green with no findings outstanding. The verdict column below is
> the *post-fix* state, with the original verdict kept in parentheses so the
> record of what was wrong survives — the narrative sections further down are
> deliberately unedited except for a one-line resolution on each finding.
>
> Two findings were closed by a decision rather than only by code:
>
> - **F-16** took option (a): an unknown model id is a `404 model_not_found`
>   whose message names the `basegeek-*` aliases and the `<provider>/<model>`
>   form. Option (b) — silently rerouting to the rotation — would have made
>   the "drop-in replacement" claim literally true at the cost of answering a
>   question the caller did not ask.
> - **F-22** extends F-16's decision to the pinned form: a `<provider>/<model>`
>   pin whose model that provider does not serve is the same 404, and a request
>   that names a concrete model does not fall back to another provider. The
>   alternative — keep answering, from whatever is up — is what the
>   `basegeek-*` aliases are *for*, and a caller who wanted that would have
>   asked for it.
> - **F-23** answers upstream failures from a seven-entry allowlist of aiGeek's
>   own messages. The rejected alternative was passing the provider's body
>   through "for debuggability": the caller cannot act on an org id or a quota
>   breakdown that isn't theirs, and an operator has the same body in the log,
>   findable by the request id the response carries.
> - **F-20** ships as `x_geeksuite: {provider, model, cached, app, feature}`
>   rather than the bare `provider` key the docs promised, because the OpenAI
>   response schema has no `provider` field and a strict client is entitled to
>   reject an unknown one. The `x_` namespace is unmistakably an extension.
>
> **F-21** (streaming is simulated) and **F-14** (`user` gates provider
> selection) are the two that are *documented* rather than fixed — both are
> now said out loud in `README_OPENAI_PROXY.md` and `AIGEEK_USAGE.md`. Neither
> ever had a failing test; they were notes, not findings.
>
> The one test rewritten rather than merely promoted is **F-19's**. Its
> original assertion was a source grep for the string `/v1/chat/completions`
> in `aiRoutes.js`, which a 308 alias would still trip. It now asserts the
> property that actually matters: the path still answers (nobody's client
> 404s), it answers `308` to `/openai/v1/chat/completions`, and the file
> registers no `/v1` handler of its own.

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

*(Written 2026-09-05 morning. All twelve of those parameters now reach a
provider, tool calling is advertised only where it is implemented, the response
text is not touched, and an unrecognised model id is a 404 that says what to
send instead. See the status banner above; this paragraph is kept as the
statement of what was wrong.)*

---

## Compatibility matrix

| Feature | Verdict | Test |
|---|---|---|
| `chat.completion` envelope (`id` `chatcmpl-*`, `object`, `created`, `model`) | **pass** | `returns id/object/created/model and a well-formed choices[0]` |
| `choices[].index / message.role / message.content / finish_reason` | **pass** | same |
| `choices[].logprobs` (spec-required key, nullable) | **pass** (was: fail F-11) | `F-11: choices[] carries the spec-required logprobs key` |
| `usage.prompt_tokens / completion_tokens / total_tokens` | **pass** (locally estimated, not provider-reported) | `returns a usage block whose totals add up` |
| `system_fingerprint` | not offered (optional + deprecated in spec) | — |
| Assistant content returned verbatim | **pass** (was: fail F-01) | `F-01: assistant content is returned verbatim` |
| SSE transport, `chat.completion.chunk`, stable `id`/`created`, `data: [DONE]` | **pass** | `streams text/event-stream chunks terminated by data: [DONE]` |
| `finish_reason` null on content chunks, set once on the last | **pass** | `sets finish_reason on exactly one terminal chunk` |
| First chunk carries `delta.role` | **pass** (was: fail F-05) | `F-05: the first streamed chunk carries delta.role` |
| `stream_options: {include_usage:true}` usage chunk | **pass** (was: not offered, F-06) | `F-06: stream_options {include_usage:true} emits a usage-only final chunk` |
| Streaming errors as an HTTP status | **pass** (was: fail F-07 — always 200 + an error frame) | `F-07: an upstream failure before the first chunk is an HTTP error status` |
| Real token-by-token streaming | **partial** F-21 — unchanged, now documented as simulated | see notes |
| `messages[]` preserved end to end (multi-turn, `system`, `name`) | **pass** at the transport | `the route hands aiService the whole array`; `callAI dispatches the messages array unflattened` |
| Conversation history in the cache key | **pass** (was: fail F-03) | `F-03: two conversations sharing a last user turn get different answers` |
| `tools` / `tool_choice` accepted and forwarded | **pass** (all four `tool_choice` forms) | `passes tools and tool_choice %j through to the service` |
| `tools` reach Anthropic natively | **pass** | `callClaude translates OpenAI tools and every tool_choice form` |
| `tools` reach Groq (advertised as native) | **pass** (was: fail F-04) | `F-04: callGroq forwards tools that the capability matrix says it supports` |
| `message.tool_calls[]` shape, `arguments` as a JSON string, `finish_reason: tool_calls` | **pass** | `returns OpenAI-shaped tool_calls with arguments as a JSON string` |
| `role:"tool"` follow-up turn accepted by the route | **pass** | `accepts a follow-up turn with role:"tool" and tool_call_id` |
| `role:"tool"` follow-up turn survives to the provider | **pass** (was: fail F-02) — anthropic + gemini + groq | `F-02: callClaude round-trips an assistant tool_calls turn and its tool result` |
| Streaming `delta.tool_calls[].index` | **pass** (was: fail F-08) | `F-08: streamed delta.tool_calls entries carry an index` |
| Tool-incapable providers skipped by rotation, not failed | **pass** | `rotation skips a tool-incapable provider` |
| `response_format: json_object` / `json_schema` accepted | **pass** | `passes response_format %j to the service` |
| Native pass-through where supported (anthropic, gemini) | **pass** | `reaches a natively capable provider unchanged` |
| Prompt-injection fallback + JSON repair elsewhere | **pass** | `falls back to prompt injection on an incapable provider` |
| Cache key segregates response formats | **pass** (moot — structured requests bypass the cache) | `the cache key separates identical prompts`; `structured and tool requests bypass the cache entirely` |
| `temperature`, `max_tokens` | **pass** | `temperature and max_tokens reach the provider` |
| `top_p` | **pass** (was: fail F-09) | `F-09: top_p reaches the provider` |
| `stop` (string and array) | **pass** (was: fail F-09) | `F-09: stop (string form)…`, `…(array form)…` |
| `seed` | **pass** (was: fail F-09) — dropped at anthropic/gemini, which have no equivalent | `F-09: seed reaches the provider` |
| `presence_penalty` / `frequency_penalty` | **pass** (was: fail F-09) — dropped at anthropic/gemini | `F-09: presence_penalty and frequency_penalty reach the provider` |
| `max_completion_tokens` | **pass** (was: not offered, F-10) | `F-10: max_completion_tokens is honoured as an alias for max_tokens` |
| `n > 1` rejected with the OpenAI envelope | **pass** (documented out of scope) | `rejects n > 1 with the OpenAI error envelope` |
| `logit_bias`, `logprobs`, `top_logprobs`, `store`, `metadata`, `service_tier`, `parallel_tool_calls` ignored gracefully | **pass** | `ignores logit_bias / logprobs / top_logprobs rather than 500ing` |
| `user` accepted | **partial** F-14 — unchanged, now documented | `accepts the "user" end-user identifier` |
| Error envelope `{error:{message,type,param,code}}` | **pass** (was: fail F-12) — both keys always present | `F-12: a 400 carries the spec-required param and code keys` |
| 401 `invalid_api_key` | **pass** (was: fail F-13) | `F-13: an invalid key reports code invalid_api_key` |
| 400 `invalid_request_error` | **pass** | `400 for a missing messages array` |
| 403 for a key without `ai:call` | **pass** | `403 when the key lacks ai:call` |
| 404 `model_not_found` on `/models/{id}` | **pass** | `GET /v1/models/{unknown} is a 404 model_not_found` |
| 404 `model_not_found` on chat/completions | **pass** (was: fail F-16 — unknown model → 500) | `F-16: an unknown model id is a 404 model_not_found` |
| 404 `model_not_found` for a `<provider>/<model>` pin the provider doesn't serve | **pass** (was: fail F-22 — pins skipped the check and rerouted) | `F-22: a pin naming a model that provider does not serve is a 404 model_not_found` |
| A named model is answered by that model or not at all (no cross-provider fallback) | **pass** (was: fail F-22) | `F-22: a pinned request is not answered by another provider's default model` |
| Upstream provider error bodies never reach the caller | **pass** (was: fail F-23 — relayed verbatim) | five `F-23:` cases |
| 429 with `Retry-After` and `rate_limit_exceeded` | **pass** (was: fail F-15) | `F-15: a 429 carries Retry-After and code rate_limit_exceeded` |
| 5xx envelope on total provider failure | **pass** | `5xx with the envelope when every provider fails` |
| `GET /v1/models` list shape | **pass** | `returns {object:"list", data:[Model]}` |
| `GET /v1/models/{id}` | **pass** | two cases |
| `Authorization: Bearer` and `x-api-key` | **pass** | two cases |
| `OpenAI-Organization` / `-Project` / `-Beta` ignored | **pass** | `ignores OpenAI-Organization, OpenAI-Project and OpenAI-Beta` |
| `X-Request-Id` on responses, caller-supplied id echoed | **pass** | two cases |
| CORS preflight | **pass** (was: fail F-17 — the key gate answered `OPTIONS`) | `F-17: a CORS preflight is answered before the API-key gate` |
| `basegeek-rotation` / `basegeek-free` aliases | **pass** | two cases |
| `basegeek-app` alias | **pass** (was: partial F-18 — echoed `basegeek-rotation` back) | `F-18: basegeek-app echoes the model the caller actually asked for` |
| `<provider>/<model>` pinning; slashy model ids left alone | **pass** | two cases |
| `provider` metadata on the response (README promises it) | **pass** (was: fail F-20) — as `x_geeksuite` | see notes |
| One endpoint per contract | **pass** (was: fail F-19) — `/api/ai/v1/*` is a 308 | `F-19: only one endpoint in this service claims OpenAI compatibility` |
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

**Resolved 2026-09-05.** All five plus `max_completion_tokens` travel
`callAI` → `callProvider` → the adapter now. `openAISamplingFields()` and
`stopSequencesFrom()` in `aiService.js` do the per-provider spelling; a knob a
provider cannot express is dropped at that adapter rather than sent upstream to
become a 400. Cloudflare loses `stop` (Workers AI has no such field and
rejects unknown properties); Anthropic and Gemini lose `seed` and the two
penalties.

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

**Resolved 2026-09-05, option (a).** An id that is neither an alias, nor a
`<provider>/<model>` pin, nor anything `GET /openai/v1/models` lists is a 404
`model_not_found` whose message names all three routes back. Option (b) would
have answered a question the caller did not ask. The catalog lookup is shared
with `GET /models/{id}`, so what the list advertises is exactly what chat
accepts.

**Reopened and re-closed the same evening as F-22** — see below. Option (a) was
applied to bare ids only; the pinned form kept the old behaviour for another
eight hours.

---

### 2b. F-22 — a `<provider>/<model>` pin reroutes to a different model

*Added by the cross-stream burn review (`DOCS/BURN_REVIEW.md` #10), 2026-09-05
evening. Closed the same night.*

F-16's fix exempted the pinned form: `if (!useRotationAlias &&
!isProviderPin(requestedModel))`. The exemption assumed a pin validates itself,
and it does not. `anthropic/gpt-4o-mini` names a real provider and a model it
has never served; `callAI` split the pin, watched anthropic reject the id, and
walked `fallbackOrder`, where **every other provider is called with its own
`DEFAULT_MODELS` entry** (`aiService.js:1566,1595`). The caller got a 200, a
completion from a model it never named, and the bill for it. The same happened
to a perfectly valid pin whose provider was merely rate-limited — which is the
worse case, because it needs no mistake by the caller to trigger.

**Who this breaks:** anyone pinning for determinism, which is the only reason to
pin. geekPR pins so a PR review keeps one reviewer persona across retries; a
silent reroute gives it a different reviewer and no way to know. And anyone
reading a bill: usage lands against a model the caller never asked for.

**Fixed.** The pin's model half is checked against that provider's catalog
(fail-open on an empty catalog — `getModels` swallows its own DB errors, and
"cannot enumerate" must not become "does not exist"), and any request naming a
concrete model — pinned or a bare catalog id — is dispatched with `provider` set
to the owner and `noFallback: true`, a new `callAI` option that tries the named
provider and stops. The `basegeek-*` aliases are untouched and asserted
untouched: they are the request that *wants* whatever is up.

---

### 2c. F-23 — the proxy relays the provider's error body verbatim

*Added by the cross-stream burn review (`DOCS/BURN_REVIEW.md` #11), 2026-09-05
evening. Closed the same night.*

`openaiProxy.js` put `error.message` straight into the response envelope, and
those messages are built as `` `Anthropic API error (${status}):
${JSON.stringify(error.response.data)}` `` at `aiService.js:2440` and ten
sibling sites. So any holder of an `ai:call` key learned which vendor sits
behind the rotation and read that vendor's raw error body: organization and
project ids, quota and entitlement detail, and — on a bad-credential case — the
vendor-redacted key fragment providers echo back. None of it is the caller's.
The credential that failed is baseGeek's.

**Who this breaks:** nobody's client, which is exactly why it survived. It is a
disclosure bug wearing a debuggability costume.

**Fixed.** One allowlist, `UPSTREAM_FAILURES`, is the whole vocabulary this
surface speaks about an upstream failure: seven entries, each a fixed message
and a `type`/`code` pair, selected by the upstream status parsed out of the
error string and nothing else. Statuses follow what OpenAI answers for the same
situation — a provider rate limit is the caller's 429 with `Retry-After`, a
provider's rejection of the request shape is their 400, a bad provider key or a
provider 500 is a 502, an exhausted rotation is a 503, and an unrecognised
failure is a bare 500 that says nothing. The provider's body is still written in
full by the redacting logger; the response message ends with the request id that
finds that log line. Applied at all three sites: the non-streaming catch, the
pre-first-chunk streaming catch, and the terminal SSE error frame.

**Still open, elsewhere:** `/api/ai/call` and `/api/ai/parse-json` relay the
same strings on their own non-OpenAI envelope (`error.message` and
`error.details`). Out of scope for this surface; filed on the burn queue.

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

**Resolved 2026-09-05, both halves.** (a) `callGroq` forwards `tools` and
`tool_choice` verbatim (Groq's API is OpenAI-shaped — re-verified against
`console.groq.com/docs/api-reference`) and reads `tool_calls` back off the
response, *and* `supportsToolCalling` is now gated on a new
`TOOL_FORWARDING_PROVIDERS` set, so the matrix structurally cannot advertise
what no adapter implements. The legacy `supportsFunctionCalling` keeps its old
meaning ("can this model call functions") for aiDirectorService; the two flags
are now allowed to disagree, which is the point. (b)
`aiService.anthropicMessagesFrom()` and `geminiContentsFrom()` translate the
assistant `tool_calls` turn and the `role:"tool"` turn into `tool_use` /
`tool_result` blocks and `functionCall` / `functionResponse` parts. Gemini keys
a response by function name rather than id, so the id→name map is built while
walking the assistant turns.

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

**Resolved 2026-09-05.** Both calls (streaming and not) deleted from
`openaiProxy.js`; the completion is returned exactly as the provider produced
it. `formatResponse` still lives on `/api/ai/*` in `aiRoutes.js`, where
CodeGeek's XML tool UI is its actual audience.

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

**Resolved 2026-09-05.** `aiService.conversationCacheSubject()` builds the key
subject from the whole normalized array — role, content, `name`, and both
halves of a tool loop — instead of the routing prompt. The proxy's redundant
namespace hash was left alone; it is harmless now that the key itself carries
the history.

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
| 1 | Capability matrix (`supportsJSONMode/JSONSchema/ToolCalling`) | **Landed.** `aiModelCapabilitiesService.js`. Tested in `aiModelCapabilities.test.js`. It over-claimed — twelve Groq models marked tool-capable with no implementation behind them (**F-04**) — until `TOOL_FORWARDING_PROVIDERS` made the claim structural on 2026-09-05. |
| 2 | Cache key includes `response_format` + `tools` | **Landed** (`structuredOutputFingerprint`) **and then made moot** — structured and tool requests bypass the cache entirely. The plan diagnosed a real cache bug at the wrong altitude: the damaging collision is history-blindness, which the plan never mentions (**F-03**, fixed 2026-09-05 by `conversationCacheSubject()`). |
| 3 | Preserve the messages array end to end | **Landed at the transport.** Proxy → `callAI` → `callProvider` → provider all carry the array, and `name` survives. The provider translations followed on 2026-09-05: `callClaude` and `callGemini` collapsed every non-assistant role to `user` (**F-02**) until `anthropicMessagesFrom()` / `geminiContentsFrom()` landed. |
| 4 | `response_format` native pass-through | **Landed** for Anthropic (tool-forcing / assistant prefill, `aiService.js:2049-2059`) and Gemini (`responseMimeType` + `responseSchema`). |
| 5 | Prompt-injection fallback | **Landed.** `wrapMessagesForStructuredFallback` + `repairJSONContent`, tested in `aiServiceHelpers.test.js`. Solid work. |
| 6 | `tools` / `tool_choice` native | **Landed.** Real in `callClaude`, `callGemini` and — since 2026-09-05 — `callGroq`, all four `tool_choice` forms each. Absent everywhere else, and the matrix now says so (**F-04**). |
| 7 | Explicit `<provider>/<model>` pinning | **Landed** (`aiService.js:1360-1372`), including the "don't split `meta-llama/…`" rule. Now covered by tests. |
| 8 | Streaming correctness with structured output | **Landed** — single-chunk emission when `tools` or `response_format` is active (`openaiProxy.js:294-318`). |
| 9 | Tests | **Half landed.** The two unit files exist (`aiServiceHelpers.test.js`, `aiModelCapabilities.test.js`) and cover the fingerprint, the repair and the matrix. The plan's other three cases — rotation skipping incapable providers, fallback producing schema-valid JSON end to end, explicit pinning — had **no test until this audit**. Nothing tested the HTTP contract at all. |
| 10 | Docs | **Landed** — `README_OPENAI_PROXY.md` rewritten, `AIGEEK_USAGE.md` written, `AI_CATALOG.md` updated. Two claims in them were not true of the code: Groq native tool calling (**F-04**) and `response.provider` / streaming provider metadata (**F-20**). Both were made true on 2026-09-05 — Groq forwards, and the metadata ships as `x_geeksuite` on the response and the terminal SSE chunk. The docs were rewritten again to match. |

The plan's "explicitly out of scope" list mostly held: `n > 1` is still rejected,
no embeddings, no vision, rotation state still file-backed. One exception —
"streaming tool calls (complex; geekPR doesn't need it)" was half-implemented
anyway (`openaiProxy.js`), and the half that shipped was missing the `index`
field that makes it usable (**F-08**, stamped on 2026-09-05).

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
  **Resolved 2026-09-05:** 308, for both `/v1/chat/completions` and
  `/v1/models`, registered above the router's auth gate so a stale caller
  learns the address changed rather than that its credentials are wrong. 308
  rather than 301/302 because it preserves the method and the body.
- **F-21 — streaming is simulated.** `openaiProxy.js:279` awaits the *entire*
  completion, then re-chunks it at 50 characters. The frames are spec-shaped and
  a client works fine, but time-to-first-token equals time-to-last-token, so
  streaming buys the caller nothing but a nicer-looking spinner. Worth saying out
  loud in the docs, since "streaming works" implies otherwise.
  **Not fixed, now said out loud** (2026-09-05): both `README_OPENAI_PROXY.md`
  and `AIGEEK_USAGE.md` state it, and so does the comment on the streaming
  branch. Real token streaming needs a streaming adapter per provider.
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
  **Not fixed, now documented** (2026-09-05): `README_OPENAI_PROXY.md` says
  `user` is used for per-user usage attribution, so a caller sending a
  per-end-user id knows what it is buying. Changing the quota subject is a
  quota-model decision, not a conformance one.
- **F-17 — preflight.** `openaiProxy.js:90` mounts the key gate with
  `router.use`, which runs on `OPTIONS` too. In production the global `cors()`
  at `server.js:119-143` answers preflights from allowlisted origins before the
  router sees them — but a browser client from any other origin gets a `401`
  (and a disallowed origin gets a *500*, by the deliberate design noted at
  `server.js:100-116`). Server-side callers are unaffected; browser callers
  outside the suite cannot use this endpoint at all.
  **Resolved 2026-09-05:** the router answers its own preflight ahead of the
  key gate, so its correctness no longer depends on where it is mounted. No
  `Access-Control-Allow-Credentials` — the endpoint authenticates by header,
  never by cookie.
- **The cache is on by default for plain completions**, 30-minute TTL, keyed
  without `max_tokens` or the messages history. Combined with F-03 this means a
  caller at `temperature: 1` asking the same question twice gets the identical
  answer — surprising for anyone who knows OpenAI's semantics. Consider honouring
  `store: false` or a `x-basegeek-cache: bypass` header.
  **Partly resolved 2026-09-05:** the messages history is in the key now
  (F-03). `max_tokens` still is not, and no bypass header was added — both are
  open, and both are now stated in `README_OPENAI_PROXY.md`'s caching section
  so nobody is surprised by them.

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
`/anthropic/v1/messages` on top of a service that is actually honest.

**That precondition is met as of 2026-09-05** — the count is zero, not near it.
The Messages surface is now the next thing this document recommends rather than
a thing it warns against, and `aiService.anthropicMessagesFrom()` (written for
F-02) is most of the request-translation half already. At that
point it is a weekend, it opens the door to the Claude SDKs and to
`ANTHROPIC_BASE_URL`-style tooling, and the audit for it is this file with the
nouns changed.

---

## Running the evidence

```bash
cd apps/basegeek/packages/api
pnpm test src/__tests__/openaiCompat.test.js
```

82 tests, all green, **none of them `it.failing`**. The mechanism that got them
there is worth keeping for the next audit: Jest passes a `failing` test whose
body throws and **fails the run the moment the body starts passing**, so each
finding announced its own closure and asked to be promoted. Each case still
carries its finding id in the title and the spec citation in a comment above
it, now reading "CLOSED" with a note on what changed — the tests are the
durable record, and the regression tripwire.

One harness note, added with F-22/F-23: `makeApiKey` mints its keys with
`requestsPerMinute: 1000`. Every case in the file shares one key, and the schema
default is 60 — so the suite passed only while it stayed under sixty requests a
minute, and the case that tipped it over failed with a 429 that had nothing to
do with what it was testing. The `F-15` rate-limit case mints its own throttled
key and is unaffected.
