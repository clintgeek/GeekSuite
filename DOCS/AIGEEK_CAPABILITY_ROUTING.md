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

- **task** — `structured`, `reasoning`, `prose`, `code`, `vision`.

  > **Correction, 2026-09-15, while building stage 2.** This bullet used to read "these map
  > 1:1 onto `capabilities.tasks`, which already exists". Structurally true, and useless.
  > Read the assignments in `aiModelCapabilitiesService.js`: `structuredOutput`,
  > `codeGeneration` and `creativeWriting` are set `true` for *every* model and only ever
  > turned off for whisper and guard names, and `tasks.reasoning` is `false` unless the id
  > contains "70b"/"405b". It is a constant wearing a capability's name, and filtering on it
  > would have felt like capability routing while changing nothing.
  >
  > So the task axis has exactly one member with a measurement behind it: `structured`,
  > which is `AIFreeTier.fitness` — the probe either got JSON out of the row or it did not.
  > The rest are accepted, recorded, and do not filter until the golden set exists. The
  > resolver says so in its `why`, out loud, rather than implying a judgement it cannot make.
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

**The golden set.** Six questions with *known* answers, scored by code — no human, no judge
model, no opinion. The binding constraint is that everything must be mechanically checkable,
which rules out "is this prose good?" and rules in anything with a verifiable answer.

| # | class | what it asks | scored by |
|---|---|---|---|
| 1 | `structured` | messy sentence → exact JSON ("two eggs and a slice of toast for breakfast") | valid JSON? right item count? right quantities? |
| 2 | `structured` | **refusal to invent** — ask for a field it cannot know | returns null rather than a confident fabrication |
| 3 | `numeracy` | "a recipe serves 4 and totals 1,200 cal; how many in 1.5 servings?" | exact match (450) |
| 4 | `calibration` | "roughly how many calories in two slices of pepperoni pizza?" | inside a band (400-800), not exact |
| 5 | `instruction` | "exactly three sentences, none containing the letter e" | regex |
| 6 | `reasoning` | short multi-step question, single verifiable answer | exact match |

Question 2 is the most valuable one for this suite. Hallucinated values are the failure mode
that actually hurt: a model that invented `pancake mix` from a query that never said "mix",
and another that answered `"low_calories": false`. A model that fabricates should lose the
`structured` class however fast it is. Question 4 is literally the judge's job, and is what
separates the model that said 570 from the one that said 1,200 with 200g of carbs.

**Sample, do not sweep.** Six questions across 104 free rows is 624 calls per run, which
would trip the same 429s that broke today's pins. Run the full set on new candidates, on any
model currently selected by a live app need, and on a rotating slice of the rest (~10/day).
That is ~20-30 calls daily with the models that matter kept fresh.

Two details to build in from the start: **scores decay** (a model measured 60 days ago is not
trusted like one measured yesterday), and **record p50 latency from the same runs** — that is
the weight class, measured rather than guessed from "8b" appearing in a name.

Until the golden set exists: route on task flags and measured latency only, and ignore
`performance.*` entirely.

### 3.3 Failure feeds back, by cause

Today a failed sweep cools everything for 30 days uniformly. On 2026-09-15 that cooled nine
OpenRouter models for a month, several of which were merely busy.

**Correction, after reading the code properly.** An earlier draft of this section claimed
failures were cooled uniformly for 30 days and that failure feedback was "currently
discarded". Both were wrong, and the truth is much better:

- `classifyFreeTierFailure` (`models/AIFreeTier.js`) already separates *hard* failures from
  soft ones. A 429, 5xx, timeout or network error is `unknown` and leaves the row's health
  completely alone.
- A 429 is already cooled **for as long as the provider's own `Retry-After` asked**, not a
  flat interval.
- The request path already records hard failures with escalating cooldowns
  (`markFreeTierFailure`), persists them, and re-picks — including carrying a dead sticky
  pick out so the swap is visible.

So the feedback loop exists. Two genuine gaps remained, and stage 1 closes both:

| signal | meaning | action |
|---|---|---|
| 404 / 410 / model_not_found | **the vendor withdrew it** | retire the row NOW — `isActive: false`, reason recorded. Cooling a retirement is a slower way of failing forever. |
| 401 / 403 | this call was refused | cool and retry, unchanged — the model still exists |
| 429 / 5xx / timeout | transient | unchanged; already handled well |

And the gap that actually cost the day: **failure memory only existed for models with an
`AIFreeTier` row.** A paid or pinned model — FitnessGeek's judge is one — had none at all,
so it could 404 on every call forever and nothing would learn. Retirement is now recorded
outside that gate.

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

1. ~~**Cause-based failure handling** (§3.3)~~ — **DONE 2026-09-15.** `isRetirement()` in
   `models/AIFreeTier.js`, `aiService.retireModel()`, recorded outside the free-tier gate so
   paid and pinned models are covered. 17 tests in `aiModelRetirement.test.js`.
2. ~~**`need` resolution in `feature()`** (§3.1)~~ — **DONE 2026-09-15.**
   `services/aiNeedResolver.js`, `aiService.resolveNeed()`, and `need` on
   `POST /api/ai/feature`. Reads only measured facts: `fitness`, `latency.p50Ms`, cooling,
   observed rate limits, `isFree`. Reads neither `performance.*` nor `capabilities.tasks.*`,
   and there are tests asserting that two rows differing only in those fields score the same.

   Three behaviours worth keeping: an explicit pin always beats the resolver; an unresolved
   need falls through to the ordinary rotation rather than failing the turn, with
   `provenance.need.resolved: false` so the caller can tell; and a *malformed* need is a 400,
   because silently ignoring `strutured:fast` would answer from a plausible model and hide
   the typo for months. Free rows only — stage 2 changes nothing about what gets billed.
   25 tests in `aiNeedResolver.test.js`, 7 more on the door.
3. ~~**Probe records golden-set score**~~ (§3.2) — **DONE 2026-09-16.**
   `services/aiGoldenSet.js`: six questions with known answers, scored by code, run from
   the existing catalog tick behind its own **daily** gate (the tick is hourly; six
   questions across four rows is ~24 calls, which is the whole daily budget — ungated it
   would have been 576/day). Quality outranks speed in the resolver, expires after 14 days,
   and an unscored row sits mid-band rather than at zero.

   **Three things the live run taught that the design above did not anticipate:**

   a. **A language check was missing, and it was the decisive one.** Every consumer here
      prompts in English; a reply in another script has not answered the question however
      well-formed it is. It is applied to all six questions rather than being a seventh.
      Nothing else would have caught `allam-2-7b`.

   b. **An errored question is not a wrong answer.** Scoring 429s and timeouts as zero made
      `gemini-3.1-flash-lite` read 1.0 in one run and 0.2 minutes later. Errored questions
      are now set aside, and a run answering fewer than four of six is inconclusive and is
      not written — a bad minute must not overwrite a score earned when the provider was
      healthy.

   c. **Do not rank on the class alone.** Every scored row came back `structured=1`, because
      a row is only asked once `fitness` proved it emits JSON and both structured questions
      are extraction questions. A constant is not a signal. Ranking on it let a model with
      overall 0.4, numeracy 0 and reasoning 0 report "golden set 1 on structured" and keep
      the work. It now ranks on the mean of the class and the overall: a specialist still
      wins inside its class, but nothing broken elsewhere wins on one class alone.

   **Measured effect.** `structured:fast` moved from `groq/allam-2-7b` (overall 0.4, p50
   317ms) to `ollama/gemma4:31b` (overall 1.0, p50 542ms), and FitnessGeek's estimates moved
   with it:

   | said | allam-2-7b | gemma4:31b |
   |---|---|---|
   | 4 chocolate chip pancakes | 500 cal, range 0–1000 | **1100 cal, range 800–1400** |
   | a dozen nachos with beef and cheese | 1200 cal, range 0–2400 | 720 cal |

   The range is the part that matters beyond the number: §3.8's portion question could never
   fire against a model that answers "0 to 1000", and does fire against one that answers
   "800 to 1400".

4. ~~latency~~ — **DONE 2026-09-15**, and
   it turned out `probeRow` had been measuring `ms` all along and discarding it; a revived row
   now stores a five-deep FIFO and its median, and `weightClassOf()` turns that into
   fast/balanced/deep. It returns `null`, not "deep", for a row nobody has timed — the
   resolver has to tell *unknown* from *slow*, or a newly discovered model could never be
   picked, so never timed, so never stop being unknown. Brought forward because stage 2 routes
   on a weight axis and there was no data behind it. The golden set is the remaining half.
5. **App configs move to needs** (§3.4); pins become override-only.
6. **Retire the name-matching in `aiModelCapabilitiesService`** once (3) supplies real data.
   Now unblocked: (3) supplies real data.

## 5. What NOT to do

- **Do not hand-tag 1,336 models.** That is the friction Chef wants removed, and it rots the
  day a vendor renames something.
- **Do not trust `performance.*` yet.** It is string-matching on model IDs and it is
  demonstrably wrong in both directions.
- **Do not put model choice in env vars.** See §3.4.
- **Do not add a second scheduled job.** `aiCatalogJob` already runs hourly and the RUNBOOK
  documents the manual kick; a second spelling of a scheduled job is drift waiting to happen
  (the codebase already retired `syncProviderModels` for exactly this reason).

## 6. Decisions (Chef, 2026-09-15)

**One pot, not per-app budgets.** Only OpenRouter is funded, so a single ceiling is simpler
and there is nothing to apportion. `dailyCap` stays per app as a runaway guard.

**A silent model swap is fine, as long as context survives or the change is not jarring.**
This maps onto machinery that already exists: `AIAppConfig.sticky`. Stateless calls
(FitnessGeek's estimate and judge) may swap freely between calls; anything conversational
sets `sticky` and keeps its model for the thread, and the existing `retiredSticky` handoff
already carries a dead pick out so the replacement is recorded rather than silent.

**The golden set** is specified in §3.2 above.
