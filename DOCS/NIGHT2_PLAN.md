# Night 2 plan — 2026-09-06, 00:25 CDT

Chef: "all 5 issues, and all 5 AI ideas brought to life. Delegate responsibly. Make reasonable
decisions on my behalf, document them, and continue until all items are complete."

Board: `DOCS/BURN_QUEUE.md` (streams R113+). Ideas: `DOCS/AI_IDEAS.md`. This file records the
decisions; the board records progress.

## The five issues and the decisions taken

| # | Issue | Decision (Sage, on Chef's behalf) |
|---|-------|------------------------------------|
| 1 | **Q58 rotate the datageek Mongo credential** | Strip the pair from `apps/basegeek/mongodb-init.js` (env-driven init). Write `apps/basegeek/scripts/rotate-datastore-creds.sh`: reads the current pair from `.env.production`, generates a new password, `changeUserPassword` via mongosh in the container, rewrites every app's `.env.production` URI that embeds it, recreates the apps. **Sage runs it if the permission layer allows; otherwise Chef runs one command** (the layer has refused every edit of a production env file tonight). Git history keeps the old value — it is disclosed either way; rotation is the fix. |
| 2 | **Q56 storygeek malformed `DB_URI` line** | Same constraint: a one-line `sed` Chef can run (given on the board). Compose override stays until then. |
| 3 | **Q18b flip `CSRF_TOKEN=enforce`** | Flip **now** rather than after 24 h: the only report-only caller was a stale startgeek tab, every proxy forwards the token, and clients self-heal a CSRF 403 with one retry + one reload. Set it in `apps/basegeek/docker-compose.yml` `environment:` (config-in-compose, no env edit), recreate basegeek, watch the log for 15 min; revert by the same file if anything but stale tabs shows up. |
| 4 | **Q10 revoke LocalApps; Q43 branch protection; Q42 TZ; Q69 dead route** | Q10: deactivate the key (isActive=false, no delete) via a script that reads env through dotenv and prints counts only. Q43: `gh api` — require `syntax`, `boot-smoke`, `gql-audit`, `eslint` and the harness job on `main`, no force-push, admins included (Sage pushes go through the same gate; that is the point). Q42: remove the misleading `TZ=America/Chicago` from every compose file and document "containers run UTC; the browser owns the local day" — installing tzdata would silently change every server-side `new Date()` site. Q69: delete the dead `INTERNAL_JWT_SECRET` route (no caller, variable never set). |
| 5 | **Policy set: Q62, Q22, Q38, Q48, Q68** | Q22: delete flockgeek's caller-less REST layer (keep auth proxy + health). Q38: delete the storygeek gateway module and the frontend's dead Apollo plumbing (per DOCS/STORYGEEK_GATEWAY_DECISION.md). Q62: conversation ownership derives from the credential (key → `apikey_<keyId>`, which is what the two existing key callers already store, so no migration); minting a key requires admin unless the app is in VALID_APPS and the caller is the app's owner; storygeek's dead `src/graphql` removed with Q38; bookify gets a size cap (events) and a 60 s budget; caller-less `aiCoachRoutes` deleted; InfluxDB reads get a `user_id` tag filter where the data has one, documented where it does not; flockgeek write-side refs get `assertOwnedRef` before Q22's deletion makes it moot (deletion wins — skip). Q48: fix every §12 follow-up that needs no product decision; the three that do (caller-less methods, goals_met flags, snapshot-vs-catalog) stay reported. Q68: preserve the old stash as branch `wip/dashgeek-redesign-2026-04` and drop the stash entry. |

## The five AI ideas — build order and shared spine

A shared runner lands first (R113) so the five features do not each invent quota, provenance and
fallback: `services/aiFeatureRunner.js` `runAIFeature({ userId, app, feature, prompt, schema?,
maxCallsPerDay, fallback })` → routes through the existing app-routing path as `app:feature`, the
free-model steward picks the model, a per-user-per-feature daily counter (`AIFeatureUsage`) enforces
the cap, `fallback()` runs when the cap is hit or aiGeek is unavailable, and the result carries
`{ text|json, provenance: { model, provider, cached, calls_today } }`. Each feature is opt-in in its
own app's settings (a flag the app already persists), stores nothing without confirmation, and
labels drafts `AI-drafted`. The five (R114–R118) build against that contract with the runner mocked
in tests, and wire to the real one when it lands.

| Stream | Feature | Gateway | Frontend | The number |
|---|---|---|---|---|
| R114 | bujogeek weekly review draft | `reviewDraft` query (bujogeek module) | ReviewPage draft card + "add as tasks" | drafts saved / month |
| R115 | fitnessgeek natural-language quick-add | `parseFoodEntry` query (fitnessgeek module) | quick-add sheet proposal card | proposal-logged rows / week |
| R116 | notegeek tag + link suggestions | `suggestForNote` (local TF-IDF first; model for related notes behind the same flag) | SuggestionStrip under the title | suggestions tapped / 100 saves |
| R117 | bookgeek what-next shelf + metadata drafts | `whatNext`, `draftBookMetadata` (bookgeek module) | WhatNextShelf; draft button in edit-metadata | shelf starts; drafts saved |
| R118 | startgeek morning brief | `glanceBrief` (glance module) | BriefCard in the hero, once/day, dismissible | days shown and not dismissed |

## Guardrails for the night
Same rules as the burn: one agent per disjoint file set, Sage verifies and commits per stream,
gates before every push, no agent runs a state-changing git command, no secrets in transcripts.
Orphan cleanup (Q70) lands early so stopped agents cannot exhaust memory again.
