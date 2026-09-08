# aiGeek front door — design of record (Phase 2)

Written 2026-09-07 (Sage) as the Phase 2 brief of `DOCS/AIGEEK_ELEVATION_PLAN.md`. **The routing
half (§1–5, §7) was built the same day**; this file now describes how routing actually works, and
the deviations the build had to decide are recorded in each section rather than in a separate list.
Phase 1 (`AIGEEK_CATALOG_JOB.md`) is live: the catalog feeds itself, `AIModel.role =
'paid-fallback'` is written, `AISpend` is booked.

**Built:** `src/services/aiRoute.js` (pure), `src/models/AIStickyPick.js`, the `callAI` walk,
`runFeatureCore` + `POST /api/ai/feature` + `GET /api/ai/models/alive`, the governor,
`AIAppConfig.{tier: 'auto', sticky, allowPaid, dailyCap}`, and the minimal UI for the last three.
`callAISmart` is gone. §6 (the adapter registry) was built in parallel by another agent.

## Why

`aiService.callAI` accepts eleven ways of saying where a request should go — `tier: free | rotation |
specific`, `provider: 'free'`, `provider: 'basegeek-app'`, `freeOnly`, `useAppConfig`, `autoRotate`,
`noFallback`, a `<provider>/<model>` pin, a bare catalog id, and the three `basegeek-*` aliases —
resolved by ~150 lines of interacting branches plus a legacy auto-trigger in `aiRoutes.js`. Two
consumers (fitnessgeek, storygeek) call the deprecated `/api/ai/call` with their own axios wrappers,
no fallback, and 500 to the user on any failure. StoryGeek pins a model id from an env var. Nothing
reads `paid-fallback`. Adding a provider is a `case` in a 10-branch switch plus an 80-line method.

## Principles (from the plan)

`auto` or `pin`, nothing else. Pins are roles and sticky picks, never a human-typed id. Money has a
governor with two layers. Every feature fails soft, over HTTP too. `/openai/v1` keeps its shape.

## 1. Route resolution

One pure function, `resolveRoute(config, appRow, ctx) → Route`, in
`src/services/aiRoute.js`. It replaced the branch soup in `callAI` — ~150 lines in which the
explicit-pin block switched off `autoRotate`/`freeOnly`/`useAppConfig`, the app-config block
switched them back on, and the free-tier block overwrote `requestedProvider` again. Three writers
to the same four variables, each defensible alone, and together the mechanism behind R130 and F-22.

```
Route = {
  mode: 'auto' | 'pin',
  provider: string | null,                     // pin only
  model: string | null,                        // pin only; null = the provider's defaultModel
  allowPaid: boolean,                          // auto only; from the routing row, default false
  singleAttempt: boolean,                      // was noFallback
  sticky: null | { key: string },              // auto only; key = `${app}:${conversationId}`
  hints: string[]                              // what produced this, for logs and provenance
}
```

Every field is always present — no reader has to guard for absence — and `hints` is deduped.

Legacy inputs map as (this is the table `aiRoute.test.js` walks, case for case):

| input | route |
|---|---|
| `model: '<provider>/<id>'` with provider in roster | `pin` |
| `provider` = a roster id with a `model` | `pin` |
| `provider` = a roster id with **no** model | `pin`, `model: null` → the provider's `defaultModel` |
| `tier: 'specific'` row with provider **and** model | `pin` (hint `app_pin`) |
| `tier: 'specific'` row with only one of them | `auto` — half a pin is not a pin |
| `provider: 'free'`, `freeOnly`, `basegeek-free` | `auto`, `allowPaid: false` (hint `free`) |
| `tier: 'free'` row | `auto` (hint `legacy_tier:free`) |
| `autoRotate`, `basegeek-rotation` | `auto` (hint `rotation`) |
| `tier: 'rotation'` row | `auto` (hint `legacy_tier:rotation`) |
| `useAppConfig`, `basegeek-app`, or **nothing at all** | `auto`, reading the app's row |
| no row at all | `auto` (hint `no_row`); the row is auto-discovered as `tier: 'auto'` |
| `noFallback` | `singleAttempt: true` on either mode (hint `no_fallback`) |
| a bare catalog id (`/openai/v1` with `model: 'llama-3.3-70b-versatile'`) | `pin` via `findModelOwner`, as today |

A request pin outranks the row's pin. `allowPaid` comes from the row and **nowhere else** — a body
field cannot buy itself a paid call — and any free signal vetoes it, because a caller that asked
for the free tier by name did not ask to be billed.

**Decided by the build, where §1 was silent.**

- **`provider: <roster id>` with no model is a pin**, on that provider's `defaultModel`. A caller
  that names a backend and no model still named a backend, and answering it from a *different*
  vendor is F-22 wearing a different hat. This is what §2 keeps `defaultModel` for.
- **"Absent from the catalog" is read narrowly.** A `pin` degrades to `auto` (hint
  `pin_unavailable`) when the provider has no key or is disabled, when an `AIFreeTier` row for that
  exact model is cooling, when an `AIModel` row for it is `isActive: false`, or when the provider
  has an active catalog and the id is not in it. A model id we have simply *never heard of* is
  attempted: the catalog is observed and incomplete by construction, and refusing every unknown id
  would turn a missed discovery run into a total outage. `aiService.pinIsUsable` owns this; it is
  the one impure half of route resolution.
- **The degrade must ignore the row's pin too.** `degradePin` passes `ctx.ignorePins`, because a
  pin can come from the request *or* from a `tier: 'specific'` row, and blanking only the request's
  let the row re-derive the very pin that was just found unusable — an infinite "degrade to itself".
- **`singleAttempt` still means one attempt after a degrade.** The caller's attempt budget outlives
  its pin.
- **The body→config translation moved too.** `legacyRoutingSwitches(body, config)` is the
  `provider: 'free'` / `basegeek-app` / legacy auto-trigger normalization `/call` and `/parse-json`
  each had a copy of. It lives in `aiRoute.js` so `resolveRoute` is the *only* reader of the legacy
  vocabulary in the service, and it reproduces the original order exactly — including the part that
  reads oddly, where a `freeOnly` body never picks up the app-routing auto-trigger, which two
  deployed consumers rely on.

## 2. The `auto` walk

`aiService.planAutoAttempts(route)` builds the plan; the walk in `callAI` runs it. Attempts are
`{ provider, modelId, freeRow, paid, sticky }`, and **every attempt names its own model** — the old
three-way `isRequestedProvider` conditional is gone with the walk that needed it.

1. **Sticky pick first.** If `route.sticky` and `AIStickyPick` has a row for the key whose model is
   in the live candidate list, it is moved to the front of the candidates and the existing
   `planFreeTierAttempts` planner does the rest (hint `sticky_hit`). A stored *paid* pick is
   prepended as a paid attempt when `route.allowPaid` (hint `sticky_hit_paid`). A stored pick that
   is cooling, no longer free, or whose `allowPaid` has since been switched off is ignored (hint
   `sticky_stale`) and re-chosen by the ordinary walk.
2. **Free rows** from `selectFreeTierCandidates()` (Phase 1: fitness-ranked, observed-window
   aware), planned by `planFreeTierAttempts` (≤3, distinct providers). This is now the walk for
   *every* auto caller, not only `freeOnly`; the old "provider default model" rotation is **gone**.
   A provider's `defaultModel` in `aiProviders.js` is kept only as the probe's fallback id and for
   pins that name a provider without a model. The R130 long-shot survives: if every row is cooling,
   the one closest to waking gets one attempt.
3. **Paid fallback** only if `route.allowPaid` and not `singleAttempt`: one attempt at the cheapest
   usable `AIModel.role === 'paid-fallback'` row (hint `paid_fallback_planned`). The governor runs
   at *dispatch*, not here — the estimate needs the preprocessed prompt, and a plan is not a
   decision to spend.
4. Throw. The wording is load-bearing: `aiFailureEnvelope.classifyFailure` reads `/no .*providers/i`
   as `unavailable`, so an exhausted walk is a 503 `upstream_unavailable`, not a 500 that says
   nothing.

Every Phase 1 health write is where it was: `markFreeTierFailure` on a hard failure with its
classification, `markFreeTierSuccess` on an answer, `markRateLimited` (with `retry-after`) on a 429,
`recordObservedLimits` off the response headers, the cache, and the empty-content rule.

**Decided by the build.**

- **The empty-content rule now covers paid attempts too.** A paid row that answers with no text
  billed us for nothing. A *pin* stays exempt: the caller named that model, and an empty completion
  with `finish_reason: tool_calls` is a legitimate answer.
- **Paid attempts do not write `AIFreeTier` health.** Those are free-tier semantics; a paid row has
  no row to write to. A paid row that just failed hard is still skipped via the in-memory health
  mirror, which is keyed `provider/model` and does not care about price.
- **`rotationManager.markProviderCooling` is now written unconditionally** on a 429. It used to be
  gated on `autoRotate`, which was the only mode that read `isCooling` back — so with the rotation
  walk gone the gate would have made the cooldown map write-only. It still feeds
  `getServiceStats().rotation`, which is what the status page shows.
- **`lastProviderInfo` gained `hints` and `costUsd`.** `costUsd` comes from `updateStats`, which now
  returns what it booked, so the feature door reports the same figure `AISpend` holds rather than
  pricing the call twice. A cache hit reports `costUsd: 0` — a fact — while an unstubbed-but-unknown
  cost is `null`.
- **Every `auto` call reads the routing row**, not only the ones that said `useAppConfig`: the row
  is where `allowPaid`, `sticky` and the token defaults live. A pin skips the query
  (`explicitPinOf` is consulted first), so the extra read is on the path that was already doing it
  for the majority of callers. `aiService.routingRowFor` touches `lastSeen`, auto-discovers a
  missing row as `tier: 'auto'` (the old default was `free`), and never throws.

Sticky picks: `AIStickyPick { key, app, conversationId, provider, modelId, paid, pickedAt,
previous: [{provider, modelId, retiredAt, reason}] }`, unique on `key`, TTL index 30 days on
`pickedAt`. Written when a sticky auto call succeeds on a row that differs from the stored one — a
hit rewrites nothing, so a long story is not one write per turn. On a **hard** failure of the stored
pick the walk re-picks and the old one is appended to `previous` with the failure code as its
`reason` (Phase 3's needs-attention list reads `previous.length > 0` in the last 7 days). `sticky`
is enabled per routing row: `AIAppConfig.sticky: 'per-conversation' | null` (default null;
storygeek's row gets it). Without a `conversationId` there is nothing to be sticky about and the
route's `sticky` is null however the row is configured.

## 3. The governor

Env, read once: `AI_PAID_PER_DAY_USD` (default `0.05`), `AI_PAID_PER_CALL_USD` (default `0.01`). A
nonsense value is ignored with a warning rather than honoured — a `NaN` cap compares false against
everything, which would wave every call through. Per row: `AIAppConfig.allowPaid: Boolean` (default
`false`). Before a paid attempt (`aiService.paidGovernorVerdict` → `aiRoute.paidBudgetVerdict`):

- `estimate <= perCallUsd`, and
- today's `AISpend` total `costUsd` across all providers (UTC day) `+ estimate <= perDayUsd`,

where `estimate = AIPricing per-1M × (tokenCounter estimate of the prompt + maxTokens)`. Both are
`<=`, not `<`: a cap is an amount you may spend, not one you must stay under. `maxTokens` rather
than a guess at the real completion length is deliberate — the job is to refuse the call that
*could* be expensive, and a cap only breached in hindsight is not a cap.

Otherwise the paid attempt is skipped, logged `paid_budget` with the reason, estimate, spend and
caps, and **not queued**. The hard ceiling is the OpenRouter dashboard key limit, which Chef sets;
this code cannot see it and does not try.

**Decided by the build: unknown is never free.** Three refusals exist beyond the two caps, and each
was a real hole:

- `paid_estimate_unknown` — a `paid-fallback` row with no `AIPricing` entry. "We do not know what
  this costs" is not a reason to buy it. Unpriced rows are kept in the candidate list (sorted last)
  rather than dropped, so Phase 3's status page can see the catalog bug.
- `paid_ledger_unreadable` — `spentTodayUsd` reports `Infinity` when the aggregate fails, and that
  is refused rather than defaulted to zero.
- The nullish check on the estimate happens **before** the numeric coercion, because `Number(null)`
  is `0` and a nullish estimate silently becoming a free one is the exact confusion this governor
  exists to prevent. Same reason `selectPaidFallbackCandidates` no longer writes
  `Number(price) || 0`: a missing price is `null`, not zero.

## 4. The feature door over HTTP

`POST /api/ai/feature` (permission `ai:call`, identity from the credential, never the body):

```
request:  { feature, messages?: [{role, content}], system?, user?,
            schema?: { name, description?, schema }, timeoutMs?, conversationId?,
            provider?, model?, quotaKey?,
            maxTokens?, temperature?, maxCallsPerDay? }
response: 200 { ok: true,  data, provenance }                     // model answered, parsed, validated
          200 { ok: false, reason, provenance }                   // cap | unavailable | unparseable | empty | invalid
          400 { ok: false, reason: 'invalid_request', error }      // the request was wrong
provenance = { source: 'model'|'none'|'fallback', reason, model, provider, cached,
               callsToday, cap, costUsd, hints }
```

A model failure is a **200**. The deterministic fallback for an out-of-process feature lives out
there with the feature — the food-parse comma split, "the assistant isn't available right now" — so
this route's job is to say clearly that no model answered, not to make a consumer parse a 5xx to
find out. A 4xx/5xx still means what it always means: the request was wrong, or the gateway is
broken. A genuine gateway fault takes the same allowlisted envelope as the other doors (Q46).

Implemented by splitting `aiFeatureRunner.runAIFeature` into `runFeatureCore(opts)` (everything
except calling `fallback()`; returns `{ ok, data, reason, provenance }` with `source: 'none'` on a
refusal — nothing fell back) and the existing wrapper, which calls `fallback()` when `ok` is false
and relabels `source` as `'fallback'`. **In-process callers are unchanged.** The daily cap counter
is keyed `app:feature:<bucket>:day` exactly as today. `timeoutMs` is clamped to `[1000, 60000]`.
`provenance.costUsd` comes from `lastProviderInfo.costUsd`, i.e. from the spend hook.

`provider` + `model` are an explicit **pin** — StoryGeek's player picker, whose options come from
`GET /api/ai/models/alive`. **Both or neither**: half a pin is a `400 INCOMPLETE_PIN` rather than
"that provider's default", because a picker that sends only a provider has a bug and answering it
plausibly would hide it. An unknown provider is a `400 UNKNOWN_PROVIDER`. A pin whose catalog row is
cooling or gone degrades to the app's ordinary `auto` walk (the sticky pick, where there is one) and
`provenance.hints` carries `pin_unavailable`, which is what lets a consumer show a notice instead of
failing the turn.

`quotaKey` is a **cap-bucket segment and nothing else.** A service API key has no session, so
`callerIdentity` gives a key caller the key's *owner* — the admin who minted it — which is an
artefact of how the key was created and not the person making the request; without `quotaKey` every
StoryGeek player would share one bucket and the first evening's play would spend the app's whole
day. It is honoured **only** for a credential with no session that has not named a `userId`, and it
is never treated as an identity, never resolved to a user, never logged as one, and never forwarded
to `callAI`, `AIUsage`, `AISpend` or a conversation's ownership. A request body may name a counter
segment because the worst a liar gets is a fresh quota, which the free tier's own rate limits and
the paid governor already bound; **that reasoning does not extend to anything else a body says.**

The door's default cap is **200** a day per bucket (`DEFAULT_HTTP_MAX_CALLS_PER_DAY`), not the
in-process 20: an in-process feature is a one-shot assist, an out-of-process consumer is a whole app,
and a StoryGeek evening is dozens of GM turns. The cap is a bound on a runaway loop, not a ration —
the real ceilings are the free tier's own rate limits and, for money, the governor. Precedence:
the request's `maxCallsPerDay`, then `AIAppConfig.dailyCap`, then 200.

**Decided by the build: the user turn is not an identity.** `resolveCaller` reads `payload.userId ??
payload.config?.userId ?? payload.user` for a key caller — the `user` fallback being an old spelling
for "the person this service is calling for". On this route `user` is the *user turn's text*, so
handing over the whole body would have made a prompt into a billing identity: `{ user: 'hi' }` bills
every call in the suite to a user called `hi` and pools their free-tier quota. (Long prompts escaped
it only because `normalizeUserId` caps at 64 chars, which is luck, not design.) So the route hands
`resolveCaller` a narrowed view — `{ feature, userId }` — and the prompt stays a prompt.

`GET /api/ai/models/alive` (permission `ai:models`): a **bare array**, not the `{success, data}`
envelope the older routes use, because this is what a picker renders.

```
[{ provider, modelId, fitness, paid: bool, lastSuccessAt }]
```

Alive free rows plus `paid-fallback` rows, both filtered by "the provider has a key and is enabled"
and by the *same* health view selection uses (mirror included), so the picker and the router cannot
disagree about what is alive. Registered above `GET /models/:provider`, or `alive` would be read as
a provider id.

`/api/ai/call` stays for one more deploy: it resolves through `resolveRoute` like everything else,
adds `Deprecation: true` and a `Link: </api/ai/feature>; rel="successor-version"` header plus one
log line per caller app per hour (`_deprecationDue`, exported so the throttle is testable — a pino
child logger binds its methods at creation and cannot be spied on after `pino-http` has run), and is
deleted in a follow-up commit once fitnessgeek and storygeek are verified live on the feature door.

`POST /api/ai/conversation/message` calls `callAI` directly now. `callAISmart` is deleted; the
route builds `{success, content, routing}` itself from `lastProviderInfo` in a local `askModel()`,
which is where the shim was getting it from anyway. Its `{success:false}` resolution existed only so
the route could throw the provider's string back, which Q46 then had to stop it doing; the envelope
is `resolveFailure`'s, in the catch, as it is on the other three doors.

## 5. Consumers

**Routing rows** (data, set in the aiGeek UI): every app `tier: 'auto'` — the `tier` enum gained
`auto` and it is now the default; `free`/`rotation` are read as `auto` with a hint and rewritten by
`normalizeTier` on the row's next save, so the legacy values drain away as rows are touched. **No
data migration**: a tolerant read is cheaper than a migration that has to be right the first time,
and it is what makes the Phase 2 rollback a plain `git revert` (rows are read tolerantly in *both*
directions). `storygeek`'s row gets `sticky: 'per-conversation'`, and `allowPaid: false` until Chef
flips D8.

`AIAppConfig` gained four fields, all additive: `tier` enum `+ 'auto'` (default `auto`), `sticky`
(`'per-conversation' | null`, default null), `allowPaid` (Boolean, default false), `dailyCap`
(Number, default null). All four are exposed through the existing `saveAIAppConfig` mutation, whose
`config` argument is a `JSON` scalar — so `graphql/basegeek/typeDefs.js` needed no change. The
aiGeek App Routing dialog gained the `auto` option (the only options are now Automatic and Specific)
and two switches, disabled rather than hidden under Specific: a pinned row has already chosen its
model, and a pin never spends through the governor. Phase 3 redesigns that page.

**fitnessgeek and storygeek** are the consumer half of Phase 2 and were built in parallel against
this contract; see their own notes. The door they call is the one above — pins, `quotaKey`,
`provenance.hints` and the 200-with-`ok:false` rule were all added at their request during the
build.

## 6. Adapter registry — built

`src/services/ai/adapters/{index,openaiCompatible,gemini,cohere,cloudflare,ollama}.js` and
`src/services/ai/AdapterError.js`. Each adapter exports
`call(providerConfig, request) → { content, inputTokens, outputTokens, toolCalls?, finishReason?,
headers, costUsd? }` and throws `AdapterError { provider, status, code, message }`. `callProvider`
keeps its `(provider, prompt, config)` signature — the probe, the OpenAI-compat surface and
`callAI` all depend on it — and is now four lines: read the row, guard the credential, build the
request, `callAdapter(provider, providerConfig, request)`. The ten `call<Provider>` methods and
`geminiContentsFrom` are gone from `aiService` (~760 lines), as is the hand-typed `this.providers`
table (~100) and the two sampling translators (~37).

**The descriptor.** Every roster row in `config/aiProviders.js` carries an `adapter` object:

```
adapter: {
  shape: 'openai' | 'gemini' | 'cohere' | 'cloudflare' | 'ollama',
  baseURL, name, maxTokens, maxContextTokens?, temperature,   // the connection
  extraHeaders?: { [header]: value },      // openrouter's Referer + Title
  dropSampling?: string[],                 // knobs this provider 400s on, in our spelling
  forwardsTools?: boolean,                 // F-04 — tools on the wire AND tool_calls back
  nativeJsonSchema?: boolean,              // response_format: json_schema, natively
  nativeJsonMode?: boolean,                // response_format: json_object, natively
  sendsUsageInclude?: boolean,             // openrouter — ask for, and report, the cost
  sendsStreamFalse?: boolean,              // together — the explicit stream:false
  dailyNeuronLimit?: number                // cloudflare's one unreported quota
}
```

Three things are derived from it, so nothing restates it:
`ADAPTER_DESCRIPTORS` (id → normalized descriptor, what the registry dispatches on),
`buildProviderConnections()` (id → the live row `aiService.providers` is built from — credential,
address, model, ceilings, and *no* adapter facts), and the three adapter-fact sets
`TOOL_FORWARDING_PROVIDERS` / `JSON_SCHEMA_SUPPORTED` / `JSON_MODE_SUPPORTED`, which
`aiModelCapabilitiesService` now only re-exports under their original names. `callAdapter` merges
descriptor ← row ← descriptor-facts, so a database row (or a patched test object) can move a base
URL but never change a dialect or invent tool forwarding.

**Who talks which shape.** groq, cerebras, together, openrouter and llmgateway are five rows over
one `openaiCompatible` function; gemini, cohere, cloudflare and ollama keep a file each because
their request bodies share nothing with OpenAI's but the word "model". Quirks preserved verbatim,
with their incident notes: groq's tool forwarding and `tool_calls` read-back (F-04), openrouter's
`usage: { include: true }` + `costUsd` (null when unreported, never 0) and its ranking headers,
together's `stream: false`, gemini's `contents[]` / `systemInstruction` / `functionDeclarations` /
synthesized call ids / key-in-a-header (F-02, F-09), cohere's preamble + `chat_history` + `p` +
`stop_sequences` and its deliberate non-forwarding of tools, cloudflare's chat mode with the
unwrapped `json_schema`, dropped `stop` and 402-is-neurons (the 2026-09-07 Ask outage), ollama's
`options` / `num_predict` / eval counts.

**Errors.** `AdapterError.status` is the upstream status as a *field*; `code` is the same
credential-free token the free-tier health and the probe already speak (`http_<status>`, `timeout`,
`network`, `rate_limited`, `unknown` — with `empty_content` still coming from the probe's own
verdict on a 200 with no text); `message` is at most 80 characters of the provider's own words,
whitespace collapsed, never the body, never a key, never a URL (F-23).
`aiFailureEnvelope.upstreamStatusOf` reads `error.response.status`, then `error.status`, then the
old `API error (<status>)` regex, which survives only as the fallback for anything still throwing
strings; `classifyFailure` also reads `AdapterError.code` before it guesses from prose. The
`<Provider> API error (<status>): <body>` sentence is gone from every adapter.

**And the log.** Every failure is built, logged and thrown in one place
(`raiseAdapterError`): **one** line, at `warn`, carrying `{ provider, model, status, code }` and the
trimmed message — never `err` (an axios error drags `config.url` and its headers along) and never
`data`. Until 2026-09-07 each adapter's catch wrote *two* level-50 lines, the second one holding the
provider's response body; a discovery run probes ~60 rows, so one nightly job put dozens of vendor
bodies (model ids, org and project ids, entitlement detail) in the production log — for outcomes
that are not errors. A dead free row and a 429 are this subsystem's weather, and the health rows
already record them; `error` is reserved for what an operator must act on. `aiAdapters.test.js`
asserts the logged object's exact keys.

**Also folded in:** `summarizeText`'s hand-rolled `axios.post` — the eleventh copy of the
OpenAI-compatible request — now goes through `callAdapter` with a 10 s `timeoutMs`, so `axios` is
no longer imported by `aiService.js` at all.

The six model enums (`AIModel`, `AIFreeTier`, `AIPricing`, `AIConfig`, `AIUsage`, `AIAppConfig`)
import `PROVIDER_IDS` instead of re-typing the list; `AISpend` already did. `aiProviders.js`
imports nothing, so there is no cycle.

Adding a provider is one row. See DOCS/AI_CATALOG.md § "Adding a provider".

## 7. What Phase 2 deleted

Gone from the routing half:

- **The branch soup in `callAI`** (~150 lines): the explicit-pin block, the app-config block, the
  free-tier planning block, `rotationProviders`, the `autoRotate` selection nudge, the
  `isRequestedProvider` model conditional and the `rotationProviderOverrides` lookup in the walk.
  Replaced by `resolveRoute` + a plan.
- **The provider-default rotation walk itself.** This is the behavioural deletion, and the only one
  that changed a passing test rather than adding to it. `callAI('hi', { appName: 'geekpr' })` used
  to walk `[currentProvider, ...fallbackOrder]`, each provider on *its own default model*. It is now
  the same health-ranked free walk every other auto caller takes. Two cases pinned the old
  behaviour and were re-pointed, both documented in place:
  `aiFreeTierRouting.test.js` ("non-free callers walk exactly the list they always did" → "a caller
  that names nothing takes the same walk as a free-tier caller") and `openaiCompat.test.js`
  ("rotation skips a tool-incapable provider" → "a tool-incapable pin is skipped and fails as
  itself"; the walk version of that case now lives in `aiFreeTierRouting.test.js`).
- **`callAISmart`** (57 lines), the last survivor of the second routing stack. Its two test files
  mocked it by name and were re-pointed at `callAI`.
- **`config._appFallbackOrder`**, which the app-config block set and nothing read.
- **`/api/ai/call`'s and `/api/ai/parse-json`'s duplicate routing-switch blocks**, folded into
  `aiRoute.legacyRoutingSwitches`; and `askService`'s redundant `useAppConfig: true`, which is now
  the default.

Still to come: `/api/ai/call` itself, in a follow-up commit once fitnessgeek and storygeek are
verified live on the feature door; and `aiDirectorService.recommendProvider`'s use by storygeek's
export (the director stays for the admin steward until Phase 3). §6 lists the adapter deletions.

## Contracts other code relies on

`/openai/v1/*` request and response shapes are unchanged (CodeGeek, geekPR). `aiFeatureRunner`'s
in-process signature is unchanged. `AIFreeTier` health semantics are unchanged. `callProvider`
keeps its `(provider, prompt, config)` signature for the probe.

## Verification

Done 2026-09-07 for the routing half. 613 tests green across the 23 suites that touch it, no network
in any of them.

- `aiRoute.test.js` (new, 58): the §1 table case for case, the routing row, sticky keys,
  `degradePin` (including the "degrade to itself" trap), `legacyRoutingSwitches`, `normalizeTier`,
  and the governor's arithmetic — caps from env, the estimate, and each of the five refusals.
- `aiFeatureDoor.test.js` (new, 35): both HTTP shapes. The gate, the credential-over-body rule with
  a lying body in every case, `ok:false` for each reason, the timeout clamp, pins (whole, half,
  unknown provider, `pin_unavailable` relayed), the `quotaKey` bucket and the three things it must
  not become, the cap precedence, `/models/alive`'s array and its health filter, and `/call`'s
  deprecation header and hourly throttle.
- `aiFreeTierRouting.test.js` (18 → 33): the Phase 1 state machine unchanged, plus the auto walk's
  capability skip, pin degradation (cooling / retired / absent / unknown-and-therefore-kept),
  the sticky pick lifecycle including the `previous[]` entry, and six governor cases against real
  `AIModel`/`AIPricing`/`AISpend` rows.
- `aiFeatureRunner.test.js` (8 → 13): the wrapper's contract unchanged, plus `runFeatureCore` — the
  shared counter, `source: 'none'`, a whole `messages` array, and no `fallback` required.
- `aiRoutesGates.test.js` (30), `aiAdminGates.test.js` (17), `callerIdentity.test.js` (29),
  `conversationService.test.js` (32), `openaiCompat.test.js` (74), `aiQuotaAndSpend.test.js`,
  `aiCatalogJob.test.js`, `aiModelSteward.test.js`, `aiServiceCache.test.js`, `csrfToken.test.js`,
  `gatewaySchemaLoads.test.js` — green, unchanged.
- `goingOverAiGeek.test.js` (12) and `conversationOwnership.test.js` (14) — green, stubs moved from
  `callAISmart` to `callAI`.
- Five consumer suites had one assertion each on the runner's `useAppConfig: true`
  (`glanceBrief`, `glanceDraft`, `notegeekSuggest`, `bujogeekReviewDraft`,
  `fitnessgeekQuickAddResolver`): re-pointed, since "nothing at all" is now that switch.
- UI: `AppConfigDialog.test.jsx` (new, 13) — the tier options, the tolerant read of a legacy row,
  and both switches. The four existing aigeek suites (41) green.
- `node --check` on every changed file; `node tools/syntax-check.mjs` (864 files) and
  `node tools/gql-arg-audit.mjs` clean.
- Live after deploy: a StoryGeek turn shows `provenance.provider/model` in the response and an
  `AIStickyPick` row for the story; fitnessgeek quick-add and a coach call return 200 with either
  `ok:true` or a friendly `ok:false`; `AISpend` shows zero paid cost; `docker logs basegeek | grep
  -E '\[Route\]|\[Auto\]|paid_budget'` shows the walk making decisions.

## Rollback

Per-app image rollback via Watchtower is not a thing; the rollback is `git revert` of the Phase 2
commit(s) and a push. Routing-row `tier` values are read tolerantly in both directions.
