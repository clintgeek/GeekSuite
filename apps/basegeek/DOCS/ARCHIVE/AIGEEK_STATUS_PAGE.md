# aiGeek status page — design of record (Phase 3)

Written 2026-09-08 (Sage) as the Phase 3 brief of `DOCS/AIGEEK_ELEVATION_PLAN.md`. Once built, this
file describes how the page works; keep it current. Phases 0–2 are live: the catalog feeds itself
(`AIGEEK_CATALOG_JOB.md`), routing is `auto | pin` with sticky picks and a governor
(`AIGEEK_FRONT_DOOR.md`), `AISpend` is the ledger, `AIStickyPick.previous` records repins.

## Why

The `/aigeek` console has ~88 fixed controls before per-row multiplication, five tabs, a Catalog tab
whose Free checkbox / four limit fields / pricing dialog / free-tier dialog / Sync / Reset-all /
Save-all all edited things the job now observes, a Configuration tab with an Enable + Test + Save
ritual per provider, model ids typed by hand from another tab, and no view of the one thing that
matters monthly: is anything wrong, and what did it cost. The plan's target: a page Chef opens once
a month, with three panels, where an empty first panel means "close the tab".

## Principles

Observe, don't ask. Three panels, in this order: Needs attention, Usage and cost, Apps and keys.
Everything the job maintains is read-only here (with an override drawer, not a form). A key paste
is the whole provider onboarding. Reuse `packages/ui` primitives (`GeekSheet`, `GeekEmptyState`,
`useToast`, the mobile harness rules: tap targets ≥ 44 px, text ≥ 12 px, no sideways scroll).

## 1. `GET /api/ai/status` (permission `ai:stats`; admin JWT as today) — **built 2026-09-08**

One round trip that feeds panel 1 and the top line of panel 2. Cheap indexed reads only; no vendor
calls. `services/aiStatusService.js` builds it (`buildStatus({ now, deps })`, everything injected —
nine collections, `aiService.providers`, the health view, the caps, the job — so every rule below is
tested against fakes with no database and no wait); `aiStatus.test.js` pins it. Shape:

```
{
  generatedAt,
  catalog: { lastDiscovery: { at, ok, alive, dead, unknown, error }, lastProbe: { at, ok, alive, dead },
             aliveFree: n, structuredFree: n, byProvider: { [id]: { alive, cooling, structured } },
             running: bool },
  attention: [ { kind, severity: 'warn'|'info', provider?, app?, modelId?, text, since? } ],
  spend: { monthUsd, todayUsd, capPerDayUsd, capPerCallUsd, paidCallsMonth, byApp: [{ app, feature, usd, calls }] },
  apps: [ { app, tier, sticky, allowPaid, dailyCap, seenInTraffic: bool, hasRow: bool, keys: n, lastCallAt } ]
}
```

A **bare object**, not the `{success, data}` envelope the older routes use — the same reasoning as
`GET /models/alive`: this is what a page renders. A read that fails is a 500 with a request id, not
a page of zeros; "nothing needs you" because the ledger was unreadable is the worst answer this
route could give.

**Built as specified, with these decisions the build had to make.**

1. **`catalog.running` is additive to the shape above.** §2 wants the `discovery_stale` item to read
   "running…" after the *Run discovery now* action until the next poll, and a discovery takes
   minutes — so the poll that lands mid-run would otherwise show the stale item again and the page
   would have to guess from a timer whether its own POST was still working. It is
   `aiCatalogJob.getInstance().ticking`.
2. **`byProvider` carries every roster provider**, keyed or not, because panel 3 renders one row per
   provider and the chip is what says "no key". The `aliveFree` / `structuredFree` **totals** count
   only rows whose provider has a key and is enabled: a row nothing can reach is not a model that
   answers, and the totals are what the empty state promises ("{aliveFree} free models alive").
3. **`apps[].tier` is `null` when there is no row**, not `'auto'`. A rowless app does run as auto,
   but writing `'auto'` would make a row's absence indistinguishable from a row that says so, and
   `hasRow` is what the *Add routing* action keys on. `lastCallAt` is `AIAppConfig.lastSeen` (touched
   per call by `routingRowFor`) where a row exists, and midnight UTC of the app's last ledger day
   where it does not — a coarser figure, and the only one available.
4. **`spend.paidCallsMonth` over-counts a mixed bucket.** `AISpend` buckets free and paid calls of
   one app/feature/provider/day into one document, so this is `calls` summed over buckets that cost
   something. Separating them exactly would need a second counter on the ledger; the figure is
   labelled here rather than in the response because a number with a footnote in it is not a number.
5. **`unrouted_app` reads `AISpend` only.** The table below names `AIUsage`/`AISpend`, but `AIUsage`
   is keyed provider/model/user and carries no app dimension — `AISpend` is the only app-dimensioned
   traffic ledger in the subsystem.
6. **`provider_dead` and `provider_listing_failed` both fire** for a provider whose listing 401s
   (Cerebras, 2026-09-07). They are two facts: one says the provider is producing nothing, the other
   says why the catalog thinks so, and the first survives a provider that lists fine and whose every
   model is cooling. The panel can collapse them; the API does not decide that for it.
7. **`ai:stats` is not in the default mint set.** `/status` takes the same word `/stats` and
   `/capabilities` have always taken, so this grants nothing new: a backend that wants the document
   must be minted `ai:stats` by name.

`attention` kinds, each with the exact text the panel shows:

| kind | condition | text |
|---|---|---|
| `provider_dead` | provider has a key + enabled and `aliveFree === 0` | "{label}: key is set but no model answers (last listing: {error or 'ok'})" |
| `provider_listing_failed` | last discovery `perProvider[id].error` | "{label}: listing failed ({code}) — check the key" (this is the Cerebras 401 today) |
| `discovery_stale` | no clean discovery in 36 h, or job disabled | "Catalog last refreshed {ago}" / "Catalog job is off (AI_CATALOG_JOB=off)" |
| `repinned` | `AIStickyPick.previous[].retiredAt` within 7 d | "{app}: {n} conversation(s) moved off a dead model this week" |
| `unrouted_app` | app name in `AISpend` last 7 d with no `AIAppConfig` row (`AIUsage` has no app dimension — deviation 5) | "{app} is calling with no routing row (running as auto)" |
| `key_expiring` | `APIKey.expiresAt` within 14 d | "{app} key '{name}' expires {date}" |
| `paid_budget_hit` | any `AISpend` day this month where a `paid_budget` refusal was logged (add a counter `refusals` to the day doc, incremented by the governor) | "Paid budget was hit on {n} day(s) this month" |
| `plaintext_keys` | any `AIConfig` row whose key is legacy plaintext (the boot warning's condition) | "{n} provider keys are stored unencrypted — run the encrypt-keys migration" |

Severity `warn` for the first three and `paid_budget_hit`; `info` otherwise. Empty array when
nothing applies. Cache the response in-process for 60 s.

`since` is set where it means something: for `provider_dead`, when that provider last answered; for
`provider_listing_failed`, the failed run; for `discovery_stale`, the last **clean** discovery
(`aiCatalogJob.lastRunAt`'s own predicate — a run whose writes failed did not happen, which is the
2026-09-07 `name`-conflict incident); for `repinned` and `paid_budget_hit`, the earliest event in
the window; for `unrouted_app`, the first ledger day in the window. `key_expiring` and
`plaintext_keys` carry none.

The list is sorted **warnings first**, then in the table's own order within a severity.

`discovery_stale` is **one** item, never two: a disabled job is *why* the catalog is old, so
"Catalog job is off" replaces the age rather than joining it.

`plaintext_keys` is a **count and nothing else** — no provider, no key hint, no document id. The
item exists because those values are sitting in the clear; naming them in an HTTP response would
make a second copy of the problem being reported.

Also: `GET /api/ai/status` is what a StartGeek glance card can read later; keep it free of UI-only
fields.

## 2. The page

Replace the five tabs with one scrolling page, three sections, an anchor nav at the top.

**Needs attention.** A list of `attention` items with severity colour (theme tokens, both modes),
each with one action where one exists: `provider_dead`/`provider_listing_failed` → "Open provider"
(scrolls to that provider's key field in panel 3); `unrouted_app` → "Add routing" (opens the
existing `AppConfigDialog` prefilled `tier: auto`); `key_expiring` → "Rotate" (the existing mint
flow); `discovery_stale` → "Run discovery now" (`POST /api/ai/catalog/run`, admin, **built 2026-09-08**:
`aiCatalogJob.getInstance().runDiscoveryNow()` starts the job's ordinary discovery out of band and
the route returns `202 { started: true }` without awaiting it, or `409 { started: false, reason:
'running' }` when a tick is already in flight. `runDiscoveryNow` takes the same `ticking` latch a
scheduled tick takes, in both directions, and the run records an `AICatalogRun` document like any
other. The POST also drops the 60 s status cache, so the item then shows "running…"
(`catalog.running`) until the next status poll). When empty: `GeekEmptyState` — "Nothing needs you. Last catalog
refresh {ago}; {aliveFree} free models alive."

**Usage and cost.** One line at the top: "This month: ${monthUsd} of the $10 · today ${todayUsd} ·
caps ${capPerDayUsd}/day, ${capPerCallUsd}/call". Then today's `UsageTab` content (per app, per
feature, per provider) with the daily cap next to each feature's count. Keep "Reset stats" behind
the existing confirm dialog, moved to the bottom.

**Apps and keys.** Today's `AppsKeysTab` slimmed: one card per app with tier shown as a single
control — a segmented `Automatic | Pinned` toggle; `Pinned` reveals a picker fed by
`GET /api/ai/models/alive` (never a free-text model id); two switches `Sticky per conversation`
and `May spend` (allowPaid) with helper text saying what each costs; a `Daily cap` number. Keys as
today (mint, revoke, one-time reveal). Below the apps, **Providers**: one row per roster provider —
label, key field (password, saved on blur with a toast; Cloudflare also shows Account ID), and a
live chip from `status.catalog.byProvider` ("{alive} alive · {structured} structured" / "no key" /
"listing failed"). No Enabled switch (a provider with a key is enabled; clearing the key disables
it), no Test button (the chip is the test), no Save-all.

**Catalog (read-only, collapsed by default).** The current model list as a table: provider, model,
fitness, alive/cooling, last success, limits observed. One override drawer per row with two
switches — `Never pick` and `Always allow` — which write `aiCatalogOverrides`-equivalent flags on
the `AIFreeTier` row (`override: 'deny' | 'allow' | null`; selection and discovery honour it). No
Free checkbox, no limit fields, no pricing dialog, no free-tier dialog, no Sync, no Reset-all, no
Restore-defaults, no Save-all.

**Try it** stays as a small collapsed panel at the bottom (it exercises the real route; default
"Automatic").

## 3. What is deleted

`ConfigurationTab.jsx` (Enable/Test/Save ritual), `CatalogTab.jsx`'s edit paths and the
`FreeTierDialog`/`PricingDialog`, the `ModelStewardBlock` toggle (its logic runs in the job; keep
the block only inside the Pinned picker as a "Suggest" button if it is cheap), the "Reset all free
tiers" button (the job revives rows), the `CONFIG_PROVIDERS` hand-typed list in `useAIGeek.js`
(read the roster from `GET /api/ai/providers` or the GraphQL `aiConfig`), and the GraphQL mutations
that only served the deleted controls (`bulkUpdateFreeTiers`, `updateModelFreeTier`,
`updateModelPricing`, `resetAllFreeTiers` — check each for other callers first).

## 4. Contracts

`useAIGeek.js`'s reducer stays the state container (it prevented a class of bugs). Every server
write goes through existing gates (`requireAdminUser` for config/keys). `/openai/v1` and
`/api/ai/feature` are untouched. Mobile harness must stay green (`tools/mobile-harness`).

## 5. Verification

- API: `aiStatus.test.js` — **60 cases, green 2026-09-08.** Each attention kind fires on its
  condition *and only then* (every case starts from a fixture in which nothing is wrong and breaks
  exactly one thing); the empty array on a clean catalog; severity and ordering; the `since` field;
  that `plaintext_keys` and `key_expiring` carry no credential fragment; the spend arithmetic and
  the single indexed ledger read; the 60 s cache and its invalidation; `runDiscoveryNow`'s latch,
  its synchronous return and its release on failure; and over the wire, `/status` under `ai:stats`
  and `POST /catalog/run` refusing a plain user and every API key while answering an admin 202 /
  409. `aiRoutesGates.test.js` carries `/catalog/run` in its `ADMIN_ROUTES` table and the `/status`
  permission reach.
- UI: vitest for the page (renders three panels; empty state; each attention action; the Pinned
  picker never renders a text field for a model id; providers row saves on blur); existing
  `AppConfigDialog.test.jsx` extended for the two switches.
- Live: open `/aigeek` in both themes; the attention list shows the Cerebras 401 item; a key paste
  shows a chip within one status poll.

## 6. Rollback

The old tabs are in git; the page is one route. `git revert` of the Phase 3 commit(s) and push.

---

## 7. As built (UI, 2026-09-07)

The page shipped as designed. What follows is the file map, the four places the
build differs from §1–§5, and what is still owed by the API side.

### Component tree

```
pages/AIGeekPage.jsx                  the shell: StatusNav + five <section>s + the dialogs
  aigeek/useAIGeek.js                 the reducer, every fetch, every write, the selectors
  aigeek/format.js                    formatters + SECTIONS + TAB_SECTIONS
  aigeek/StatusNav.jsx                sticky anchor nav; scrolls, never routes
  aigeek/AttentionPanel.jsx           panel 1 — status.attention, one action each
  aigeek/UsagePanel.jsx               panel 2 — spend line, today's tables, Reset stats
  aigeek/AppsKeysPanel.jsx            panel 3 — one card per app, then:
    aigeek/AliveModelPicker.jsx         the Pinned picker (/api/ai/models/alive), which hosts:
      aigeek/ModelStewardBlock.jsx        the Suggest half of the steward
    aigeek/ProvidersBlock.jsx           provider rows: key on blur + the live chip
  aigeek/CollapsedSection.jsx         the two disclosure sections at the bottom
  aigeek/CatalogPanel.jsx             read-only table + the override drawer (live)
  aigeek/TestPromptPanel.jsx          Try it, on POST /api/ai/feature
  aigeek/dialogs/AppConfigDialog.jsx  routing for the fields the card does not carry
  aigeek/dialogs/APIKeyDialog.jsx     mint / edit / the one-time reveal — unchanged
  aigeek/dialogs/ConfirmDialogs.jsx   ResetStats + RevokeKey (ResetFreeTiers deleted)
```

Deleted: `ConfigurationTab.jsx`, `CatalogTab.jsx`, `UsageTab.jsx`,
`AppsKeysTab.jsx`, `dialogs/FreeTierDialog.jsx`, `dialogs/PricingDialog.jsx`.

### Four differences from the brief

1. **`ModelStewardBlock` kept its recommender, lost its browse list.** §3 said
   keep it "only inside the Pinned picker as a Suggest button if it is cheap".
   The recommender half was cheap; the block's *own* free-model select was not,
   because it read `aiFreeModels` while the picker beside it reads
   `/api/ai/models/alive` — two lists that can disagree about which rows are
   alive, in one control. The select went, the `aiFreeModels` query with it.
2. **~~The override drawer is disabled~~ — live since 2026-09-11.**
   `AIFreeTier.override` exists and `setCatalogOverride` writes it, honoured by
   selection, `/models/alive`, pin resolution and the job's revive path.
3. **"Clearing the key disables it" writes `enabled: false`, not a deleted key.**
   `saveAIConfig` treats a blank `apiKey` as "keep the stored one" — it has to,
   since the client cannot read a credential back to echo it — so an emptied box
   makes the provider unreachable but leaves the encrypted key on the row.
4. **Try it moved to `POST /api/ai/feature`.** `/api/ai/call` was deleted in the
   same phase (D2). Not a path swap: the door fails soft (a model failure is
   `200 { ok: false, reason, provenance }`, rendered in place with its `hints`,
   never as an error toast), a pin is provider **and** model or neither, and
   there are no token counts — so the panel reports cost, `source`, `cached` and
   `callsToday / cap` instead, and the provider select and free-text "Model ID"
   box are replaced by `AliveModelPicker`.

### Contracts the page depends on

- `GET /api/ai/status` at §1's shape, plus `catalog.running` (additive): the
  "running…" label after `POST /catalog/run` is `state.discoveryRunning ||
  status.catalog.running`, so the local flag only covers the gap to the next
  poll. A `409 { started: false, reason: 'running' }` is treated as success.
- `catalog.byProvider` carries a row per roster provider, so the provider chip
  reads `aiConfig.hasKey` **first**: "no key" must win over "0 alive", which is
  a symptom of it rather than a fact about the key.
- `provider_listing_failed` in `attention` is where the provider row's "listing
  failed" chip comes from — the status shape has no per-provider error field,
  and one source of truth for "this key is wrong" is worth the indirection.
- `GET /api/ai/models/alive` is the only vocabulary for a pin, anywhere on the
  page. Its rows carry no display name, so options read `provider / modelId ·
  fitness`.
- The roster is `Object.keys(aiConfig)`. `CONFIG_PROVIDERS` is gone.

### ~~Still owed by the API side~~ — all delivered 2026-09-11

1. ~~**`AIFreeTier.override`**~~ — done: `setCatalogOverride` writes
   `'deny' | 'allow' | null`, honoured by selection, `/models/alive`, pin
   resolution (`pin_denied`) and the job's revive path. The drawer is live.
2. ~~**`fitness`, `health` and `observed` on the catalog read**~~ — done:
   `aiDirectorModels` free-tier rows now carry all three plus `probedAt`, so a
   cooling row keeps its fitness and "limits observed" renders the live reading
   under the ceiling line.
3. ~~**A way to clear a provider credential**~~ — done 2026-09-08:
   `removeAIProviderKey` behind a confirm button.
