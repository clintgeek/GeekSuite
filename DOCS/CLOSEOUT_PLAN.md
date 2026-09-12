# GeekSuite closeout — the open board

Plan, 2026-09-11, Sage for Chef. Nothing here is built yet. Sources: `STATUS.md`,
`DOCS/BURN_QUEUE.md` (reconciled 2026-09-07 — it is the authoritative board), the
aiGeek elevation plan's follow-up list, and a fresh read of `aiProviders.js`,
`apiKeys.js`, and the mint resolver.

The board is smaller than `STATUS.md` made it look: Q10, Q22, Q38, Q42, Q43, Q56,
Q62, Q68 are all closed and verified on disk. What is actually open is below.

## Chef's decisions, 2026-09-11

- **D6 — no OpenRouter training opt-out.** Chef: not worried about training on
  this data; nothing PII goes through these calls. Consequence: keep the free
  pool wide, no account setting to change. Recorded; no code.
- **D7 — Gemini joins `auto`.** The probe decides like every other provider.
  (`inRotation: false → true` in `aiProviders.js`.)
- **D8 — `allowPaid` on StoryGeek's GM row only.** Everything else stays
  free-only; deterministic fallbacks are good enough elsewhere.
- **Q18b — hunt the missing-header refresh caller now**, then flip
  `CSRF_TOKEN=enforce` after a clean 24 h.

## Ordering

A first — smallest diffs, freshest context. B early because it needs a 24-hour
log soak after the fix. C is mostly Chef decisions wearing code clothes. D and E
fill the gaps.

## Wave A — aiGeek leftovers (S, one session)

All in `apps/basegeek/packages/api` unless noted.

- **A1. Catalog overrides come alive.** `AIFreeTier.override: 'deny'|'allow'|null`
  + a `setCatalogOverride` mutation. `deny`: never selected by `auto` and
  discovery does not re-mark it alive. `allow`: survives a dead probe (the rare
  exception the drawer exists for). The drawer in the status page is already
  built — this enables it.
- **A2. Catalog read gains `fitness` / `health` / `observed`** so cooling rows
  show their fitness and "limits observed" shows the live reading, not the last
  hand-typed number.
- **A3. Delete `testAIProvider` and `syncProviderModels` GraphQL mutations.** No
  UI caller since the status page landed.
- **A4. `ai:stats` joins the default mint set — in both places it is typed.**
  `routes/apiKeys.js:18` `DEFAULT_PERMISSIONS` (`ai:call, ai:models,
  ai:providers, ai:usage`) and `resolvers.js:282` `createAPIKey`'s inline default
  (`ai:call, ai:models, ai:providers` — which is *also* missing `ai:usage`). One
  shared constant, both readers; a StartGeek glance card then needs no special
  mint. Update the `aiRoutes.js` note that documents the omission.
- **A5. D7: Gemini into rotation.** `aiProviders.js`: `inRotation: true`,
  assign a `rotationPosition` (recommend tail of the order — the probe's health
  ranking, not the slot, does the real work). `FALLBACK_ORDER` and
  `ROTATION_MODEL_OVERRIDES` derive automatically. Update the header comment
  ("cohere and gemini are … reserved") and `aiProviderRoster` tests that pin the
  order. Cohere stays reserved — same quota-metered reasoning, no decision
  recorded to change it.
- **A6. D8: flip `allowPaid` on storygeek's `AIAppConfig` row** (Apps and keys
  panel, or a two-line mongo update). Verify the governor's defaults are live
  first: `perDayUsd` $0.05, `perCallMaxUsd` $0.01. This is a data flip, not a
  code change — but it is **blocked on Chef's two OpenRouter actions** below.
- **A7. Record D6** in `AIGEEK_ELEVATION_PLAN.md`'s decision list.

## Wave B — Q18b: the CSRF caller hunt (S + a 24 h soak)

Facts on the board: ~5 hits/day, all `POST /api/auth/refresh`, user-agent
`axios/1.13.5`, cookie present, no `X-CSRF-Token`. All six backend proxies
forward the header — the gap is browser-side in one app's refresh path.

- **B1. Inventory every browser call site that reaches `/api/auth/refresh`.**
  `packages/auth` `doTokenRefresh()` sends the header — so the suspect is a
  caller that *doesn't* go through it or through `setupAxiosInterceptors`.
  `grep -rn 'auth/refresh' apps/ packages/` and check each app's axios instance:
  which one ships axios 1.13.5 (check lockfile) and whether any app calls
  refresh on a second, un-intercepted axios instance.
- **B2. Fix the caller** (route it through the interceptor or add
  `csrfHeaders()`), commit, deploy with the normal push wave.
- **B3. Soak, then flip.** `docker logs --since 24h basegeek | grep -i
  'report-only'` — zero `CSRF token check` warnings over 24 h is the gate.
  Then Chef sets `CSRF_TOKEN=enforce` and restarts basegeek; smoke procedure
  is in `CONTEXT.md` (stay in a tab past the 1 h token TTL; `CSRF_TOKEN=off`
  + restart is the undo).

## Wave C — board closeout (decisions → XS/S code)

Each row needs one word from Chef; Sage's recommendation in italics.

| # | Item | Recommendation |
|---|------|----------------|
| Q39/Q48 | Three caller-less fitnessgeek methods (`checkGoalsMet`/`getProgress`/`getNutrition`); `goals_met` floor-vs-ceiling; snapshot-vs-catalog recompute | *Delete the methods* — caller-less code is where yesterday's bugs live. Ceiling semantics for sugar/sodium (they're limits, not targets). Recompute against catalog. |
| Q41 | `foodRoutes.js` mints user-owned rows where the shared ladder would use global | *Needs a real conversation* — it's a privacy-model call, not a bug. Short discuss, then S. |
| Q65 | bujogeek `TemplateApplier` mounted but unreachable | *Unmount it* — unreachable mounted code is the worst quadrant. Re-add the route when the feature is wanted. |
| Q11 | basegeek `Databases.jsx` — nothing imports it | *Delete.* The DB browsers are already admin-gated routes; an orphan page is dead weight. |
| Q14 | storygeek `CanonCard` summary through `Narration` | *Yes* — one render path for summary text; XS. |
| Q20b | Simulated streaming (F-21) + user-gated model selection (F-14) | *Defer* — design-sized feature work, documented in `OPENAI_COMPAT_AUDIT.md`. Move to the backlog, not this sweep. |
| — | notegeek `CURSOR-CONTEXT.md` is gitignored | *Chef's call* — track it with placeholders scrubbed, or leave ignored. |

## Wave D — housekeeping (XS)

- Remove the merged `agents/cleanup-and-documentation-update` worktree and the
  two fully-merged branches — the permission layer refused last time; retry,
  else hand Chef the three commands.
- Verify the service-key residue: storygeek's `AI_GEEK_API_KEY` minted and the
  container restarted to pick it up (Q1). Same check for fitnessgeek. The
  feature door needs `ai:call` on each app's key.
- Confirm `pnpm-lock.yaml` + CI green on HEAD before Wave A pushes (standard
  gate).

## Wave E — M6 remainder (verify first)

`STATUS.md` says M6 "not started" but the wave-5 record says the mobile harness
workflow is enforcing and green in CI. Reconcile before planning work: what
likely remains is the moved Playwright path fix and the review-checklist piece.
Verify `tools/mobile-harness` state, then finish what's actually left.

## Chef-only (no code, ordered)

1. **OpenRouter: buy the $10.** Funds the lifetime 1,000 req/day free tier and
   the paid-fallback balance.
2. **Set a $5 credit limit on aiGeek's OpenRouter key** in the dashboard. This
   is the real backstop; our governor is the second layer. Do it before A6.
3. Flip `allowPaid` on storygeek's row (A6) — or Sage scripts it.
4. **Q13: eyeball bookgeek covers** — git cannot close this one.
5. Flip `CSRF_TOKEN=enforce` after B3's clean day.
6. The standing invite: poke every app on a phone, report what feels wrong.

## Deferred by design

- Q20b — simulated streaming + user-gated model selection (needs its own design).
- `TODO_ORDER` #17 (shared date utilities adoption) and #21 — the next queue
  after this board is clean.

## What "done" looks like

- `BURN_QUEUE.md`'s open table is empty or every row is a documented deferral.
- `CSRF_TOKEN=enforce` and a week of quiet logs.
- `/aigeek` opened monthly, Needs-attention empty, dollars-left barely moving.
- `STATUS.md` rewritten to describe September's closeout, not August's burn.
