# Work log — November 2026

What shipped, as it landed. Wanted-but-not-done lives in `SUITE_TODO.md`.

## 2026-11-06 — aiGeek hardening pass (committed + pushed 2026-11-07: gateway first, FitnessGeek bundle after)

Fixes for the 14 P0/P1 findings of the 2026-11-06 aiGeek audit. Every new regression test
was run red against the old code first. Open items are in `SUITE_TODO.md` §1.

- **Money:**
  - A pin is free only if `AIFreeTier` lists it free. Any other pin is a governed paid
    attempt: it needs `allowPaid`, a trusted app and a real price.
  - The daily cap is an atomic reservation (`AISpendBudget`): 8 concurrent calls against a
    5-call budget dispatch exactly 5.
  - An unknown price is `costUnknown`, never $0. `callAI` ignores a caller-supplied `route`.
- **Auth:**
  - One key policy for REST and GraphQL (`apiKeyPolicy.js`). Non-admins can only narrow a key.
  - A JWT's `app` claim is attribution, not trust: no paid routing from a login body.
- **Correctness:**
  - Provider metadata is per call (`onInfo` / `callAIWithInfo`); the shared
    `lastProviderInfo` is gone.
  - Timeouts and client disconnects abort the HTTP call and stop the walk.
  - Summarizing stays on the attempt's own provider.
  - Token estimates count the whole conversation.
  - `/feature` hands `need` to the runner.
- **Catalog:**
  - A keyless provider is parked, never deleted, and nothing is parked when a key won't
    decrypt.
  - Status-less errors never retire a model.
  - A failed discovery is retried after 6 h.
  - A truncated listing deactivates nothing.
- **Telemetry:**
  - Feature caps are durable (`AIFeatureQuota`).
  - AIUsage counters use `$inc`.
  - Admin writes invalidate the status memo.
  - An omitted `enabled` keeps the stored value.
  - The dashboard shows `costUnknown` and today's reserved/settled spend.
  - New alerts, `key_unreadable` at error level first; the UI now renders `error`.
- **Callers:**
  - FitnessGeek insights and chat go through `runAIFeature`, failing soft with `ok:false`.
  - The `foodClassify` calls carry a per-user quotaKey.
  - StoryGeek forwards `need`.
- **Tests:**
  - The api suite moved off `--runInBand`: `workerIdleMemoryLimit: '512MB'` gives a peak of
    1.3 GB in 205 s, where in band it died at the 4 GB heap.
  - basegeek api: 179 suites, 3626 passed (one pre-existing DST failure).
  - basegeek ui: 255.
  - FitnessGeek backend 995, frontend 986.
  - StoryGeek 103 + 98.
- **Docs:**
  - RUNBOOK §12: parking, unknown cost, a paid-cap check, `KEY_VAULT_SECRET` rotation.
  - RUNBOOK §9.
  - `AIGEEK_SIMPLIFICATION` correction.
  - A 2026-11-06 block in `ARCHIVE/AIGEEK_FRONT_DOOR.md`; code citations repointed there.
  - `TEST_COVERAGE` counts.
