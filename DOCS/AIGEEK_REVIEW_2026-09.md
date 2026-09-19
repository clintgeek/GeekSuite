# aiGeek — review findings, 2026-09-19

A full read of aiGeek's backend (~13k lines) and director UI (~5k lines), done in
three parallel passes: routing/catalog, request path, and UI. Read-only; nothing was
changed during the review.

Prompted by *"aiGeek is still all over the map — I think we caused more issues than we
fixed trying to get the visual models working."* That is partly right and partly not,
and §0 settles it before the findings start.

Status column: **open** / **done** / **won't do**. Keep it current as items land.

---

## 0. First, a correction

**The vision path is not dead.** Two reviewers independently checked and found that
`apps/fitnessgeek/frontend/src/pages/ScanImport.jsx` still branches on the sniffed MIME
type: a PDF or image goes to vision extraction, and only the Arboleaf `.xlsx` export goes
to the spreadsheet importer. Both routes are wired in `bodyCompRoutes.js`, both are
offered in the same UI, and `bodyCompExtractionService.js` still sends
`need: 'vision+structured:balanced'` with a real image.

So the vision plumbing — `imageContent.js`, the budget validator, the no-fallback guard,
the `acceptsImageInput` field, compound needs — has a live caller. It is a fallback path
now rather than the only path, but it is not orphaned. **Do not delete it on the
assumption that xlsx replaced it.** If fitnessgeek should become xlsx-only, that is a
fitnessgeek decision to make explicitly, not something to infer from aiGeek's side.

### What the vision burst actually cost and bought

**Bought, and worth keeping regardless of vision's fate:**

- The candidate-projection fix. `acceptsImageInput` was only the third field that
  projection had silently eaten; `latency` and `quality` were the first two, and both are
  read by *every* `need:` call. Now pinned by `aiFreeTierProjection.test.js`.
- Transient-error classification (§7.8). A 200-with-an-error-body was being read as
  "answered with nothing" and cooling the row for six hours. That protected every
  OpenRouter-routed call, not just vision ones.
- Three of the four `JSON.stringify` fallthroughs. Any structured content would have hit
  them.
- Compound needs (`vision+structured`), which generalise beyond vision.

**Cost:** the vision-specific plumbing itself, which is cheap to keep, correctly scoped,
and well documented — but which does add surface area for one fallback caller. And one
new bug, which is finding #1 below, introduced *inside* the fix for the other three.

---

## 1. Bugs and correctness risks

### 1.1 A fourth `JSON.stringify` fallthrough, hiding inside the fix for the other three — **done 2026-09-19**

`apps/basegeek/packages/api/src/services/aiService.js` — `normalizeMessageContent`.

```js
const { images, unrecognized } = partsOf(content);
if (!unrecognized && images.length > 0) return content;   // pass through
return content.map(part => { ... return JSON.stringify(part); }).join('\n');
```

`partsOf` sets `unrecognized` for the **whole array** if any single part fails to match.
So a content array carrying one valid image *plus* one malformed part fails the guard,
falls into the map, and the image's base64 is joined into the prompt as literal text —
the exact failure the three earlier fixes were for.

Every adapter handles this correctly: they check `unrecognized` and raise
`AdapterError('unsupported_content')` rather than stringifying. `aiService` is the one
layer upstream that still has the old shape. `validateImageBudget` does not check
`unrecognized` either, so a malformed mixed request passes the route's own validation and
reaches this live, returning a confident wrong answer instead of the documented 400.

**Fix (small):** `if (images.length > 0) return content;` and let each adapter's existing
check be the single place that refuses.

### 1.2 The vision refusal breaks `/feature`'s documented contract — **done 2026-09-19**

`routes/aiRoutes.js`. The route documents exactly two shapes — `200 {ok:true}` and
`200 {ok:false, reason}` with `reason ∈ cap|unavailable|unparseable|empty|invalid` — and
its header states as a design principle that "a model failure is a 200", so consumers
never parse a 5xx.

The vision no-fallback guard returns `503 {success:false, error:{code:'NO_VISION_MODEL'}}`:
different status class, different envelope key (`success`, not `ok`), and a reason outside
the enum. A consumer branching on `body.ok` gets `undefined`.

Refusing rather than degrading is right (§1.2 of the reasoning stands). The *shape* should
match. **Fix (small):** emit `{ok:false, reason:'no_vision_model', provenance}` at 200, or
document the exception explicitly.

### 1.3 `capabilities.source` is written everywhere and read nowhere — **done 2026-09-19**

`services/aiModelCapabilitiesService.js` — `looksObserved()`.

Both `AIModel.js` and `aiCatalogDiscovery.js` assert in comments that `source` is what
`looksObserved()` uses to tell a measurement from a default. It does not — it only checks
a handful of capability booleans and context sizes. A probe-only write sets
`capabilities.tasks.structuredOutput` and `capabilities.source` and *none* of the fields
`looksObserved` inspects, so a genuinely probe-confirmed row is judged unobserved and
`getCapabilities()` silently falls back to `inferCapabilities()` — the name-string guessing
(`"70b"` → excellent) that the routing doc calls demonstrably wrong.

Related: `capabilities.contextWindow` is never written, though `AIModel.js` claims the
observed value wins where both exist. `aiDirectorService` reads only `contextWindow`, so
the accurate vendor-reported `contextTokens` sitting beside it is never surfaced.

**Fix (small):** add `if (stored.source) return true;` to `looksObserved`; have the
director read `contextTokens`/`maxOutputTokens` directly.

### 1.4 "Suggest a model" ranks on exactly the signals the design doc disowns — **done 2026-09-19**

`ModelStewardBlock.jsx` → `aiRecommendModel` → `aiDirectorService.capabilityFitScore()`.

The admin's one "which model should I pin?" tool scores on `capabilities.performance.*`
and `capabilities.tasks.*`, which come from name-matching and which
`AIGEEK_CAPABILITY_ROUTING.md` §2 calls "demonstrably wrong in both directions". The real
`need:` path moved to measured `fitness`, `latency.p50Ms` and golden-set `quality.score`
on 2026-09-16. The Suggest button did not.

Worse than no ranking, because a numeric "fit 87" chip looks authoritative.

**Fix:** point `capabilityFitScore` at the same measured facts the resolver uses
(**substantial**), or as a stopgap drop the numeric score and the Speed/Quality sort from
the UI until it does (**small**).

### 1.5 `writeDead()` and `runProbe()` disagree about retirement — **done 2026-09-19**

`services/aiCatalogDiscovery.js`. `runProbe` gained an `isRetirement(code)` branch on
2026-09-16 so a vendor-withdrawn model retires instead of cooling. `writeDead` — the
discovery-run path — never got it, and always applies a 30-day cooldown.

A model that 404s on its first discovery probe gets cooled rather than retired. It
self-heals within one probe sweep (≤6h), so the blast radius is small, but it is the same
two-paths-disagree shape the codebase has worked hard to eliminate. No test covers
`writeDead`'s handling of a retirement code.

**Fix (small):** apply the same `isRetirement` check at the `writeDead` call site.

### 1.6 The spend line compares a monthly figure to a one-time credit — **done 2026-09-19**

`aigeek/UsagePanel.jsx` — `const MONTHLY_BUDGET_USD = 10;` rendered as
*"This month: $X of the $10"*.

`spend.monthUsd` is a calendar-month sum that resets. The $10 is a **one-time** OpenRouter
credit purchase — a lifetime balance — per `DOCS/ARCHIVE/AIGEEK_ELEVATION_PLAN.md`. So
"$1.76 of the $10" reads as "$8.24 left this month" when nothing here tracks cumulative
spend against the actual credit, and the framing stays reassuring however low the real
balance gets.

The ceilings the server *does* enforce (`AI_PAID_PER_DAY_USD`, `AI_PAID_PER_CALL_USD`,
defaulting to $0.05/$0.01) are much smaller numbers and are not shown at all.

**Fix (small):** reword to stop implying a monthly ratio. **Substantial** if the intent is
to genuinely track remaining credit — no field exists for it today.

### 1.7 (Landmine, not yet live) the candidate projection omits `isFree` and `override` — **done 2026-09-19**

`aiService.js` — the same hand-copied candidate literal from §0. `exclusionFor` checks
`row.isFree === false` and `row.override === 'deny'`; neither field is on the candidate, so
both checks are permanent no-ops for this caller. Harmless today because the query filters
`isFree: true` and the loop skips denies first — but if that filtering is ever loosened,
two safety checks silently stop working.

**Fix (one-line):** forward both defensively, or comment at the literal that they are
deliberately omitted and why.

---

## 2. Dead weight — safe deletions

| What | Where | Evidence | Status |
|---|---|---|---|
| `POST /api/ai/context/reset/:conversationId` | `aiRoutes.js` | Always returned `{success:true, message:'Context reset queued (Phase 2A½ feature)'}` whatever the input. Zero callers, zero tests. **A caller would have believed context was reset when nothing happened.** | **done** |
| `AI_PROVENANCE_SDL` | `aiFeatureRunner.js` | Its own comment said not to import it; nothing did. Already missing `costUsd`/`hints`. Dropped from the default export too. | **done** |
| `updateModelCapabilities()` / `updateAllModelCapabilities()` | `aiModelCapabilitiesService.js` | Zero callers including tests; the two prose mentions are historical. ~50 lines, plus three imports that became dead only because of it. Rest of the file untouched. | **done** |
| Stale "StoryGeek's epub pipeline calls this" comments | `aiDirectorService.js` ×2, `aiRoutes.js` ×1 | That integration went in Phase 2 — StoryGeek's own service documents the cutover. Live callers are basegeek's own console, via the options-object form. Comment-only; the positional signature was left alone. | **done** |
| `GET /api/ai/usage/:provider` and `/:provider/:modelId` | `aiRoutes.js` | **Reverted — will not delete.** See §2.1. | **won't do** |
| `GET /api/ai/stats`, `GET /api/ai/capabilities` | `aiRoutes.js` | **Will not delete.** `/stats` is covered by a permission-gating test (`aiRoutesGates.test.js`) asserting `ai:stats` reaches it, and both are documented as public routes in `apps/basegeek/DOCS/API_KEYS.md` — intentional operator endpoints, not orphans. | **won't do** |
| `catalogRows.health` | `useAIGeek.js` | Computed and passed, never rendered. Better fixed than deleted: `health.coolingUntil`/`consecutiveFailures` would turn the generic "cooling" tooltip into "cooling until 4:12 PM after 3 failures". | **done 2026-09-19** |

### 2.1 Why `/usage` was spared — and the rule it produced

The routes are genuinely uncalled over HTTP; their own comments say so and a repo-wide
grep agrees. They were deleted, and six tests broke — not "does the route exist" tests,
but these:

    refuses a key minted without ai:usage                        403 -> 404
    admits a key minted with the schema defaults                 200 -> 404
    two sessions asking about the same user get their own answer, not each other's

That last one asserts a caller passing `?userId=<another user's id>` gets their **own**
usage back. Someone deliberately hardened these routes against a cross-user read and
pinned it with a test.

**The rule: "nothing calls it" and "nothing is protected by it" are different claims, and
only the first one grep can answer.** A repo-wide search cannot see an operator with curl,
a monitoring script, or anything outside the tree. Where the reward is a hundred lines and
the cost is deleting tested, deliberate security behaviour, the trade is bad.

`/stats` turned out to carry the same shape — a permission-gating test — which is why it
was investigated rather than deleted. Apply this test to any future deletion here: **before
removing a route, check what its tests are asserting, not just who calls it.**

---|---|---|---|
| `POST /api/ai/context/reset/:conversationId` | `aiRoutes.js` | Always returns `{success:true, message:'Context reset queued (Phase 2A½ feature)'}` whatever the input. Zero callers in the repo, tests included. **A caller today would believe context was reset when nothing happened.** | open |
| `GET /api/ai/usage/:provider` and `/:provider/:modelId` | `aiRoutes.js` | The routes' own comments say nothing in the suite calls them over HTTP; confirmed by grep. The console reads usage via in-process GraphQL. Service methods stay — route deletion only. | open |
| `AI_PROVENANCE_SDL` | `aiFeatureRunner.js` | Its own comment says not to import it; nothing does. Already missing `costUsd`/`hints`, so it is stale as well as unused. | open |
| `updateModelCapabilities()` / `updateAllModelCapabilities()` | `aiModelCapabilitiesService.js` | Zero callers anywhere, including tests. ~35 lines including an upsert. **Do not delete the rest of the file** — `getCapabilities`/`supportsTools`/`supportsJSONMode`/`supportsJSONSchema` are live on the request path and are a different, trustworthy, adapter-derived signal. | open |
| `GET /api/ai/stats`, `GET /api/ai/capabilities` | `aiRoutes.js` | No caller found, but no comment admitting it either — could be operator debug endpoints. **Confirm before deleting.** | open |
| Stale "StoryGeek's epub pipeline calls this" comments | `aiDirectorService.js`, `aiRoutes.js` | That integration was removed in Phase 2 — StoryGeek's own service says so. The only live callers are basegeek's own console, and both use the options-object form, not the positional one the comments justify keeping. | open |
| `catalogRows.health` | `useAIGeek.js` | Computed and passed, never rendered. Better fixed than deleted: `health.coolingUntil`/`consecutiveFailures` would turn the generic "cooling" tooltip into "cooling until 4:12 PM after 3 failures". | **done 2026-09-19** |

---

## 3. Simplifications

### 3.1 `aiRoutes.js` (2176 lines) is four concerns — **open**

Each already has a seam:

- **Conversation API** (~450 lines) — `conversationOwner()` plus five routes, self-contained.
- **Director API** (~250 lines) — thin wrappers over `aiDirectorService`, no shared state.
- **Admin config cluster** (~300 lines) — all `requireAdminUser`, all mutate the `aiService`
  singleton, none feature-routing related.
- **The modern core** — `/feature`, `/models/alive`, plus the legacy-but-alive routes.

`failUpstream`, `applyRoutingSwitches` and `requireAdminUser` are used across all four, so a
split needs a small shared `aiRouteHelpers.js` first. Sizing: conversation and director
extractions **small** each; admin cluster **small-to-medium**.

### 3.2 `useAIGeek.js` (1159 lines) — partial extraction only — **open**

Seven domains, two genuine cross-cutting joins. `appGroups` needs app routing + API keys +
`status.apps`; `catalogRows` needs `aliveModels` + `directorData`. Those are the reason the
rest stays together, and splitting them would be wrong.

But **status/poll, usage stats, provider config and suggest/recommend have no reason to
share a reducer with them** — they could be standalone hooks with no change to either join
selector, cutting roughly a third of the file and making the real coupling visible.

### 3.3 "Try it" cannot test `need:` routing — **done 2026-09-19**

`TestPromptPanel.jsx` sends only `feature`, `user`, optional `schema`, and an optional
pin. There is no `need` field. So the one diagnostic tool built to answer *"given the front
door as configured right now, who answers?"* cannot exercise the mechanism every real
caller now uses. An admin debugging why `dishEstimate` picked a given model has to read
logs instead.

**Fix (small):** add a `need` field, send it instead of the pin when set, and surface
`provenance.need` — already returned.

### 3.4 The catalog table cannot show vision, quality or latency — **done 2026-09-19**

`aiDirectorService.freeTierMap` copies only `{isFree, limits, notes, fitness, probedAt,
observed, health, override}` — it drops `acceptsImageInput`, `latency.p50Ms` and
`quality.score`, the three fields added specifically to replace the untrustworthy ones.

So on the one page meant to prevent exactly this, an admin cannot see which rows can accept
an image, how fast a row answers, or how it scored on the golden set. **Substantial**, and
it starts in the backend.

### 3.5 `StatusNav` jump does not open a collapsed section — **done 2026-09-19**

The `?tab=` deep link dispatches `section/open` before scrolling; the sticky nav's `onJump`
passes the raw scroll function, so clicking "Catalog" scrolls to a collapsed card needing a
second click. The code already solved this once. **One-line.**

---

## 4. Leave alone — deliberate, do not "fix"

- **`capabilities.tasks.*` / `performance.*` unread by `aiNeedResolver`** — deliberate and
  documented at length.
- **The dense `Q45`/`F-23`/`R130`-style inline comments** throughout `aiRoutes.js` and
  `aiService.js` — this is the subsystem's incident log, inline, and most of it is not
  restated in `DOCS/`. If lines move during §3.1, **the comments move with them.** A
  "cleanup" that strips them deletes institutional memory.
- **`useAIGeek`'s single-reducer pattern** — the header's reasoning (a shared shape stops
  the same string being written from two directions, which was the old page's actual bug)
  holds up. §3.2 is a partial extraction, not an indictment of the pattern.
- **`aiFailureEnvelope.js` and `AdapterError.js`** — every branch traces to a real incident.
- **`preprocessContext`'s image-aware summarization skip** — correct as written.
- **`HARD_FAILURE_STATUSES` including `400`** — predates this work; Together's
  dedicated-endpoint models reliably 400 through the serverless path, which is plausibly
  why. Undocumented, so **the doc gap is the finding**, not the behaviour.
- **`AIAppConfig` having no `needs` map** — staged work, not an oversight.
- **The mobile harness does cover the aiGeek page** — four scenes. Thorough, not a gap.
- **`/director/*` overlapping conceptually with `need:` routing** — a consolidation
  candidate for a future project with a caller migration, not something to touch now.

---

## 5. Open question, unresolved

`aiUsageService.checkIfModelAvailable` runs on every `callAI` carrying a `userId` — a
second quota gate on top of row-level cooldown and observed-rate-limit pacing. For API-key
callers `userId` is the key's owner, so it behaves app-wide and looks fine. For a direct
JWT caller it is per human, which would under-count a vendor's real per-account ceiling
under concurrency. Nobody traced how often `callAI` is reached by a bare JWT rather than
through `aiFeatureRunner`. Worth five minutes from someone who knows the call graph.

---

## 6. Suggested order

1. **§1.1** — the fourth fallthrough. Correctness, small, and the same one-line shape as
   the three already fixed.
2. **§1.2, §1.3, §1.5, §1.7** — the remaining small correctness fixes.
3. **§2** — the dead-weight deletions, confirming `/stats` and `/capabilities` first. The
   `context/reset` stub is the urgent one: it *lies*.
4. **§1.6, §3.5, §3.3** — small UI truth-and-usability fixes.
5. **§1.4 + §3.4** — the two substantial ones, related: both are about the director view
   showing measured facts instead of guessed ones.
6. **§3.1, §3.2** — the structural splits, last, when nothing else is in flight.
