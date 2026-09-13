# aiGeek — from hand-fed to self-tending

Plan, 2026-09-07, Sage for Chef. Revised same day after Chef's decisions (below). Nothing here is
built. Sources: four read-only audits of `apps/basegeek/packages/api` (services, routes, models,
scripts), `packages/ui/src/pages/aigeek`, every consumer across `apps/`, the basegeek DOCS, and a
live look at models.dev and OpenRouter's `/models`, limits and privacy docs.

## Chef's decisions, 2026-09-07

- **Anthropic is out.** No credit, no longer available. It comes out of the roster the way `llm7`
  and `onemin` did in phase D. Fitnessgeek's meal plan hard-pins it and is broken today.
- **Model ids are not sacred.** Any pinned model can and should change when the catalog does. No
  human types a model id anywhere, including consumer env vars.
- **OpenRouter is the spine.** Chef buys $10 once. That lifts free models to 1,000 requests a day
  for the life of the account, and the $10 balance covers the rare paid overage. The target is to
  never spend another dime after that.

## The one-sentence diagnosis

aiGeek is clunky because it **declares** what the outside world looks like instead of **observing**
it. About 3,100 lines of the subsystem are hand-typed claims (model lists, capability matrices,
prices, quotas) about vendors who change their minds monthly, and the only thing that keeps them
honest is Chef running `docker exec … discover-free-models.js` by hand.

The fix is not a rewrite. The good half already exists and is already automatic: row-level
free-tier health (`AIFreeTier.health`), the probe engine (`probe-free-tier.js`), the one-door
runner (`aiFeatureRunner.js`), the failure envelope, the auth gates, the tool translators. The plan
is to make that half the whole, and delete the half that has to be fed.

With OpenRouter as the spine the job gets easier still: OpenRouter already *is* the aggregator that
aiGeek was trying to be by hand. Its `/models` listing carries price, context length and
`supported_parameters` (structured outputs, tools) per model, machine-readable, and
`openrouter/free` is a free auto-router that stays alive as long as any free model does.

## Numbers that matter

| | |
|---|---|
| Server lines in the AI subsystem | ~16,200 (12.4k src + scripts) |
| Hand-typed tables about vendors | ~3,100 |
| Dead or dry-run scaffolding | ~1,900 (a second routing stack nobody calls, plus 9 folklore scripts) |
| Load-bearing logic worth keeping | ~2,500 |
| Admin UI fixed controls | ~88, before per-row multiplication |
| Ways a caller can say "where should this go" | 11 |
| Edits to add one provider today | ~17 across 10 files |
| Commits on AI files, last 90 days | 27, mostly free-tier firefighting |
| Scheduled jobs that keep the catalog current | 0 |
| OpenRouter free models today | 19, behind one auto-router id |
| OpenRouter free cap after the $10 | 20 req/min, 1,000 req/day |

## Principles

1. **Observe, don't declare.** A provider's own `/models` endpoint is the catalog. A probe under
   *our* account is the only truth about "free" (free tier is an account property, not a price:
   Gemini's free tier is a rate-limited tier on a paid model). Rate-limit headers on real calls are
   the quota. The request path's health tracking is the memory. If a human typed it and a vendor
   can change it, it becomes something the system observes on a schedule.
2. **OpenRouter first, the rest as bonus quota.** `openrouter/free` is the default first candidate.
   Groq, Cerebras, Gemini, Cloudflare, Together, Ollama Cloud and LLM Gateway stay as extra free
   capacity above OpenRouter's 20/min and 1,000/day, ranked by the same probe. They cost nothing
   to keep once nobody has to feed them.
3. **Money has a governor.** Paid calls happen only through OpenRouter, only when every free row is
   exhausted or cooling, only for features that opt into it, under a daily paid cap, and under a
   hard per-key spend limit set in the OpenRouter dashboard. Two layers, so a bug in ours cannot
   drain the balance.
4. **One front door.** `auto` (health-ranked free tier, then the governed paid fallback if the
   app's routing row permits) or an explicit `pin`. Everything else is a hint on `auto`.
5. **Pins are roles, not ids.** A consumer that needs stability (StoryGeek's GM) asks for a role
   and gets a *sticky* pick: chosen once per story from the alive list, kept until it dies, then
   re-chosen and flagged. Nobody types `gemini-flash-latest` again.
6. **Every feature fails soft.** The runner's contract (routing row, daily cap, deterministic
   fallback, provenance) is the norm, over HTTP too, not just in-process.
7. **The admin page is a status page.** Three panels. Opened monthly. Nothing on it is a chore.
8. **Carry the comments forward.** The F-xx / Q-xx / R130 incident notes are the most valuable
   asset in the subsystem. Deletion is fine; amnesia is not.

## What runs itself when this is done

- **Nightly discovery.** OpenRouter: read `/models`, take `pricing.prompt == "0"` as free and
  `supported_parameters` as capabilities, keep `openrouter/free` pinned as row one. Every other
  provider with a key: fetch `/models`, keep chat-capable rows, probe each candidate live (a plain
  question and a JSON-schema question, 8-token budget), upsert alive rows as free, cool dead ones.
  Runs on boot if the catalog is older than 24 h.
- **Six-hourly re-probe** of rows currently marked alive.
- **Quota learning.** Every real call writes `x-ratelimit-*` headers back into the row. No more
  static RPM/TPM tables (today there are three, and they disagree: Groq TPM is 6000, 12000 and
  18000 depending on which file you read).
- **Spend metering.** Every OpenRouter call asks for `usage` in the response and books the cost
  against a per-day paid budget. Free rows book zero. The status page shows dollars spent this
  month and dollars left, computed from our own ledger, no management key needed.
- **Auto-repin.** A sticky role pick whose model dies is re-chosen from the alive list and lands in
  the needs-attention list. Today a dead pin errors to the user forever.
- **Onboarding a provider** = paste a key. Discovery runs immediately; the page says "N models
  alive". No Enable switch, no Test button, no Sync button, no Save-all.

## Budget: how $10 lasts

- **Hard ceiling, outside our code.** In the OpenRouter dashboard, give aiGeek's key a credit
  limit (start at $5, leave $5 unassigned). Even a runaway loop stops there.
- **Soft ceiling, in our code.** A `paidBudget` in the routing defaults: `perDayUsd` (start at
  $0.05) and `perCallMaxUsd` (start at $0.01). A paid attempt is skipped, not queued, when either
  would be exceeded; the feature then falls to its deterministic fallback like any other free-tier
  miss. At $0.05 a day the $5 lasts 100 days *if it is hit every single day*, which the free tiers
  should make rare.
- **Which paid models.** Never a human's pick. The discovery job ranks OpenRouter's paid rows by
  price per million tokens, keeps the cheapest few that report `structured_outputs`, and those are
  the paid fallback set. Today that is a fraction of a cent per Ask.
- **Who may spend.** `allowPaid` is per routing row, default **off**. Turn it on only for features
  where a fallback is materially worse than a short delay. Candidates: StoryGeek GM turns. Ask,
  brief, review draft, quick-add and suggestions all have good deterministic fallbacks and stay
  free-only.
- **The 1,000/day tier is a lifetime property**, tied to having purchased $10 once, not to the
  balance. Spending the balance down does not lose it.

## Phases

Each phase ships on its own via push-to-main. Order is by risk and dependency.

### Phase 0 — Stop the bleeding (S, one session)

Deletion, two bug fixes, and one repair for a feature that is broken today.

- **Remove Anthropic** the phase-D way: roster row, `callClaude`/`anthropicMessagesFrom` adapter,
  `AIConfig` row, the five schema enums, `JSON_SCHEMA_SUPPORTED`, pricing and capability blocks,
  and extend the `aiDeadProviders` tripwire so it cannot come back by accident. Keep the tool
  translation code in git history; it was good work.
- **Unpin fitnessgeek's meal plan** (`fitnessGoalService.js:82,100`): drop `provider:'anthropic'`
  so it routes through the app's row. It fails on every call today.
- Delete the second routing stack: `aiRouterService.js`, `aiBalancerService.js`,
  `aiHealthJobService.js`, `aiTaskDetector.js`, `providerRotationService.js` (0 bytes),
  `families.json`, `test-phase2a-*.js`; `callAISmart` and the `/call-smart`, `/families`,
  `/provider-health` routes; `PROMPT_STRATEGIES` (fold Cerebras' one live strategy into its
  adapter as a literal). This also drops the Redis dependency and a 60-second job that logs
  "✓ Cleared cooldown" forever without clearing anything (`aiHealthJobService.js:105-117` mutates
  a local copy). It still health-checks `llm7` and `onemin`, deleted in September.
- Strip `aiRouting.json` to the keys anyone reads, or fold them into env.
- Delete the root folklore scripts: `update-ai-catalog.js`, `fix-models.js`,
  `setup-onemin-provider.sh` (would insert a provider the enum now rejects), `check-db-keys.js`,
  `debug-api-keys.js`, `packages/api/test-production-ai.js`, `debug-ai-config.js`.
- Fix `aiRoutes.js:786` to report the provider that answered, not the default.
- Fix `openaiProxy.findModelOwner` (10 Mongo queries per bare model id) to one indexed `findOne`.
- Stop `seedInitialModels` re-stamping retired ids `isActive:true` on every boot; it defeats the
  24-hour staleness sweep.
- Delete `aiModelCapabilitiesService.getModelsForTask` (zero callers; populates paths the schema
  doesn't declare, would throw under mongoose 8).

Net: about −2,400 lines.

**Shipped 2026-09-07, with three deviations from the list above.** (1) `callAISmart` survives as a
57-line shim over `callAI`: `POST /api/ai/conversation/message` still calls it on both branches and
three test files pin the `{success, content, routing}` shape (Q46). Phase 2 folds it into the
feature door. (2) The Cerebras "tool-decisive" prompt preamble was deleted, not folded: it was a
codeGeek-era coding-agent instruction block ("read THE_STEPS.md, don't ask permission") appended to
every Cerebras system turn, and it mutated the caller's array so it leaked into whichever provider
answered next. (3) Three more one-off scripts went with the folklore sweep:
`scripts/{switch-to-claude,update-all-provider-models,update-cerebras-model}.js`. Also fixed on the
way: `/parse-json` had the same default-provider reporting bug as `/call`; `aiDeadProviders.test.js`
now checks code lines only, so an incident comment may name a retired provider and code may not.
`aiRouting.json` had no surviving reader and was deleted outright.

### Phase 1 — The steward becomes a job (M–L, two to three sessions; this is the point)

- Promote `discover-free-models.js` + `probe-free-tier.js` into an in-process scheduled service
  (`aiCatalogJob.js`): nightly discovery, six-hourly re-probe, boot catch-up. Keep the scripts as
  thin CLI wrappers over the same functions for RUNBOOK use.
- **OpenRouter discovery reads the listing.** Free = zero price. Capabilities = `supported_parameters`.
  `openrouter/free` is row one, always. The cheapest few paid rows with `structured_outputs` form
  the governed paid fallback set. No probe needed for capability; a single alive probe still runs so
  the row carries `health` like every other.
- **Replace the name heuristics with a behaviour probe** for the other providers. The 30-term
  `NOT_GENERAL` regex and the per-provider `freeCandidates` rules are the most brittle lines in the
  subsystem. A model that answers a plain question with a sentence and a JSON-schema question with
  valid JSON, within budget, is a general assistant regardless of what its id says. Keep a tiny
  hand-curated allow/deny override file for genuine exceptions. Probe treats empty text and
  non-JSON-when-asked as dead (closes the gpt-oss blind spot noted in CONTEXT.md).
- Learn quotas from `x-ratelimit-*` headers on every real call into `AIFreeTier.freeLimits`. Delete
  `aiService.rateLimits`, `rotationManager.PROVIDER_LIMITS`, `ROTATION_PRIORITY`, the `AIUsage`
  freeLimits snapshot, and `rotation-state.json` (per-container file state that resets on deploy).
  Rotation priority derives from `aiProviders.js` `rotationPosition`, which already exists.
- **Spend ledger.** OpenRouter calls send `usage: { include: true }`; the response cost is written
  to `AIUsage` per app and feature and to a daily paid-budget counter. The governor from the Budget
  section reads that counter.
- Delete the hand-typed tables: `aiModelCapabilitiesService.knownCapabilities` (~1,210 lines),
  `seedInitialModels`, `seedFreeTierInformation` (~410 lines), `seedInitialPricing`,
  `providerPricing`, and their admin routes. Keep `inferCapabilities` as the fallback capability
  source for providers whose listings say nothing, plus a small adapter-facts file
  (`TOOL_FORWARDING_PROVIDERS`, `JSON_SCHEMA_SUPPORTED` are facts about our adapters, not about
  models, and belong beside the adapters).
- Retire RUNBOOK §12's manual ritual; replace with "look at the status page".

Net: about −3,300 lines, one new ~500-line job, and the maintenance burden gone.

**Shipped 2026-09-07.** Design of record: `apps/basegeek/DOCS/AIGEEK_CATALOG_JOB.md` (kept current
by the build). Deviations worth knowing: `aiService.rateLimits` is an empty map filled only by live
429s (deleting the property broke a route and a test helper); the OpenRouter adapter sends
`usage: { include: true }` (documented, harmless) and records `costUsd: null` when unreported so
"unknown" is never "free"; `AISpend` retries once on a duplicate-key race; the deny list gained a
`-vl` vision pattern; the capabilities service carries a `looksObserved()` guard until one discovery
run has stamped `capabilities.source` on every active row. Found on the way: the director had been
inferring capabilities 100% of the time (it read a projection that never carried them), and
`updateStats` compared a Date to a string so its usage branch never ran. `/capabilities` now reports
only a live 429 cooldown; `/providers` dropped the blended per-1K cost field (no consumers).

### Phase 2 — One front door (M, two sessions; touches fitnessgeek and storygeek)

- Collapse the 11 routing modes in `callAI:1650-1872` to `auto` and `pin`. `tier: free | rotation`
  become hints on `auto`; `basegeek-*` aliases map onto them; the legacy auto-trigger in
  `aiRoutes.js:665` goes. `auto` walks: alive free rows by health rank, then, if the row has
  `allowPaid` and the governor agrees, the paid fallback set, then the feature's fallback.
- **Sticky role picks.** A routing row may carry `sticky: per-conversation`. The first `auto`
  resolution for a conversation id is remembered on the conversation and reused until that model
  cools; then it is re-chosen and the change is flagged. This is what StoryGeek's GM gets instead
  of `STORYGEEK_GM_PROVIDER/MODEL`. Those two env vars come out of storygeek's `.env.production`.
- Expose the runner contract over HTTP (`POST /api/ai/feature`: app from credential, feature,
  messages, optional schema, timeout, conversation id, and back: `{result, source, provider,
  model, cached, costUsd}`). Keep `/openai/v1` verbatim for OpenAI-SDK clients (CodeGeek, geekPR).
  Deprecate `/api/ai/call` for real.
- Migrate fitnessgeek's three axios wrappers and storygeek's `callBaseGeekAI` to the feature door.
  Both currently 500 to the user on any failure with no fallback; this buys them fail-soft and
  provenance. Fitnessgeek's legacy REST food-parse path also gains the opt-in check the GraphQL
  quick-add already has. StoryGeek's epub export drops the director round-trip and uses `auto`.
- **StoryGeek's player picker** stays, sourced from the alive list, default "automatic". A player's
  choice is a `pin` for that story, and a dead pin degrades to the sticky auto pick with a notice
  rather than a failed turn.
- Adapter registry: `services/ai/adapters/{openai-compatible,gemini,cohere,cloudflare,ollama}.js`.
  Groq, Cerebras, Together, OpenRouter and LLM Gateway become descriptor rows over one
  OpenAI-compatible function. Each adapter returns a structured `{status, code}` instead of the
  regex-parsed `"<Name> API error (status)"` string that `aiFailureEnvelope.js:92` depends on
  today. Adding a provider becomes one descriptor beside `aiProviders.js`.
- Import `PROVIDER_IDS` into the five schema enums that re-type it.
- `aiDirectorService` becomes a thin indexed read over `AIModel`/`AIPricing`/`AIFreeTier`. Today
  every director call re-fetches every vendor's `/models` list. Keep the ranking logic; the
  steward tests pin it.

Net: `aiService.js` from 3,562 to roughly 1,100 lines.

**Shipped 2026-09-07.** Design of record: `apps/basegeek/DOCS/AIGEEK_FRONT_DOOR.md`. As built:
`resolveRoute` in `aiRoute.js` is pure and table-tested over every legacy input; a request pin
outranks a row pin; `allowPaid` comes only from the row and any free signal vetoes it. A pin
degrades to `auto` (hint `pin_unavailable`) on a cooling row, an inactive model, or an id missing
from a provider's observed catalog; a wholly unknown id is still attempted, because an observed
catalog is incomplete by construction. The governor refuses on an unpriced row and on an unreadable
ledger as well as on the two caps. The feature door accepts `provider`+`model` (both or neither),
and an opaque `quotaKey` used only as the cap bucket for service-key callers (default cap 200/day,
row-overridable via `dailyCap`); it also closed a hole where `resolveCaller` read the prompt field
`user` as a claimed user id. Adapters: five OpenAI-shaped providers are rows over one function,
`AdapterError` carries `{provider, status, code, message}` with the body never logged, and
`aiService.js` no longer imports axios. Consumers: fitnessgeek has one client and deterministic
fallbacks for food parse and nutrition goals (Mifflin-St Jeor), friendly `ok:false` prose for coach
and meal plan, and the opt-in gate on the REST food parse; storygeek's five model env vars are gone
from code and compose, GM turns are sticky per story, the player picker reads `/models/alive`, and
a failed turn is a 200 with the envelope's message and nothing persisted. `/api/ai/call` still
answers (deprecation header) until the follow-up commit.

### Phase 3 — The admin page becomes a status page (M, two sessions)

Three panels, in this order:

1. **Needs attention.** One list: providers with a key but zero alive models; sticky picks that
   were re-chosen since last visit; apps seen in traffic with no routing row; keys expiring; paid
   budget hit on any day this month; the last discovery run and its counts. Empty list = nothing
   to do, close the tab.
2. **Usage and cost.** Per app, per feature, per provider, with the daily caps next to the counts,
   and one line at the top: dollars spent this month, dollars left of the $10.
3. **Apps and keys.** Mint, revoke, and per app: `auto` (default) or a pin chosen from a picker
   sourced from live alive rows; the `allowPaid` switch; the daily cap. No free-text model ids.

Cut: the Configuration tab's Enable/Test/Save ritual (a key field per provider, saved on blur, is
the whole thing); the Catalog tab's Free checkbox, four limit fields, pricing dialog, free-tier
dialog, Sync, Reset-all, Restore-defaults, Save-all (catalog becomes a read-only table with an
override drawer for the rare exception); the steward toggle (its logic runs in the job now).
Keep "Try it" as a diagnostic, one panel, and the one-time key reveal dialog.

Add a `GET /api/ai/status` that feeds panel 1, so the same data can go on the StartGeek glance.

**Shipped 2026-09-08.** Design of record: `apps/basegeek/DOCS/AIGEEK_STATUS_PAGE.md`. As built:
`GET /api/ai/status` (eight attention kinds, 60 s cache, refuses to report zeros on an unreadable
ledger), `POST /api/ai/catalog/run` (admin, 202/409), `AISpend.refusals` incremented by the
governor, `/api/ai/call` deleted (D2 done; its tests moved to `/feature` and `/parse-json`). The
page is one scroll with an anchor nav: Needs attention, Usage and cost, Apps and keys, then
collapsed read-only Catalog and Try it. Always-rendered controls 56 → 22; per catalog row 7 → 1;
four tabs, the Enable/Test/Save ritual, Sync, Reset-all, Save-all, the Free checkbox and limit
fields, both dialogs, the steward toggle and every free-text model id are gone. Four GraphQL
mutations that only served them are deleted. The mobile harness ran locally on the new page: 26
scenes, 0 violations, both themes, and it caught two real bugs (a 100%-wide screen-reader span and
an AA contrast failure under a severity tint), both fixed.

**Follow-ups — closed 2026-09-11:** ~~`AIFreeTier.override: 'deny'|'allow'|null` plus a
mutation~~ — done: `setCatalogOverride`, honoured by selection, `/models/alive`, pin
resolution and the job's revive path; the drawer is live.
~~`fitness`/`health`/`observed` on the catalog read~~ — done.
~~a way to clear a provider credential~~ (done 2026-09-08: a **Remove key** button with a
confirm, backed by `removeAIProviderKey`, which deletes the row and reloads the service; a blank
key box now saves nothing rather than half-disabling).
~~`testAIProvider` / `syncProviderModels` mutations have no UI caller left~~ — both deleted.
~~`ai:stats` is not in the default key mint set~~ — it is now
(`models/APIKey.js` `DEFAULT_KEY_PERMISSIONS`), so a StartGeek glance card
reading `/status` needs no special mint.

## Decisions

Settled 2026-09-07:

- **D1. OpenRouter $10.** Yes. One-time. Lifts free models to 1,000/day and funds the governed
  paid fallback.
- **D2. Kill `/api/ai/call`.** Yes, in Phase 2, once fitnessgeek and storygeek are on the feature
  door.
- **D3. Anthropic.** Removed in Phase 0. Fitnessgeek meal plan unpinned in the same change.
- **D4. Pins.** Roles and sticky picks, never ids. StoryGeek's env-var pin retires in Phase 2.
- **D5. Local model as the floor.** Dismissed: no GPU, four Haswell cores. The floor stays the
  deterministic fallbacks the runner already requires.

Settled 2026-09-11:

- **D6. OpenRouter privacy setting.** No opt-out. Chef: *"I'm not worried about
  training on data. I'm not passing PII through this stuff."* The free pool
  stays as wide as the vendors offer it.
- **D7. Gemini in `auto`.** Yes — the probe decides like any other provider.
  `inRotation: true`, `rotationPosition: 8` (tail of the order; the health
  ranking earns it slots from there).
- **D8. Which features get `allowPaid`.** StoryGeek's GM row only, to start.
  Everything else stays free-only on its deterministic fallback. Blocked on
  Chef's two OpenRouter actions (the $10 and the $5 key credit limit) — the
  governor protects a balance that does not exist yet.

## Risks and landmines

- The pins move from ids to roles in Phase 2. Until then, StoryGeek's default `gemini-flash-latest`
  still has to exist. Check it against the live catalog before Phase 0 ships.
- Consumers outside the monorepo (CodeGeek, geekPR) use `/openai/v1`. Do not touch its shape.
- OpenRouter's 20 req/min is shared across the whole suite. A single user will not hit it; a
  discovery run could. The job stays sequential and runs at night.
- Probe cost. Discovery probes every candidate under our free quotas. Keep it sequential per
  provider, 8-token budget, nightly. It spends maybe 100 requests a night suite-wide, all free.
- Free-tier terms change. OpenRouter's numbers above are as of today; the job should read them
  from headers, not from this document.
- The dashboard key limit is the real backstop. Set it before Phase 1 ships the paid path.
- Watchtower digest landmine applies to every deploy here (see memory). Push to main; do not
  local-build basegeek.
- The comment culture. Every deletion in Phase 0 and 1 should move the incident note, not drop it.
  A short `DOCS/AIGEEK_INCIDENTS.md` index (F-xx, Q-xx, R130 with one line each) is the cheap way.

## What "done" looks like

- RUNBOOK §12 is one line: "open /aigeek; if Needs attention is empty, close it."
- Adding a provider is a key paste. Adding an adapter is one descriptor file.
- No file in the suite contains a model id, a price, or a quota typed by a human, except the
  override file, which is short enough to read in one screen.
- Every consumer in the suite gets a deterministic answer when the free tier is having a day.
- The status page shows dollars left of the $10, and the number barely moves.
- `git log -- apps/basegeek/packages/api/src/services/ai*` goes quiet.
