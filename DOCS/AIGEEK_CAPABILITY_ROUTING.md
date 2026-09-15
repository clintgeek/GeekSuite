# aiGeek — Capability Routing

*Proposal, 2026-09-15. Written after a day of walking into this system's failure
modes one at a time while building FitnessGeek's describe-and-log.*

## 1. The finding

**This is mostly built already.** Chef asked for capability tags — "this one is good at
prose, this one at coding, this one at reasoning" with size classes — and the schema has
carried exactly that for some time:

```json
// AIModel.capabilities, populated on all 1,336 rows
{
  "contextWindow": 1048576,
  "supportsVision": true, "supportsFunctionCalling": true, "supportsJSONOutput": true,
  "tasks": { "reasoning": true, "codeGeneration": true, "creativeWriting": true,
             "structuredOutput": true, "analysis": true, "summarization": true, ... },
  "performance": { "speed": "fast", "quality": "excellent", "reasoning": "excellent" }
}
```

`AIFreeTier` carries `fitness` ("structured"), real rate-limit observations
(`freeLimits` / `observed` / `currentUsage`), and health (`consecutiveFailures`,
`lastFailureCode`, `coolingUntil`). `AIAppConfig` carries `tier`, `sticky`, `allowPaid`,
`dailyCap`, `fallbackOrder`. And `aiDirectorService` already has a
`capabilityFitScore(model, taskRequirements)`, filters `suitableModels`, and returns a
`bestModel` with reasoning attached.

**So the problem is not missing machinery. It is one missing connection:**

> aiGeek can already tell you the best model for a task, and nothing asks it at call time.

`aiDirectorService.recommendProvider(task, …)` is exposed at `aiRoutes.js:1512` as an
advisory endpoint for the admin UI. The actual call path — `aiGeekClient.feature()` →
`callAI` — never consults it. Every caller either pins a literal model or rides blind
rotation. That is why FitnessGeek spent a day pinned to slugs that had been retired.

## 2. What is trustworthy and what is guessed

This distinction is the whole design, because routing on the wrong half is worse than not
routing at all.

**Trustworthy — vendor-derived or measured:**

| fact | source |
|---|---|
| `supportsJSONOutput` / structured outputs | vendor `supported_parameters` (`aiCatalogDiscovery.js:265`) |
| context window, max output | vendor listing |
| pricing | `AIPricing`, from the vendor |
| alive / dead / cooling | the probe, measured |
| `fitness: "structured"` | the probe, measured |
| observed rate limits | response headers, measured |

**Not trustworthy — inferred from the model's NAME:**

```js
// aiModelCapabilitiesService.js:265
if (modelLower.includes('70b') || modelLower.includes('405b')) {
  capabilities.performance.reasoning = 'excellent';
  capabilities.performance.quality   = 'excellent';
}
if (modelLower.includes('405b')) capabilities.performance.quality = 'state-of-the-art';
if (modelLower.includes('8b'))   capabilities.performance.speed   = 'ultra-fast';
```

Measured against reality on 2026-09-15:

- `nousresearch/hermes-3-llama-3.1-405b:free` → rated **state-of-the-art**. It 404s; the
  vendor retired it.
- `nvidia/nemotron-3-super-120b-a12b:free` → matches no pattern, gets defaults. It was the
  only free model that served, and it took 11s and emitted `{"dishes":[ ... ]}` — a literal
  ellipsis.
- `openai/gpt-oss-120b` → matches no pattern. Measurably the best answers of anything tested.
- `allam-2-7b` → matches no pattern. The only model reliably answering at all.

**A name is not a capability.** `performance.*` must stop being an input to routing until it
is measured.

## 3. What to build

### 3.1 Callers declare a need

```js
feature('dishEstimate', { need: 'structured:fast' })   // not { model: 'openai/gpt-oss-120b' }
feature('dishJudge',    { need: 'reasoning:deep' })
```

Two axes, because they are the two decisions that actually differ:

- **task** — `structured`, `reasoning`, `prose`, `code`, `vision`. These map 1:1 onto
  `capabilities.tasks`, which already exists.
- **weight** — `fast` (a person is waiting, ≤2s), `balanced`, `deep` (background, slow is
  fine).

FitnessGeek proves the axes are the right ones: the inline estimate is `structured:fast` and
the judge is `reasoning:deep`, and I had to discover that distinction by timing four models
after shipping the wrong default.

Resolution is `need × app tier/budget × live capability index → model`, cached per
(need, app) for a few minutes so it is not a query per call. The scorer already exists; it
needs a caller and a cache.

### 3.2 Weight comes from the probe, not the name

The probe already runs one structured extraction per candidate and records alive/dead plus
`fitness`. It also inherently knows two things it currently discards:

- **how long it took** → that IS the weight class. Measured, per provider, continuously.
- **whether the answer was right** → a quality signal, if the probe's fixture has a known
  answer.

Add a small golden set — one extraction, one arithmetic, one reasoning question with known
answers — scored on each discovery run. Ten cheap calls per candidate, on free models mostly
free. That replaces `performance.*` with something earned.

Until then: route on task flags and measured latency only, and ignore `performance.*`.

### 3.3 Failure feeds back, by cause

Today a failed sweep cools everything for 30 days uniformly. On 2026-09-15 that cooled nine
OpenRouter models for a month, several of which were merely busy.

| signal | meaning | action |
|---|---|---|
| 404 / "no endpoints" | the vendor retired it | retire the row NOW, re-resolve the need |
| 429 | transient | cool minutes, not days |
| timeout, repeatedly | it is not `fast` any more | demote its weight class |
| empty / unparseable content | cannot do structured output | clear that task flag |

And any resolution failure should trigger out-of-band discovery for that provider rather than
waiting up to 24h for the tick. **Failure is the highest-quality signal in the system and it
is currently discarded.** A 404 fixing itself immediately would have prevented my entire day.

### 3.4 App config stores needs, not models

```js
FitnessGeek: {
  needs: { dishEstimate: 'structured:fast', dishJudge: 'reasoning:deep' },
  tier: 'auto', allowPaid: true, monthlyBudgetUsd: 2
}
```

`provider` / `model` / `fallbackOrder` stay as an escape hatch — a human override always
beats the resolver — but they stop being how normal routing works.

**This must live in the database, not env.** FitnessGeek put `DISH_JUDGE_MODEL` in
`.env.production` this morning and the variable silently did not exist in the container,
because `env_file` is resolved at container-create time and Watchtower recreates with the old
env (see `apps/fitnessgeek/DOCS/CONTEXT.md`, 2026-09-15). Config in the database is
changeable at runtime, visible in the aiGeek UI, and immune to that whole class of failure.

## 4. Staging

Each stage is shippable alone and each removes a real failure that happened.

1. **Cause-based failure handling** (§3.3). Smallest, highest value: a retired slug stops
   being offered the moment it 404s. No new concepts.
2. **`need` resolution in `feature()`** (§3.1), reading only trustworthy facts — task flags,
   alive/cooling, pricing, app tier. Ignore `performance.*`.
3. **Probe records latency and golden-set score** (§3.2); weight class becomes measured.
4. **App configs move to needs** (§3.4); pins become override-only.
5. **Retire the name-matching in `aiModelCapabilitiesService`** once (3) supplies real data.

## 5. What NOT to do

- **Do not hand-tag 1,336 models.** That is the friction Chef wants removed, and it rots the
  day a vendor renames something.
- **Do not trust `performance.*` yet.** It is string-matching on model IDs and it is
  demonstrably wrong in both directions.
- **Do not put model choice in env vars.** See §3.4.
- **Do not add a second scheduled job.** `aiCatalogJob` already runs hourly and the RUNBOOK
  documents the manual kick; a second spelling of a scheduled job is drift waiting to happen
  (the codebase already retired `syncProviderModels` for exactly this reason).

## 6. Open questions for Chef

1. **Budget per app, or one pot?** `dailyCap` exists per app; `monthlyBudgetUsd` would be new.
   With only OpenRouter funded, one pot may be simpler.
2. **How loud should a demotion be?** When a resolver silently swaps models, does that appear
   anywhere he'd see it, or only in the aiGeek console?
3. **Golden set content.** Three questions per task class is enough to catch "confidently
   wrong", but the questions need writing once and they need to be things a nutrition app,
   a note app and a story app all care about.
