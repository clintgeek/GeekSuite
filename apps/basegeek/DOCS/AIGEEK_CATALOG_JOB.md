# aiGeek catalog job — design of record

Written 2026-09-07 (Sage) as the Phase 1 brief of `DOCS/AIGEEK_ELEVATION_PLAN.md`. Once built, this
file describes how the job actually works; keep it current.

## Why

Today the free-tier catalog is fed by hand: `scripts/discover-free-models.js --sync` run monthly via
`docker exec`, plus ~3,100 lines of hand-typed model / capability / price / quota tables in
`aiService.seedInitialModels`, `aiModelCapabilitiesService.knownCapabilities`,
`aiDirectorService.{providerPricing,seedInitialPricing,seedFreeTierInformation}`,
`aiService.rateLimits` and `rotationManager.PROVIDER_LIMITS`. Three of those quota tables disagree
with each other. Live state on 2026-09-07: Cerebras 4/4 rows cooling, Ollama Cloud 7/7 cooling,
OpenRouter 4/5 cooling, Together 0 proven in a week; only Cloudflare fully alive.

The job replaces every one of those tables with observation, on a schedule.

## Shape

`src/services/aiCatalogJob.js` — a class with `start()/stop()` modelled on
`oauthRefreshJobService.js`, wired in `server.js` next to it (start after listen, stop in the
shutdown path). Tick every hour. Each tick:

1. **Discovery** if the last successful discovery is older than 24 h (or never). Per configured
   provider (has key, enabled): list models → pick candidates → probe each → write.
2. **Re-probe** if the last probe is older than 6 h: every `AIFreeTier` row with `isFree: true`
   and a configured provider, alive or cooling, gets one probe. Alive rows are revived; dead rows
   cooled 30 d (`PROBE_MARK_COOLDOWN_MS`). This is `runProbe({ mark: true, revive: true })`.
3. **Prune** catalog rows (`AIModel`, `AIFreeTier`, `AIPricing`) whose `provider` is not in
   `PROVIDER_IDS`. Logged with counts. `AIConfig` rows are never touched by the job.

Boot: first tick 60 s after start so `aiService` has loaded provider keys. Every run writes one
`AICatalogRun` document (new model): `{ kind: 'discovery'|'probe', startedAt, finishedAt,
perProvider: { [id]: { listed, candidates, alive, dead, unknown, error } }, pruned, error }`. The
status page reads the latest two. Runs are sequential within a provider (rate limits) and parallel
across providers, exactly as `discover()` does today.

Env: `AI_CATALOG_DISCOVERY_HOURS` (24), `AI_CATALOG_PROBE_HOURS` (6), `AI_CATALOG_JOB=off` disables
(tests, local dev without keys).

## Discovery

The pure parts of `scripts/discover-free-models.js` and `scripts/probe-free-tier.js` move to
`src/services/aiCatalogDiscovery.js` (`listModels`, `freeCandidates`, `probeRow`, `runProbe`,
`classifyProbeOutcome`, `safeErrorText`, constants). The two scripts become thin CLI wrappers
importing from there; RUNBOOK §12 keeps them as the manual override.

### Candidates

- **OpenRouter reads the listing.** `pricing.prompt === "0" && pricing.completion === "0"` and text
  output → free candidate. `openrouter/free` is always a row and always ranked first within
  OpenRouter. Capabilities come straight from `supported_parameters`: `structured_outputs` →
  `jsonSchema`, `response_format` → `jsonMode`, `tools` → `tools`; `context_length` →
  `contextTokens`; `top_provider.max_completion_tokens` → `maxOutputTokens`. Paid rows are also
  written to `AIModel` + `AIPricing` (per-1M, from `pricing` × 1e6) with `isFree: false`; the three
  cheapest paid rows with `structured_outputs` are tagged `AIModel.role = 'paid-fallback'` for
  Phase 2's governed paid walk. Nothing else is paid-tagged.
- **Everyone else lists and probes.** `freeCandidates(provider, raw)` keeps its per-provider
  listing shape (URL, auth, pagination). `CHAT_EXCLUDE` stays: it is about modality (whisper, tts,
  embed, guard, image, audio), not about quality, and vendors are consistent about it. Together's
  `-free$` rule stays with its comment (73 zero-priced dedicated endpoints all 400).
- **`NOT_GENERAL` and `isGeneralAssistant` are deleted.** They are replaced by the probe below plus
  `src/config/aiCatalogOverrides.js`: `{ deny: [/lora/i, /translate/i, /safety|guard/i, /-code\b|coder/i, /ocr/i, /vision/i], allow: [] }`
  — a short list of *families* that answer but are never general assistants. A row matching
  `allow` skips `deny`. Keep this file under 30 lines; if it grows, the probe is wrong, not the list.

### The probe

One call per candidate, through `aiService.callProvider` (the same adapter a real call takes),
`maxTokens: 48`, `temperature: 0`, 8 s budget, sequential within a provider:

```
system: Reply with JSON only.
user:   Extract the task from: "Call the vet Friday at 3pm #flock".
        Return {"task": string, "day": string, "time": string, "tag": string}.
```

Outcome (in `aiCatalogDiscovery.classifyProbe(result, error)`):

| verdict | rule | write |
|---|---|---|
| `dead` | hard failure per `classifyFreeTierFailure`, or HTTP 200 with empty text | cool 30 d, `health.lastFailureCode` |
| `unknown` | 429 / 5xx / timeout / network | leave row alone |
| `alive` | non-empty text, but not parseable JSON with a string `task` | `isFree: true`, `fitness: 'basic'` |
| `alive` | parseable JSON (fences stripped, envelope unwrapped, per `aiFeatureRunner.parseJson/unwrapSchemaEnvelope`) with `task` and `day` strings | `isFree: true`, `fitness: 'structured'` |

`AIFreeTier` gains `fitness: 'structured'|'basic'|null` and `probedAt`. Selection
(`selectFreeTierCandidates`) sorts `structured` above `basic` within a provider tier, then most
recently proven, then fewest failures, as now. Nothing is excluded for being small; it is ranked.
This is the whole replacement for the 30-term regex.

### Writes

Alive: upsert `AIFreeTier { isFree: true, fitness, probedAt, health.* cleared }` and `AIModel
{ isActive: true, lastChecked, name, capabilities }`. Dead: cool the `AIFreeTier` row; mark
`AIModel.isActive: false`. Listed-but-not-candidate (paid, non-chat): `AIModel` row kept current,
`isFree: false`. Not listed anymore: `AIModel.isActive: false` (the 24 h sweep in `refreshModels`
moves here). Rows are never deleted for being dead (the UI lists them).

## Quota learning

Every adapter returns `headers` (the raw response headers) alongside `content`/tokens. On the
success path `callAI` calls `recordObservedLimits(provider, model, headers)`:

- Parses, case-insensitively, `x-ratelimit-(limit|remaining|reset)-(requests|tokens)(-day|-minute)?`
  (Groq, Cerebras, Together, LLM Gateway shapes), plain `x-ratelimit-limit/remaining/reset`, and
  `retry-after`. Unknown headers are ignored; providers that send none (Gemini, Cloudflare, Cohere,
  Ollama) simply never populate this.
- Writes `AIFreeTier.freeLimits.requestsPerMinute/Day, tokensPerMinute/Day` from `limit-*` and a
  new `observed: { remainingRequests, remainingTokens, resetAt, seenAt }` from `remaining-*`/`reset-*`.
  Debounced to one write per row per minute.
- On a 429, `markRateLimited(provider, retryAfterSeconds)` takes `retry-after` from the response
  when present instead of the fixed 60.
- Selection skips a row whose `observed.remainingRequests === 0` while `observed.resetAt > now`.

Deleted: `aiService.rateLimits` (the static table), `checkRateLimit`, `updateRateLimitUsage`;
`rotationManager.PROVIDER_LIMITS`, `ROTATION_PRIORITY`, `DEFAULT_STATE.providers`, and the
`rotation-state.json` file. `rotationManager` becomes an in-memory class: `cooldowns: Map`,
`markProviderCooling`, `isCooling`, `getPriorityList() → FALLBACK_ORDER` from `aiProviders.js`,
`selectProvider()` → first non-cooling provider in that order. `aiUsageService.trackUsage` stays
(it feeds the usage tab); its `freeLimits` snapshot-on-insert is replaced by reading the row's
current `freeLimits` at check time; `checkIfModelAvailable`'s per-provider "critical limits"
switch collapses to: unavailable when today's requests ≥ `freeLimits.requestsPerDay` (if > 0) or
this minute's ≥ `requestsPerMinute` (if > 0).

## Cost capture

OpenRouter returns `usage.cost` (USD, exact) on every response with no request flag. The OpenRouter
adapter returns it as `costUsd`. For every other provider `costUsd` is `AIPricing` (per-1M) ×
tokens when a row exists, else 0. `updateStats` uses `costUsd` when present instead of the blended
per-1K `costPer1kTokens` table, which is deleted. `AIUsage` records gain `costUsd`. A new daily
doc `AISpend { day (UTC), provider, app, feature, calls, costUsd }` is upserted per call (one
`$inc`). Free rows book 0. This is the ledger Phase 2's governor and Phase 3's "dollars left"
read; nothing in Phase 1 spends money that is not already being spent.

## What Phase 1 deletes

| what | where | lines |
|---|---|---|
| `knownCapabilities` table and `updateModelCapabilities`' use of it | `aiModelCapabilitiesService.js:93-1304` | ~1,210 |
| `seedInitialModels` | `aiService.js` | ~90 |
| hardcoded fallback model lists in `refreshModels` | `aiService.js` (gemini; anthropic already gone) | ~30 |
| `seedFreeTierInformation` + route | `aiDirectorService.js:440-849`, `aiRoutes.js:1291` | ~410 |
| `seedInitialPricing` + `providerPricing` + route | `aiDirectorService.js:61-146, 287-366`, `aiRoutes.js:1268` | ~170 |
| `rateLimits`, `checkRateLimit`, `updateRateLimitUsage`, `costPer1kTokens` | `aiService.js` | ~120 |
| `PROVIDER_LIMITS`, `ROTATION_PRIORITY`, file state | `rotationManager.js` | ~80 |
| `checkIfModelAvailable` provider switch, `freeLimits` snapshot | `aiUsageService.js` | ~40 |
| `NOT_GENERAL`, `isGeneralAssistant` | `discover-free-models.js` | ~10 |

`aiModelCapabilitiesService` keeps: the adapter-facts constants (`TOOL_FORWARDING_PROVIDERS`,
`JSON_SCHEMA_SUPPORTED`, `JSON_MODE_SUPPORTED`, which describe *our adapters*), `inferCapabilities`
(the fallback when a listing says nothing), and reads of `AIModel.capabilities`.
`refreshModels(provider)` keeps its signature as a thin call into discovery for one provider, so
`aiDirectorService.collectModelInformation` and the admin refresh route keep working until Phase 2
makes the director a plain read.

## Contracts other code relies on

- `AIFreeTier` health semantics are unchanged: `classifyFreeTierFailure` is still the one judge of
  "dead"; `markFreeTierFailure/Success` still write fire-and-forget; the Map mirror still wins when
  newer. `aiFreeTierRouting.test.js` must stay green as-is.
- `aiFeatureRunner` sees no change.
- `aiService.callProvider(provider, prompt, config)` keeps its signature; the added `headers` and
  `costUsd` on the result are additive.
- `/openai/v1` response shape is unchanged.

## Verification

- Unit: discovery module (candidates per provider shape, probe classification incl. fences and
  envelopes, header parsing, pruning filter, tick scheduling with an injected clock), all without
  network. `aiDiscoverFreeModels.test.js` and `aiFreeTierProbe.test.js` migrate to the new module.
- Boot: `node --check` on every changed file and the `gatewaySchemaLoads` tripwire.
- Live, after deploy: `docker logs basegeek | grep CatalogJob` shows the boot tick; the aiGeek
  page's free list shows `probedAt` within the hour; `AICatalogRun` has one discovery document.

## Rollback

`AI_CATALOG_JOB=off` in `apps/basegeek/.env.production` + `docker compose up -d --no-deps basegeek`
stops the job; the manual scripts still work. Rows the job wrote are ordinary rows.
