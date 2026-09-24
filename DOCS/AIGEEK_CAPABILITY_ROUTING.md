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
  >
  > **Correction, 2026-09-16.** `vision` now filters too, ahead of the golden set, because the
  > body-composition scan feature needed it and "recorded, not filtered" meant `need:
  > 'vision:*'` silently ranked across every model in the catalog — including ones that
  > cannot physically accept an image. The filter is `AIFreeTier.acceptsImageInput`, read
  > from OpenRouter's `architecture.input_modalities` (`aiCatalogDiscovery.js`'s
  > `openRouterCatalog`) — the only listing this suite reads that states input modality at
  > all. It is a *different kind* of filter than `structured`'s, and deliberately so:
  > sending an image to a model that cannot take one is not a quality question worth ranking,
  > it is a hard API error on every call, so `null` ("this provider's listing never said") is
  > treated the same as `false`, not as "unmeasured, be generous" the way every other field
  > on this page is. The real consequence: groq, cerebras, together, cloudflare, gemini,
  > cohere, ollama and llmgateway's listings say nothing about input modality, so their rows
  > are simply never `vision` candidates today — not a bug, a limit of what those vendors'
  > `/models` endpoints tell us. See `models/AIFreeTier.js` and `aiNeedResolver.js`'s headers
  > for the full reasoning.
  >
  > **The landmine this uncovered, closed the same day.** `config/aiCatalogOverrides.js`'s
  > `deny` list excluded any model id matching `/vision|-vl[-:]/i` from ever becoming a
  > free-tier candidate at all — one layer upstream of the filter above, so a model could
  > satisfy `acceptsImageInput` and still never reach it. That pattern was written when a probe
  > genuinely could not tell a vision-*only* head from a real assistant; it could not tell
  > Qwen's `-VL-` family or an OpenRouter "vision" slug apart from an OCR head either, and
  > caught both. `discover()` in `aiCatalogDiscovery.js` now excepts that ONE pattern — never
  > the other six — when OpenRouter's own listing proves the row both accepts an image and
  > still answers in text (`isDeniedForDiscovery` / `isObservedVisionChatModel`). Every other
  > `deny` pattern (`translate`, `ocr`, `lyria|music`, …) keeps applying to a vision-capable row
  > exactly as before; an id matching two patterns at once (`qwen-vl-ocr`) stays denied on the
  > one that is not vision. See §7.6 for the full account.
  > **Correction, 2026-09-17.** The task axis is now compound-capable: a caller may name
  > more than one task, joined by `+` — `need: 'vision+structured:balanced'` — when the
  > work genuinely needs both at once. See §7.9 for why this replaced an earlier hack
  > where `vision` silently implied `structured`, and why that hack could not be
  > generalised. A single task still behaves exactly as documented above; nothing about
  > the existing single-task callers changes.
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


---

## 7. After the golden set — what the live system taught, 2026-09-16

The plan above was written from reading the code. Everything in this section was found by
running the result against real providers, and none of it was visible any other way.

### 7.1 The bug that made the whole feature inert

`explicitPinOf` splits `"provider/model"` as a convenience for callers that send only a model
string. Applied when a provider was **also** named, it destroyed ids containing a slash of
their own — and Groq namespaces its best models as `groq/compound` and `groq/compound-mini`.
The pin became `compound-mini`, failed `pin_absent`, degraded to the ordinary walk, and served
`allam-2-7b` (0.4).

Those two are the first models the golden set rated 1.0. So **the moment quality routing
started working, it started being discarded at the last step** — with `provenance.need` naming
the 1.0 model and `provenance.model` naming the 0.4 one in the same response, and every layer
reporting success.

The lesson is not about slashes. It is that a chain of correct components can still deliver the
wrong answer, and the only thing that catches it is asking the deployed system what it actually
did. `/openai/v1` was the one caller relying on the old behaviour; it now passes both halves,
which it had in hand all along.

### 7.2 Three depths of defence, because one was not enough

A **music model** — `google/lyria-3-pro-preview` — reached fourth place in the free rotation and
answered three of Chef's requests with prose where he wanted YAML. Four separate things had to be
true for that:

1. OpenRouter's branch of `freeCandidates` was the only one that never applied the modality
   filter. It decided on price and declared output modality, and a model declaring **no**
   `output_modalities` is treated as text — right for a chat listing, wrong for Lyria.
2. The filter ran at listing time only, so adding `lyria` to it did nothing for the row already
   in the table.
3. `fitness` sat below provider priority in the sort, so `basic` rows — ones the probe had
   proved answer in prose — outranked `structured` rows at other providers.
4. Nothing demoted a free row when the listing stopped counting it as a candidate.

Modality is now checked at **listing** (all providers), at **write** (`writeListed` demotes), and
at **selection** (a runtime guard). Fitness is a tier above provider priority. The auto-router
keeps its exemption deliberately: it is a meta-model whose fitness reading is unreliable, and it
is alive whenever any of that vendor's free rows is.

That guard immediately exposed a latent bug in the filter itself: `live` as a bare substring also
matches **alive**, delivery and olive. Harmless while it only chose what to list; as a check on
every pick it would have been a silent outage. It is token-bounded now; the other terms are not.

### 7.3 The catalog and the free-tier list could disagree forever

`AIModel` and `AIFreeTier` describe the same models and `selectFreeTierCandidates` reads **only
the second**. Every correction the job made went to `AIModel` alone, so the row stayed selectable
and the two collections drifted with one of them maintained. Three fixes, all the same shape:
`writeListed` now demotes (one-directionally — a listing must never revive what a 404 retired),
`deactivateUnlisted` demotes too, and `pruneUnconfiguredProviders` removes rows for roster
providers holding no key. One-time effect: AIModel 1336→643, AIPricing 907→492.

### 7.4 Rate limits: knowable for two providers out of nine

Only **groq** and **together** send `x-ratelimit-*`. The other seven send nothing, so for them a
429 is the only signal — that is a limit of what vendors tell us, not of the wiring. What *was*
ours: only the request path recorded those headers, so the ~90 sweep calls a day taught us
nothing and exactly one row in the catalog held a remaining-quota reading. The sweeps record now,
the golden set skips a row the headers say is spent, and it stops after the first 429 instead of
knocking five more times.

It also **paces** itself to a stated ceiling. Cerebras publishes `gpt-oss-120b` at 5 requests per
minute; six questions back to back would 429 after the first and that model could never be scored
at all.

### 7.5 What the scores actually say

| provider | best | fastest | note |
|---|---|---|---|
| groq | **1.0** (`compound`, `compound-mini`) | 196ms | best and fastest |
| ollama | **1.0** (`gemma4:31b`) | 542ms | one live row, and it is excellent |
| gemini | 0.9 | 440ms | strong and broad, but rate-limits hard |
| cloudflare / cohere | 0.6–0.7 | 246ms | reliable breadth |
| openrouter | — | 773ms | weakest free tier; its job is the paid fallback |

Cerebras was tested and pulled: a valid key lists its models and answers **402 on every inference
call**. The published per-model limits are an entitlement once paid, not a free tier.

**The caveat worth keeping.** Estimates still vary by model more than these scores predict —
`gemma4:31b` says 1,100 cal for four pancakes and `compound-mini` says 440, and both score
`calibration=1`, because that question asks about pizza against a 400–800 band. The golden set
measures correctness on known answers; it does not yet predict agreement on arbitrary dishes.

### 7.6 `vision` was a name in the grammar with nothing behind it, 2026-09-16

The body-composition scan feature needed a model that could actually look at an image, and
`need: 'vision:*'` turned out to be exactly the gap §3.1's original correction admitted and
left for later: "recorded, and do not filter." In practice that meant a vision request ranked
across the entire catalog, including every text-only model in it, and would have silently
handed a scan to a model that cannot see it.

**Why this could not wait for the golden set the way `reasoning`/`prose`/`code` can.** Those
three are ranking problems — a wrong guess produces a worse answer. Vision is a hard-capability
problem — a wrong guess produces an API error, on every single call, because the request path
sends the image and the vendor either accepts the whole request or refuses it. That is not a
quality signal to defer until enough data exists; it is closer to `isFree` or `cooling`, a fact
that must gate selection before ranking starts at all.

**The filter and its `null`.** `AIFreeTier.acceptsImageInput` is read once, at listing time,
from OpenRouter's `architecture.input_modalities` (`aiCatalogDiscovery.js`'s
`openRouterCatalog`) — the only listing among the nine providers this suite calls that states
input modality at all. `aiNeedResolver.js`'s `vision` filter requires it to be exactly `true`.
This is the one field in the whole routing system where `null` is deliberately read as "no"
rather than "unmeasured, be generous" — spelled out at length in both files' headers, because
it looks, at a glance, like it violates this document's own "a row that has never been scored
is NOT treated as a bad row" rule. It does not: that rule is about *quality*, where an
unmeasured row still deserves a chance to be measured. There is no equivalent chance here — a
model either accepts an image or the call fails, and nothing about asking more often changes
that answer.

**The real consequence.** groq, cerebras, together, cloudflare, gemini, cohere, ollama and
llmgateway's `/models` listings say nothing about input modality, so every row from those eight
providers carries `acceptsImageInput: null` indefinitely and is simply never offered for
`vision` work — not because those vendors have no vision-capable models, but because nothing in
this suite has ever been told which of their models qualify. Widening this beyond OpenRouter is
future work, gated on a provider's listing actually saying so; guessing from a model's name
would be exactly the mistake §2 documents `performance.*` making.

**A landmine this uncovered, and closed the same day.**
`config/aiCatalogOverrides.js`'s `deny` pattern (`/vision|-vl[-:]/i`) excludes any model id
containing "vision" or "-vl-"/"-vl:" from ever becoming a free-tier candidate at all — one layer
upstream of `acceptsImageInput`, in `discover()`'s call to `isDenied` (`aiCatalogDiscovery.js`).
Written for OCR and vision-only heads that answer but are never a general pick, it also matched
genuinely useful vision-capable chat models: Qwen's `-VL-` family and OpenRouter's `-vision-`
slugs (`meta-llama/llama-3.2-11b-vision-instruct`) among free rows checked live. A model could
satisfy `acceptsImageInput` and still never reach it, because the listing stage denied it first —
this would have shipped a vision feature with, plausibly, zero working candidates.

The fix is narrow, on purpose. `aiCatalogOverrides.js`'s own header explains why the file exists:
"a probe cannot see" whether a model that answers text is a real assistant or a narrow head, so a
human wrote id guesses for the families a probe would be fooled by. That reasoning still holds for
`lora`, `translate`, `safety|guard`, `-code\b|coder` and `lyria|music` — none of those are
observable from a listing, and none of them changed. It stopped holding for the vision pattern
specifically the moment `acceptsImageInput` existed: OpenRouter's listing already states whether a
row accepts an image, and the existing output-text check already proves whether it answers in
text. A row that clears both is *observed*, not guessed, to be a vision-capable chat model.

So `aiCatalogOverrides.js` now exports `VISION_HEAD_PATTERN` as its own name (the file stays a
plain list — no new logic there, still 30 lines), and `aiCatalogDiscovery.js`'s `discover()`
excepts an OpenRouter row from THAT pattern alone when `isObservedVisionChatModel` confirms it —
every other pattern in `deny` still applies unchanged, so `qwen-vl-ocr` (vision AND `ocr`) stays
denied, and a translate/safety/music row stays denied whether or not it happens to accept an
image. The exception is OpenRouter-only by construction, for the same reason `acceptsImageInput`
is: no other provider's listing states input modality, so `isObservedVisionChatModel` is
unconditionally `false` elsewhere and those ids are denied exactly as they always were.

**The limitation worth remembering.** Even with this fixed, vision routing is observable — not
guessed, not broken, but also not general — for exactly one provider. Eight of the nine this suite
calls (groq, cerebras, together, cloudflare, gemini, cohere, ollama, llmgateway) expose no
input-modality data in their `/models` listings, so their rows can never earn `acceptsImageInput:
true` and can never be excepted from `VISION_HEAD_PATTERN` either. `vision:*` today means
"OpenRouter, or nothing" — a real ceiling on the free-tier pool for this feature, not a bug, and
worth knowing before assuming the catalog has more vision coverage than it does.

### 7.7 `vision` implies `structured`, 2026-09-17

The day after §7.6 shipped, the first real discovery ran and put three
vision-capable rows in the catalog. One of them, `nex-agi/nex-n2.5-pro:free`,
carried `fitness: 'basic'` — it declares image input and failed the structured
probe. It was a legitimate `vision:balanced` pick for a call it could not have
completed, because the task axis was a plain either/or: `structured` filtered on
`fitness`, `vision` filtered on `acceptsImageInput`, and neither asked about the
other.

That is §7.6's own fault one layer in. A model that cannot do the job was
outranking one that can — the wording of 57f43912, arrived at from a different
direction.

`scoreRow` now requires both for a `vision` need. The implication runs one way
only: a structured row that cannot see is still not a vision candidate.

The justification is that nothing asks to look at a picture for its own sake.
Every vision caller in this suite hands over an image and wants JSON back; the
body-composition scan reader is the first and sets the shape. A row that sees
the page and answers in prose is not a candidate for the only kind of work
`vision` is requested for.

**If that stops being true** — a caller that genuinely wants prose about an
image, a caption or a description — this is the line to revisit, and the honest
fix is a compound need (`vision+prose`) rather than loosening this one back to
an either/or. The grammar has two axes today because task and weight were the
two decisions that actually differed (§1); a third would need the same argument
made for it.

Cost of the fix: the free-tier vision pool drops from 3 rows to 2, both
`fitness: 'structured'` and both unscored by the golden set.

### 7.8 Vision was barely working for three separate reasons, 2026-09-17

§7.6 and §7.7 made `vision` a real filter. It still routed to almost nothing
live, for three reasons that had nothing to do with the filter itself.

**Modality was recorded on 5 of 83 catalog rows.** `acceptsImageInput` was
written only by `writeAlive`, reached only for a row both probed THIS run
and alive. Live count: 14 OpenRouter rows in `AIFreeTier`, the field set on
5 of them, `true` on 3 — while OpenRouter's own listing described input
modality for all 14, and its live `/models` response named 12 image-capable
rows, 11 of which would route. A row that 429'd on this hour's probe, or
simply wasn't sampled this cycle, lost its vision candidacy until the next
successful one — a measurement gap wearing a capability fact's clothes.

The fix follows straight from the field's own header: modality is
vendor-**stated**, from the listing, not measured, from the probe. So
`writeListed` — which runs for every row a provider listed, probed or not,
alive or not — now carries `acceptsImageInput` onto the `AIFreeTier` row
alongside it, the same restraint `isFree: false`'s demotion already takes:
no upsert, so a row with no document yet still waits for `writeAlive` to
create it once it actually answers something. `undefined` (every listing
but OpenRouter's) leaves the row untouched; `null` (OpenRouter listed the
row and said nothing about modality) is written explicitly, because a row
whose listing stopped saying "image" must lose that claim on the very next
write that reads the listing — `writeAlive` already keeps this rule for the
alive path, and now the listing path keeps it too. `fitness`, `latency` and
`quality` are untouched by this change; they still need a probe, because
nothing about "can this thing produce JSON" or "how fast is it" is written
anywhere but this suite's own listing.

**A capacity blip cost a 6-hour cooldown.** Observed live: OpenRouter
answered HTTP 200 with no `choices` and an error body —
`{"error":{"message":"Upstream error from Nvidia: ResourceExhausted: Worker
local total request limit reached (16/16)","code":502,"metadata":
{"error_type":"provider_unavailable"}}}` — passing an upstream vendor's own
failure straight through. `openaiCompatible.js`'s tolerant read
(`choice.message?.content ?? ''`) turned that into `content: ''`,
indistinguishable from a model that genuinely has nothing to say, and the
request path's `empty_content` handling put the row to sleep for six hours
— the same cooldown a truly dead model earns.

The adapter now checks for this shape (`AdapterError.js`'s
`upstreamErrorEnvelope`) BEFORE the tolerant read, and — only when there are
no `choices` at all — throws a typed `AdapterError` instead of returning
empty text. The embedded `error.code` is trusted exactly as a transport
status would be, when it actually looks like one (`400`-`599`): that is
what lets this specific failure reach `classifyFreeTierFailure` as
`http_502`, which is not in `HARD_FAILURE_STATUSES` and therefore soft —
left alone, same as any other 5xx, rather than the flat six-hour cooldown.
An embedded `404` in the same envelope shape reaches the retirement path
instead, correctly, because OpenRouter ate a real retirement into a 200 the
same way it ate this capacity blip. No numeric code at all falls back to
`unknown`, which is already soft by default. **No new cooldown tier was
added.** `aiFreeTierRouting.test.js` already pins, and has since R130, that
a soft failure leaves a row's health completely alone rather than earning
some shorter cooldown of its own ("putting the row to sleep for six hours
would be an overreaction" — the existing test's words, not new ones) — the
existing hard/soft split already IS the proportional handling this needed;
the bug was that this failure never reached that split, not that the split
was missing a rung. Checked the other four adapters for the same shape:
Gemini, Cohere and Ollama's contracts all fail with a real HTTP status
(nothing in their documented error paths passes a nested failure through a
200), and Cloudflare's existing 402 handling already reads its real
transport status the same way — none of them needed the same fix, because
none of them had the same disease.

**A text feature could still burn the only vision-capable row.**
`fitnessInsightsMorningBrief` — plain text, no image anywhere in it — picked
OpenRouter's vision-capable row through the ordinary free-tier rotation
(nothing about routing keeps a vision-capable row out of a non-vision
caller's hands, nor should it — the row answers text fine), hit the capacity
blip above, and the pre-fix cooldown logic took `vision` down to zero live
candidates suite-wide for six hours over a call that never touched an
image.

**Nothing further was added for this.** The capacity-blip fix above removes
the actual mechanism: the same call, today, gets classified soft and leaves
the row alone entirely, so a text caller hitting a transient failure on a
vision-capable row no longer touches `vision`'s availability at all. What
is left is the case where a vision-capable row fails **hard** — genuinely
gone, credential rejected — and that must still cool or retire the row
regardless of which caller discovered it: a model that is actually dead
must stop being offered to the vision caller too, and there is no way to
"protect" `vision` from that fact except having more than two free rows
that can see, which is a catalog-coverage problem (§7.6's ceiling: `vision`
means OpenRouter or nothing) and not something request-level routing can
paper over. Reserving vision-capable rows away from ordinary callers, or
giving `vision` its own cooldown curve, would be task-scoped cooling wearing
capability-scoped clothes, and was left undone on that basis.

### 7.9 Compound needs replace the vision-implies-structured hack, 2026-09-17

§7.7's fix was correct for exactly one call and admitted as much in its own last
paragraph: "if that stops being true — a caller that genuinely wants prose about
an image — the honest fix is a compound need... rather than loosening this one
back to an either/or." That day arrived the next morning, not because a new
caller showed up wanting prose-about-an-image, but because the shape of the
problem was obviously going to recur: `reasoning` over a document, `code`
generated from a diagram, any pairing nobody has asked for yet. Hard-coding one
compound (`vision` ⟹ `structured`) into `scoreRow` was right once and had no path
to being right twice — the next caller with a two-part need would have needed
its own bespoke `if`, and the one after that another, until the task axis was a
pile of special cases pretending to be five clean options.

**The grammar grew a second dimension instead of another exception.** `need`
may now name one or more tasks joined by `+` before the weight —
`'vision+structured:balanced'` — and `parseNeed` returns `{ tasks: string[],
weight }` rather than a single `task` string. Every consumer
(`scoreRow`, `qualityFor`, `resolveNeed`'s `why`, and the `/feature` route's own
need-parsing and vision no-fallback guard) reads `need.tasks`; there is no
`need.task` left anywhere. A single task behaves exactly as it always has —
every existing caller sends this form, and changing their behaviour was a hard
constraint, not a nice-to-have — because a compound is simply a list of length
one that happens to run through the same code path as a list of length two.

**The filter rule generalised cleanly.** A compound need is a hard AND: every
named task that has a filter (`structured` via `fitness`, `vision` via
`acceptsImageInput`) must pass its filter, and naming a non-filtering task
(`reasoning`, `prose`, `code`) inside a compound must not start filtering on it
just because it appears next to one that does — there is no code path in
`scoreRow` that could make that happen, which is a stronger guarantee than "we
tested that it doesn't." `qualityFor` generalised the same way: the specialist
signal it ranks on becomes the mean of whichever named tasks actually have a
golden-set class score (today, in practice, that is `structured` alone —
`vision` has no class of its own, the six questions never asked a model to look
at anything), averaged with the overall exactly as the single-task case always
was.

**`scoreRow`'s implication came out entirely.** A bare `vision:*` now filters on
`acceptsImageInput` alone, exactly as `structured:*` filters on `fitness` alone
— `nex-agi/nex-n2.5-pro:free` (image input, `fitness: 'basic'`) is once again a
legitimate `vision:*` pick, because nothing about asking to see a picture
promises anything about what comes back in words. Wanting both is now spelled
out by asking for both.

**One caller had to move in the same commit, or removing the hack would have
been a regression wearing a cleanup's clothes.**
`bodyCompExtractionService.js` sent bare `need: 'vision:balanced'` and relied
entirely on the implication — it wants a model that can see the scan report
AND answer in the JSON shape `parseExtractionResponse` expects. It now sends
`need: 'vision+structured:balanced'`, unchanged in every other respect. Every
other `need:`-sending caller in the suite was audited for the same
mistaken-implicit-requirement pattern while this was open (fitnessgeek's
`aiFoodService.js` and `fitnessGoalService.js`); the two callers found asking
for JSON without saying `structured` (`foodParse`, `foodClassify`) or without
saying anything at all (`nutritionGoals`, `mealPlan`) were given honest needs
in the same pass, on the same reasoning `dishEstimate` already used — see the
routing table in this repo's change history for the full caller-by-caller
account. Callers that generate prose with no deterministic fallback
(`aiInsightsService.js`'s seven generators, StoryGeek's `gm`/`aux`) were left
alone: `prose` does not filter, so sending it would add no safety, and
StoryGeek's own `aiService.js` does not forward a `need` field to aiGeek at all
today — widening that is future work, not a same-day fix riding along with this
one.

### 7.10 A need was one attempt, so a soft failure could fail a feature for hours, 2026-09-24

NoteGeek's Compose (`need: 'prose:deep'`) returned "compose unavailable" for hours. Its one
resolved pick was an OpenRouter row whose upstream, Nvidia, answered every call with
`ResourceExhausted: Worker local total request limit` (relayed as `http_502`).

§7.8 made that failure **soft** on purpose — a capacity blip must not cost a row six hours
— and that stays right. The gap was elsewhere: `aiFeatureRunner` turned a resolved need
into a **pin**, and a pin is exactly one attempt in `aiService.callAI`. With nothing cooled,
the resolver kept naming the same top row, and every call failed the same way.

Now a need resolves to a short ranked list (`aiNeedResolver.rankNeed`, `resolveNeed` is its
head, unchanged; `aiService.resolveNeedCandidates` takes up to three, the retry preferring a
different provider as `planFreeTierAttempts` does). The runner tries them in order while the
time spent is under one `timeoutMs`: a fast provider failure falls to the next row that
**also meets the need**; a slow one (a timeout) ends it, so a caller never waits a multiple
of its timeout. `provenance.need.fellBackFrom` names the rows that failed. An explicit pin is
never second-guessed. Still no new cooldown tier: repeated soft failures cost one fast failed
attempt per call, not the feature.
