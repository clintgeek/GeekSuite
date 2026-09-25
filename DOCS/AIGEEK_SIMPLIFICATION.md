# aiGeek — has this been overcomplicated?

*Analysis, 2026-09-19. Answers a direct question from the owner. Read-only: no
code changed to produce this document. Numbers marked "measured" came from
`AISpend`/`AIUsage`/`AIFreeTier`/`AIAppConfig` on the running `datageek_mongodb`
via the documented read-only pattern in `DOCS/RUNBOOK.md` ("Is it working?"),
queried 2026-09-19.*

## The short answer

**Yes.** aiGeek is roughly 13.8k lines of backend (`services/` + `models/` +
`routes/aiRoutes.js`) plus 4.8k lines of admin UI — about 18.6k lines total —
built to route calls to free-tier LLMs. Measured total recorded spend across
nine days (2026-09-09 → 2026-09-19) is **$0.00125095082 across 406 calls**.
One-tenth of a cent, for nine days of production traffic across the whole
suite.

The root cause is not that anyone built the wrong thing. Every substantial
piece of this system exists because free-tier providers lie, disappear, rate
limit unpredictably, and answer worse than their names suggest — and the
routing doc's own incident log (`DOCS/AIGEEK_CAPABILITY_ROUTING.md` §7) and
this month's review (`DOCS/AIGEEK_REVIEW_2026-09.md`) both document real
production failures that the complexity was built to survive. The complexity
is not accidental. It is also not, at this call volume, obviously worth its
weight.

This document is not a proposal to rewrite anything. It is the ground truth
Chef asked for: what exists, what it is for, what a paid-first version would
look like, what it would cost, and what would be honestly lost.

---

## 1. What aiGeek actually does today

### 1.1 Line counts

```
Backend services (apps/basegeek/packages/api/src/services/):
    205  aiFailureEnvelope.js
    280  aiGoldenSet.js
    313  aiModelCapabilitiesService.js
    376  aiUsageService.js
    399  aiNeedResolver.js
    413  aiFeatureRunner.js
    505  aiRoute.js
    537  aiCatalogJob.js
    835  aiStatusService.js
    873  aiDirectorService.js
   1630  aiCatalogDiscovery.js
   2738  aiService.js
   ------
   9104  subtotal

  services/ai/adapters/:
     91  ollama.js
    103  index.js
    122  cohere.js
    147  cloudflare.js
    272  imageContent.js
    273  gemini.js
    285  openaiCompatible.js
   ------
   1293  subtotal

  10397  services/ TOTAL

Backend models (apps/basegeek/packages/api/src/models/):
     49  AICatalogRun.js
     55  AIPricing.js
     98  AIConfig.js
    101  AIUsage.js
    110  AIStickyPick.js
    116  AISpend.js
    158  AIAppConfig.js
    165  AIModel.js
    377  AIFreeTier.js
   ------
   1229  models/ TOTAL

  2157  routes/aiRoutes.js

 13,783  BACKEND TOTAL (services + models + routes)

Admin UI (apps/basegeek/packages/ui/src/pages/aigeek/ + AIGeekPage.jsx):
     54  apiKeyDraft.js
     54  CollapsedSection.jsx
     65  chipTone.js
     72  StatusNav.jsx
    179  AliveModelPicker.jsx
    187  ModelStewardBlock.jsx
    193  format.js
    246  AttentionPanel.jsx
    275  AIGeekPage.jsx
    371  ProvidersBlock.jsx
    442  TestPromptPanel.jsx
    443  UsagePanel.jsx
    456  CatalogPanel.jsx
    599  AppsKeysPanel.jsx
   1199  useAIGeek.js
   ------
  4,835  UI TOTAL

 18,618  GRAND TOTAL
```

These match the review's stated "~13k backend, ~5k UI" closely enough to trust
both counts. 31 backend test files and 3 dedicated UI test files exercise this
surface (`find … -iname "*ai*"`), which is itself evidence of how much
engineering attention has gone into a system spending a tenth of a cent a
week.

### 1.2 Grouped by what each part is FOR

**Exists because free models are unreliable — this is the bulk of the system:**

| Component | Lines | What it does, and why it only makes sense for free tiers |
|---|---:|---|
| `aiCatalogDiscovery.js` | 1630 | Lists every configured provider's model catalog, filters by modality/deny-patterns, probes each candidate for JSON-emission (`fitness`), classifies probe failures, runs the golden set, writes/demotes/retires/prunes rows. None of this exists to call a model — it exists to find out, continuously, which of ~80+ free rows across 6 providers currently work at all. |
| `aiCatalogJob.js` | 537 | The hourly scheduler for the above: discovery every 24h, re-probe every 6h, golden set gated to once/day (§ comment: "six questions across `GOLDEN_ROWS_PER_RUN` rows is ~24 calls… running it on every tick would be 576 calls a day"). This job would not need to exist if there were one model to call. |
| `AIFreeTier.js` (model) | 377 | The largest model in the schema. `health` (consecutive failures, cooling), `latency` (p50 over 5 samples), `quality` (golden-set score + per-class breakdown), `observed` (live rate-limit headers), `acceptsImageInput`. This entire document is per-row memory needed only because any one of ~80 rows can silently die, slow down, or start lying between one call and the next. |
| `aiNeedResolver.js` | 399 | Scores every candidate row against a `need` (task × weight), because there are enough candidates worth ranking. `scoreRow`/`resolveNeed` walk a list; with one paid model there is nothing to walk. |
| `aiGoldenSet.js` | 280 | Six known-answer questions, scored by code, because `fitness: 'structured'` only proves a row *can* emit JSON, not that the JSON is any good — a distinction that matters across dozens of free rows of wildly uneven quality (`allam-2-7b` answering in Arabic; `nemotron` emitting a literal ellipsis inside JSON). |
| `aiModelCapabilitiesService.js` | 313 | Infers `performance.speed/quality/reasoning` from substrings in a model's *name* ("70b" → excellent) when the vendor doesn't state it. The routing doc calls this "demonstrably wrong in both directions" and `aiNeedResolver` already refuses to read it. It survives only because someone still has to guess at capabilities for free rows the vendor says nothing useful about. |
| Most of `aiStatusService.js` | ~600 of 835 | `providerDeadItems`, `providerListingFailedItems`, `discoveryStaleItems`, `repinnedItems`, `deadPinItems`, `retiredModelItems`, `unroutedAppItems` — an attention dashboard for "which of our ~80 free rows or 9 providers needs a human today." |
| Most of `aiService.js`'s selection logic | ~1000 of 2738 | `selectFreeTierCandidates` (170 lines), `planAutoAttempts` (130 lines, walking multiple candidates with per-row health checks), `selectPaidFallbackCandidates` (57 lines) — the machinery for "try this free row, if it's cooling try the next, if none work fall to paid." |
| UI: `CatalogPanel.jsx`, `AliveModelPicker.jsx`, `AttentionPanel.jsx`, most of `ModelStewardBlock.jsx` | ~1070 | Browsing/picking among ~80 rows, and surfacing which ones need attention. |
| `useAIGeek.js`'s catalog/attention state | a meaningful fraction of 1199 | The hook wiring that keeps the above panels fed. |

**Would be needed whatever you called — provider-agnostic plumbing:**

| Component | Lines | Why it survives any backend choice |
|---|---:|---|
| `aiFeatureRunner.js` | 413 | The front door's fail-soft/quota/provenance contract (`runAIFeature`/`runFeatureCore`). Every caller in §2 depends on this exactly as written; it has no opinion about what answers the call. |
| `aiRoute.js`'s core (`resolveRoute`, `explicitPinOf`, `degradePin`) | ~280 of 505 | Pin-vs-auto resolution and the legacy-vocabulary translation. Needed for any backend with more than zero configuration knobs. |
| `aiRoute.js`'s governor (`paidCaps`, `paidBudgetVerdict`, `estimatePaidCostUsd`) | ~90 of 505 | Spend caps. **More** necessary paid-first, not less — every call now has a real, nonzero cost. |
| `AISpend.js`, `AIUsage.js`, `aiUsageService.js` | 116 + 101 + 376 | The dollar/request ledger and quota gate. Needed regardless of who's answering; already the source of every number in this document. |
| `AIConfig.js` | 98 | Encrypted provider keys. Needed for 1 provider exactly as for 9, just with fewer rows. |
| `AIAppConfig.js`, `AIStickyPick.js` | 158 + 110 | Per-app routing rows and conversational model consistency. Needed regardless; sticky picks matter less when the model isn't disappearing mid-conversation (see §4). |
| `callerIdentity.js` | 314 | App/user identity resolution feeding routing and quota. Provider-agnostic. |
| Adapters (`ollama.js`, `cohere.js`, `cloudflare.js`, `gemini.js`, `openaiCompatible.js`, `imageContent.js`, `index.js`) | 1293 | You need an adapter for whichever vendor(s) you actually call, paid or free. Some of the *defensive* parsing inside them (tolerant JSON-fence stripping, the OpenRouter 200-with-error-body fix from review §7.8) is a vendor-quirk fix that would still apply if the paid fallback stays on OpenRouter, which it already does. |
| `aiFailureEnvelope.js` | 205 | Redacted, typed error classification. Good hygiene for any provider relationship; the specific *quantity* of classification (retirement vs. refusal vs. transient) shrinks a lot when there's one vendor relationship instead of nine. |
| `aiRoutes.js`'s conversation API and `/feature` core | ~750 of 2157 | Per review §3.1, this file is four concerns; the conversation API (~450 lines) and the modern feature door are unrelated to how many models are behind them. |

**Advisory tooling not on the live path at all:**

`aiDirectorService.js` (873 lines) — `recommendProvider`/`capabilityFitScore`
back the admin's "Suggest a model" button. Per review §1.4, it currently
*ranks on exactly the untrustworthy signals the design doc disowns*
(`capabilities.performance.*`/`capabilities.tasks.*`) and is not consulted by
the real `need:` path at all — it is pure UI decoration today, expensive
decoration, and it exists entirely to help a human choose among many free
candidates. With one or two paid models to choose between, this whole class
of tool loses its reason to exist.

---

## 2. Every caller, and what it actually needs

Found by grepping every app for `aiGeekClient.feature(`, `runAIFeature(`, and
`need:` (excluding `apps/basegeek/**` and `apps/fitnessgeek/**` test files, and
excluding the three apps under concurrent edit by other agents — this table
reports what exists on disk, not new analysis of those apps' internals).
Call-volume figures are **measured**, from `AISpend`, 2026-09-09→09-19 (9
days).

| Caller (file) | Feature | Sends `need`? | Parses JSON? | Person waiting? | On failure | Measured calls/9d |
|---|---|---|---|---|---|---:|
| `fitnessgeek/aiFoodService.js:365` | `dishEstimate` | `structured:fast` | yes (schema) | yes, inline estimate | deterministic fragment estimate | 33 |
| `fitnessgeek/aiFoodService.js:497` | `dishJudge` | **no** — explicit provider/model pin via env, or default rotation | yes (schema) | no, background sanity pass | `!result.ok` → entries stand ungraded | 1 |
| `fitnessgeek/aiFoodService.js:578` | `foodParse` | `structured:fast` | yes | yes, search | — | 5 |
| `fitnessgeek/aiFoodService.js:697` | `foodClassify` | `structured:fast` | yes | yes, search | — | 12 |
| `fitnessgeek/aiFoodService.js:802` | `foodScore` | **no** | yes (regex-extracted array) | yes, ranking | `return results` unscored — *"a ranking nicety… `ok: false` here is not worth telling anyone about"* (comment, line ~797) | 3 |
| `fitnessgeek/aiFoodService.js:867` | `foodSanityCheck` | **no** | yes (regex-extracted object) | yes, pre-display check | `{valid:true, issues:[], confidence:'unknown'}` — *"No model, no objection: the results stand as they came from the APIs"* | 2 |
| `fitnessgeek/bodyCompExtractionService.js:270` | `bodyCompExtract` | `vision+structured:balanced` | yes | yes, one-time scan upload | surfaced to user (no deterministic image parse exists) | 3 |
| `fitnessgeek/fitnessGoalService.js:178` | `nutritionGoals` | `structured:balanced` | yes | yes, one-time setup step | falls back to the computed plan | 0 |
| `fitnessgeek/fitnessGoalService.js:238` | `mealPlan` | `structured:balanced` | yes | yes | **no fallback exists** — *"No deterministic fallback exists for a two-week menu, so a refusal is the answer"* | 0 |
| `fitnessgeek/aiInsightsService.js` (×7: brief, summary, correlations, weeklyReport, trendWatch, coaching, chat) | prose | **no** — *"prose does not filter, so sending it would add no safety"* (routing doc §7.9) | no | mixed | `UNAVAILABLE_MESSAGE` placeholder | 0 |
| `basegeek/graphql/glance/briefService.js:314` | `startgeek:brief` | **no** | no (free text, `isUsableBrief` validated) | no — cached daily digest | `deterministicBrief(facts)` | 24 (cap is 3/day; **effectively saturated**) |
| `basegeek/graphql/bujogeek/services/reviewService.js:455` | `bujogeek:review` | **no** | yes (schema) | opt-in gated | `buildFallbackDraft(facts)` | 0 |
| `basegeek/graphql/notegeek/suggest.js:449` | `notegeek:suggest` | **no** | yes (schema) | opt-in gated | `{related: null}` | 0 |
| `basegeek/graphql/notegeek/tidy.js:52` | `notegeek:tidy_markdown` | **no** | no (free text) | yes, user clicks Tidy | returns original content unchanged | 1 |
| `basegeek/graphql/bookgeek/library.js:326,478` | `bookgeek:whatNext`/metadata | **no** | yes (schema) | no, background suggestion | `fallbackPicks(...)` / author-sibling tags | 0 |
| `basegeek/graphql/fitnessgeek/resolvers.js:890` | `fitnessgeek:quickadd` | **no** | yes (schema) | yes, opt-in natural-language logging | deterministic fragment parse | 0 |
| `storygeek/backend/src/services/aiService.js:271` | GM/aux turns | **no** — *"StoryGeek's own `aiService.js` does not forward a `need` field to aiGeek at all today"* (routing doc §7.9) | mixed | yes, live chat | not traced in this pass | not separately visible (see below) |
| **`WindsurfCove`** (external, HTTP door, API key) — **not one of the suite's 8 apps; no reference to it anywhere in this repo** | unlabelled | n/a | n/a | n/a | n/a | **262** |
| Unattributed (`app: 'unknown'`) | unlabelled | n/a | n/a | n/a | n/a | 52 |

**Findings this table produces on its own:**

1. **Most callers send no `need` at all.** Of the ~15 in-repo call sites found,
   only 5 (`dishEstimate`, `foodParse`, `foodClassify`, `bodyCompExtract`,
   `nutritionGoals`, `mealPlan` — six, counting both goal features) send a
   `need`. Every `runAIFeature` caller in basegeek's GraphQL layer —
   StartGeek's brief, BuJoGeek's review, NoteGeek's suggest/tidy, BookGeek's
   what-next/metadata, FitnessGeek's quickadd — routes on the app's
   `AIAppConfig` row alone, with no task/weight signal at all. StoryGeek sends
   none either. This means the capability-routing system built in
   `AIGEEK_CAPABILITY_ROUTING.md` only actually steers a minority of the
   suite's real traffic; the rest rides whatever `auto` picks from the app's
   configured tier.
2. **The single largest source of traffic isn't one of the 8 apps.**
   `WindsurfCove` — registered in `AIAppConfig` (`tier: 'auto', allowPaid:
   false`) but absent from every grep of this repository — accounts for 262 of
   406 calls (64.5%) in the measured window. Whatever it is, it is an external
   consumer of aiGeek's HTTP door, not a GeekSuite product feature, and it
   dwarfs the combined traffic of every in-suite caller. Any paid-first
   decision has to treat it separately: it is not covered by this repo's
   fallback/schema/UX guarantees, and its own prompt sizes (unknown — plausibly
   a coding assistant, which runs much larger prompts than a JSON food-log
   extraction) are not something this analysis can price.
3. **Several shipped features show zero real traffic in nine days**:
   `nutritionGoals`, `mealPlan`, `bujogeek:review`, `notegeek:suggest`,
   `bookgeek:whatNext`/metadata, `fitnessgeek:quickadd`, and all seven of
   FitnessGeek's insight generators. Some of these are explicitly opt-in
   (`natural_language_food_logging` defaults false; BuJoGeek's review checks
   `optedIn`) so zero calls may mean zero opt-ins rather than zero interest —
   but it means the *complexity budget* spent keeping ~80 free rows healthy is
   serving, at most, a handful of features that are actually being called.
4. **Failure handling is already mostly fail-soft and cheap-conscience.**
   Every caller with a real deterministic fallback (`dishEstimate`,
   `foodClassify`, quickadd, review, suggest, whatNext, brief, tidy) treats a
   model miss as a shrug, not an error — which is exactly the property that
   makes moving to a single paid model *safe*: nothing here breaks harder if
   the one call it depends on fails; the fallback path is unchanged either way.
   The two exceptions worth knowing: `mealPlan` has **no fallback at all**
   (a paid-first model that's actually reliable removes its single point of
   failure), and `foodScore`/`foodSanityCheck` are explicitly "not worth
   telling anyone about" on failure — these are the two callers where free tier
   remains perfectly adequate today (see §3).
5. **`aiInsightsService`'s prose generators send no `need` and have zero
   measured traffic.** They are also the callers explicitly exempted from
   `need:` in the routing doc's own words, because "`prose` does not filter, so
   sending it would add no safety." If FitnessGeek's insights page isn't being
   used, that is worth knowing independent of this document — but it isn't
   this analysis's place to say why.

---

## 3. The paid-first design

### 3.1 The front door does not change

This is the load-bearing design property, and it already holds:
`aiFeatureRunner.js`'s `runAIFeature`/`runFeatureCore` and
`aiGeekClient.feature()` (FitnessGeek's own door, mirroring the same contract)
already separate *what a caller asks for* from *what answers it*. Every caller
in §2 keeps calling exactly what it calls today:

```js
aiGeekClient.feature('dishEstimate', { need: 'structured:fast', schema, ... })
runAIFeature({ app, feature, schema, validate, fallback, maxCallsPerDay, ... })
```

Paid-first is a change to what happens *behind* `callAI`, not to this
contract. No caller moves.

### 3.2 What can be deleted outright

Assuming "paid-first" means: one or two named paid models, configured once,
answer the calls that matter, and the self-maintaining catalog of ~80 free
rows across 6 providers goes away as the default path:

| Delete or gut | Lines | Why it stops earning its keep |
|---|---:|---|
| `aiCatalogDiscovery.js` — listing/candidate-filtering/vision-modality/deny-pattern machinery for providers no longer in rotation | most of 1630 | This exists to keep discovering and re-verifying free rows across 6-9 vendors. With a fixed paid model, there is nothing to discover. |
| `aiCatalogJob.js` | 537 | The scheduler for the job above. Gone if there's no catalog to keep fresh. |
| `AIFreeTier.js`'s health/latency/quality-for-ranking machinery | most of 377 | A named paid model needs a much thinner `AIModel`/`AIPricing` entry, not a per-row health/cooling/observed-rate-limit record. |
| `aiNeedResolver.js`'s scoring (`scoreRow`, `resolveNeed`'s candidate walk, `WEIGHT_POINTS`, `QUALITY_POINTS`) | most of 399 | Nothing to rank when there's one candidate per weight class. |
| `aiModelCapabilitiesService.js`'s name-matching inference | most of 313 | Exists only to guess at capabilities free rows don't state; a paid vendor's own docs state them. |
| `aiStatusService.js`'s free-tier attention items (`providerDeadItems`, `providerListingFailedItems`, `discoveryStaleItems`, `repinnedItems`, `deadPinItems`, `retiredModelItems`, `unroutedAppItems`) | ~600 of 835 | Nothing to be dead, stale, repinned, or retired among 1-2 fixed models. |
| `aiDirectorService.js` | most of 873 | Its whole job — help a human choose among many candidates — disappears with 1-2 candidates. Already flagged (review §1.4) as ranking on bad signals and not wired into the live path; this is as much a correctness fix as a simplification. |
| UI: `CatalogPanel.jsx`, `AliveModelPicker.jsx`, most of `AttentionPanel.jsx`, `ModelStewardBlock.jsx`'s fit-scoring | ~1200 | Nothing to browse or triage across ~80 rows. |
| `useAIGeek.js`'s catalog/attention state joins | a real fraction of 1199 | Per review §3.2, these are already flagged as separable from the rest of the hook. |

**Rough total: 5,000-6,500 lines**, depending how aggressively the free-tier
shortlist in §3.4 is kept. That is the headline number: **a plausible third to
a bit more than a third of the whole system**, concentrated almost entirely in
catalog discovery, free-row health tracking, and the admin views built to
supervise them.

### 3.3 What must be kept, and why

Everything in §1.2's "needed whatever you called it" table: `aiFeatureRunner`,
the spend ledger (`AISpend`/`AIUsage`/`aiUsageService`), the governor
(`aiRoute.js`'s `paidCaps`/`paidBudgetVerdict`/`estimatePaidCostUsd` — this
gets **more** important, not less, once every call has a real cost),
`AIConfig`, `callerIdentity`, `AIAppConfig`/`AIStickyPick`, the adapters for
whichever vendor(s) are actually called, `aiFailureEnvelope.js`, and the
conversation/feature routes in `aiRoutes.js`. None of this shrinks
meaningfully in a paid-first world; some of it (the governor, the ledger)
becomes the single most important part of the system, because a bug there now
costs real money on every call instead of nothing.

The golden set — see §4, the owner has set this as a constraint.

### 3.4 What becomes simpler rather than deleted

- **`aiNeedResolver.js`**: keeps `parseNeed`'s strict grammar (`task[+task]:weight`)
  verbatim — it is good design, independent of what answers the call, and
  every existing caller's `need:` string still means the same thing. `resolveNeed`
  shrinks from "score every candidate row" to a lookup: `{fast: 'small-paid-model',
  balanced: 'small-paid-model', deep: 'mid-paid-model'}` per task, maybe 30-50
  lines instead of 399.
- **`aiService.js`'s `planAutoAttempts`/`selectFreeTierCandidates`**: from "walk
  N free candidates with per-row health checks, then reach for the governed
  paid fallback" to "call the pinned paid model; on failure, either retry once
  against a small hand-picked free shortlist (§3.5) or fail soft to the
  caller's own fallback." Plausibly a few hundred lines instead of ~1000.
- **`aiStatusService.js`**: shrinks to "is the key valid, is today's spend on
  budget, is the paid model answering" — the provider-key-hygiene items
  (`keyExpiringItems`, `plaintextKeyItems`, `paidBudgetItems`) already exist and
  are unrelated to free-tier count; they're what's left.

### 3.5 Where free tier still earns a place

Not nowhere. Two callers already treat a miss as a non-event —
`foodScore` ("a ranking nicety… not worth telling anyone about") and
`foodSanityCheck` ("no model, no objection") — and paying for these adds cost
with no corresponding gain in reliability the caller even wants. A small,
**hand-picked** shortlist (not an auto-discovered catalog) is defensible as:

1. The answer for callers like these two, where free-tier quality is already
   good enough and the fallback is already silent.
2. A true emergency path if the paid vendor has an outage — the golden set has
   already identified real candidates worth keeping warm: `groq/compound` and
   `groq/compound-mini` (both scored 1.0, §7.5 of the routing doc) and
   `ollama/gemma4:31b` (also 1.0). Three rows, not eighty, with no discovery
   job required to keep the list current — a human re-checks it occasionally,
   the same way Chef would notice a paid vendor's pricing page changed.

### 3.6 The front-door contract, restated

Unchanged: `POST /api/ai/feature` and `aiGeekClient.feature()` keep their
`{ok, data, reason, provenance}` shape (once §1.2 of the review's own open
findings, `1.2` in particular, are fixed — that fix is already independent of
this document). `need:` keeps meaning what it means. Callers do not move.

---

## 4. What would be LOST

This is deliberately the most rigorous section, because a document that only
lists benefits is not trustworthy.

**The self-healing catalog.** Today, when a vendor retires a model (`404`),
`isRetirement()` in `AIFreeTier.js` retires the row automatically and routing
moves on inside one probe cycle (≤6h), with zero human involvement. This
happened for real: `google/gemini-2.0-flash-exp:free`,
`meta-llama/llama-3.1-70b-instruct:free`, and
`nousresearch/hermes-3-llama-3.1-405b:free` were all silently withdrawn while
still in the catalog (routing doc §2, §3.3). Paid-first with one named model
means a silent vendor-side deprecation, rename, or quiet quality regression
behind a stable-looking model id becomes **Chef's problem to notice**, not the
system's job to route around. There is no automatic "try the next of 80"
safety net once there is one model.

**Multi-provider resilience.** The current system tolerates one provider
having a bad day because there are 6 configured providers and up to 83 free
rows (measured live count: 83 total, 32 groq / 14 gemini / 14 openrouter / 9
cloudflare / 8 ollama / 6 cohere) to fall back through. A single named paid
model is a single point of failure for every caller that depends on it,
unless a second paid vendor or the free shortlist (§3.5) is kept genuinely
warm — which re-introduces some of what §3.2 proposed removing, just at a much
smaller scale.

**The golden set's role changes, and the owner has said it stays.** Today it
runs as a background job, scoring a rotating slice of the whole catalog daily
(`DEFAULT_GOLDEN_HOURS`, gated specifically because "six questions across
`GOLDEN_ROWS_PER_RUN` rows is ~24 calls… running it on every tick would be 576
calls a day"). Its value today is *continuous triage across many unknown
candidates* — catching, for instance, that `allam-2-7b` answers English
prompts in Arabic, or that a model fabricates a `pancake mix` no one mentioned.
**For it to remain useful paid-first, it needs to do a different job**: not
triage among many candidates, but a periodic (weekly, or triggered on any
provider/model change) *acceptance and regression test* against the specific
1-2 paid models actually in use, plus whatever free shortlist survives from
§3.5. The six questions — especially `refusal` (does it fabricate?) and
`calibration` (is its estimate in a sane band?) — are not free-tier-specific
checks; a paid frontier model is not inherently immune to a vendor silently
swapping what sits behind a model id, and this suite has already measured that
a paid OpenRouter row is treated as just another rankable candidate today
(`fitnessgeek:dishjudge`'s one recorded call went through OpenRouter, paid,
$0.00012933). The discipline "measure, don't assume" is worth keeping
regardless of who's being measured.

**The incident knowledge in §7 of the routing doc, and inline comments
throughout `aiRoutes.js`/`aiService.js`.** Review §4 is explicit that these
must not be mistaken for accidents or stripped during a cleanup. Several of
them are *not* free-tier-specific and would still protect a paid-first system:
the OpenRouter 200-with-an-error-body fix (§7.8 — an upstream vendor's own
capacity error passed through as an empty successful response, wrongly cooling
a row for six hours) applies to any OpenRouter-routed call, paid or free,
including the paid fallback already in production use. Deleting the adapter
code that encodes this lesson to "simplify" would reintroduce a bug already
paid for once.

**A real, if modest, ongoing dollar cost appears where there was none.** See
§5. Free tier's actual advantage is not reliability — it is currently $0 doing
work that reliability infrastructure exists to protect. Paid-first trades a
now-nonzero but small monthly bill for a large reduction in what has to be
independently kept alive.

**Everything on the review's §4 "leave alone" list stays exactly as
deliberate as it already is** — `capabilities.tasks`/`performance.*` staying
unread by the resolver, `HARD_FAILURE_STATUSES` including `400`,
`preprocessContext`'s image-aware summarization skip, `useAIGeek`'s
single-reducer pattern, the mobile harness's aiGeek coverage. None of these
are arguments against paid-first; they are reminders that "simplify" and
"the free-tier machinery is now smaller" are not the same instruction, and a
future implementer should re-read that list before touching any of it.

**Operator visibility shrinks in exactly the place it should.** Today Chef can
open the admin console and see which of ~80 free rows are alive, cooling, or
retired, and why. Paid-first removes most of the *reason* to need that view —
but the parts that must not regress (is my key valid, what did today cost, is
the paid model actually answering) are already served by `AppsKeysPanel.jsx`
and `UsagePanel.jsx`, which are provider-agnostic today and need no rewrite.

---

## 5. Cost

**What's measured.** `AISpend` (2026-09-09 → 2026-09-19, 9 days, 40 bucket
documents): **406 calls total, $0.00125095082 total cost.** Breakdown by
app:feature:

```
startgeek:brief            24 calls   $0.00000183   (cap 3/day — essentially saturated)
windsurfcove (unlabelled) 262 calls   $0.00001491   (NOT one of the 8 suite apps)
fitnessgeek:dishestimate   33 calls   $0.00109481   (includes 8 paid OpenRouter calls)
fitnessgeek:foodclassify   12 calls   $0.00000271
fitnessgeek:foodparse       5 calls   $0.00000058
fitnessgeek:foodscore       3 calls   $0.00000044
fitnessgeek:bodycompextract 3 calls   $0
fitnessgeek:probe           8 calls   $0.00000005   (health-check pings, not a feature)
fitnessgeek:foodsanitycheck 2 calls   $0.00000022
fitnessgeek:dishjudge       1 call    $0.00012933   (paid, OpenRouter)
notegeek:tidy_markdown      1 call    $0.00000098
unknown (unattributed)     52 calls   $0.00000509
```

The two real paid calls in this ledger are the best anchor available:
`dishestimate` via OpenRouter, 8 calls for $0.0010908 (**$0.000136/call**), and
`dishjudge` via OpenRouter, 1 call for $0.00012933. Both are small
JSON-extraction prompts (a few hundred tokens each way, `maxTokens: 700` and
below).

**Assumptions, stated plainly.** I do not have per-call token counts —
`AIUsage`'s per-model cost detail returned no rows for the paid calls queried,
so I cannot separate input from output tokens for these two calls. What
follows scales the measured per-call cost by published list-price *ratios*
between model tiers, not by a second measurement, and uses illustrative rates
as of this assistant's January 2026 knowledge cutoff — **verify current
pricing before budgeting against this**:

- **Small/fast model class** (roughly $0.15-0.30/1M input tokens,
  $0.60-1.25/1M output — the class the suite's short structured-extraction
  calls would use): consistent with the $0.000136 already measured for
  `dishestimate`.
- **Mid model class** (roughly $2.50-3/1M input, $10-15/1M output — for
  `deep`-weight or judge-style calls with more context): call it 10-20x the
  small-model rate per token, so **$0.001-0.003/call** for a similarly small
  prompt, more for anything with a bigger context window.

**Suite-only volume** (excluding `windsurfcove`, which is not one of the 8
apps): 84 tagged calls + 52 unattributed over 9 days ≈ **9-15 calls/day**.
At small-model rates that is roughly **$0.001-0.005/day → $0.03-0.15/month**.
At mid-model rates for the handful of `deep`/judge-style calls mixed in, still
well under **$1/month**.

**Including `windsurfcove`** (262 calls/9d ≈ 29/day) would roughly triple
total call volume to ~40-45/day. Whether that belongs on a paid model at all
is a separate decision — it is not one of the suite's 8 apps, this analysis
has no visibility into what it actually sends (a coding-assistant tool's
prompts run far larger than a food-log extraction), and moving it to paid
without first measuring its own token sizes would be a guess dressed as a
number. **Recommendation: measure `WindsurfCove`'s actual usage before
including it in any paid-first decision; do not extrapolate its cost from
FitnessGeek's food-parsing prompts.**

**Bottom line.** At every volume this analysis can actually measure, paid-first
for the suite's own features costs cents to a few dollars a month, not a
budget line. The $0.00125/9 days figure is not evidence that paid access would
be expensive — it is evidence that the whole system, free or paid, processes a
strikingly small number of calls, which changes the comparison from "can we
afford paid" to "is 13.8k+4.8k lines of reliability machinery worth
maintaining to save under two dollars a month."

---

## 6. A staged path

Each stage is independently valuable and independently abandonable — none
requires the next to have already shipped, and stopping after any one of them
leaves the system strictly better than today, not half-migrated.

### Stage 1 — flip the default for the calls that actually matter (reversible, config-only)

For the callers in §2 where a person is waiting and a real fallback already
exists (`dishEstimate`, `foodParse`, `foodClassify`, `startgeek:brief`, which
is already saturating its free-tier cap at 24/27 possible calls) point
`AIAppConfig`'s routing row at a single named cheap paid model as the primary
choice — `tier: 'specific'`, or a small change to try the pinned paid model
before the free walk rather than after. No line of `aiCatalogDiscovery.js`,
`aiNeedResolver.js`, or the UI needs to change. Cost per §5: a few cents a
month. Fully reversible by flipping `allowPaid`/`tier` back. **This alone
captures nearly all of the "paid model handles the work that matters" goal**
for the features that actually have live traffic, at a cost too small to
budget.

> **Status 2026-09-24: done for NoteGeek and FitnessGeek.** Taken as the "small change"
> variant, not `tier: 'specific'` — a pin is planned unpaid and skips the governor. Routing
> rows gained `paidFirst`, `paidProvider` and `paidModel`: that model is tried first as a
> governed paid attempt, then the free walk. For `need:` calls the runner makes a paid-only
> call and then goes to the need's own picks. Both rows point at
> `openrouter/openai/gpt-4.1-mini`, with caps of $0.05/call and $0.50/day. Every other app is
> still free. Tests: `__tests__/aiPaidFirst.test.js`.

### Stage 2 — shrink the catalog to a shortlist, and re-scope the golden set

Once Stage 1 has run long enough to trust the spend numbers, retire the
full 6-provider/~80-row auto-discovery to a hand-picked shortlist of 2-4 free
rows already known to be good (`groq/compound`, `groq/compound-mini`,
`ollama/gemma4:31b` — all golden-set 1.0 today) for the emergency/no-cost path
identified in §3.5, and change the golden set from an hourly-gated daily sweep
to a periodic acceptance test against the paid model(s) plus that shortlist.
This is where the real line-count reduction happens: most of
`aiCatalogDiscovery.js`, most of `aiStatusService.js`'s attention items,
`CatalogPanel.jsx`/`AliveModelPicker.jsx`/`ModelStewardBlock.jsx`'s
fit-scoring. If Chef decides partway through that the free tier is still worth
its complexity for some app, **stop here** — the shortlist approach and the
full catalog can coexist per app via `AIAppConfig`.

### Stage 3 — simplify the resolver and the request-path candidate walk (do last, if ever)

Collapse `aiNeedResolver.js`'s scoring into a lookup table and correspondingly
trim `aiService.js`'s `planAutoAttempts`/`selectFreeTierCandidates`. This is
the highest line-count deletion remaining but also the most invasive: it
touches the exact code path every one of the ~15 callers in §2 depends on,
and per review §4, this codebase's dense inline comments *are* its incident
log — every deletion here has to carry its lesson forward (§4 above) or a
previously-fixed bug quietly comes back. Worth doing only after Stages 1-2
have held up under real traffic for a real quarter, not on day one.

### Probably never worth doing

Removing the adapters' defensive parsing (`openaiCompatible.js`'s tolerant
reads, the OpenRouter 200-with-error-body fix, `imageContent.js`,
`aiFailureEnvelope.js`), or removing the spend ledger and governor. These
protect against vendor-response quirks that a paid vendor exhibits as often as
a free one, and the governor becomes *more* load-bearing, not less, once every
call costs real money. Nothing in this document argues for touching them.
