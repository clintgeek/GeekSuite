# GeekSuite Households — Plan

Status: **proposal, plan, not started.** Written 2026-09-24. Source: `DOCS/GameGeekPlan.md`
§2.1a, which first named the gap while designing GameGeek's tenancy. This document is the
suite-wide plan that §2.1a deferred; `DOCS/REGISTRATION_GATE_PLAN.md` is the near-term
stopgap that doesn't wait for it.

## 1. Why this exists

**Today** there are two users — Chef and Chef's wife — sharing one house. Every app either
treats "everyone with an account" as the household (BookGeek) or treats each account as its
own silo (BuJoGeek, NoteGeek, FlockGeek, StoryGeek), and FitnessGeek grew its own app-local
household concept because sharing food/weight data was a real need and nothing suite-wide
existed to lean on. Chef wants GeekSuite to become genuinely multi-tenant — more than one
real household, each seeing only its own data — eventually, not urgently.

Building that now, one app at a time, would mean three different half-tenant models drifting
independently. Building it once, centrally, means every app after this point (GameGeek is the
first) is tenant-shaped from day one and the older apps migrate onto the same shape instead of
inventing their own.

## 2. Goals

- One `households` collection in `userGeek`, owned by basegeek, that every app's data can
  carry a `householdId` against.
- A per-app migration path that doesn't require flipping every app at once — BookGeek and
  GameGeek move on their own schedules.
- Membership and invites that are auditable and revocable, not a permanent shared secret.
- A test discipline that makes cross-household leakage a red test, not a code review hope.

## 3. Non-goals

- Not building household billing, quotas per household, or household-level admin roles beyond
  owner/member. That's a future project if the suite ever has paying tenants.
- Not retrofitting BuJoGeek/NoteGeek/FlockGeek/StoryGeek sharing in this pass. They're
  per-user today and stay per-user; nothing about this plan forces them into a shared model.
  If Chef later wants "my partner can see my BuJo list," that's a per-app product decision on
  top of this plumbing, not a consequence of it.
- Not solving registration being public — that's `DOCS/REGISTRATION_GATE_PLAN.md`, and it
  ships first because it's the one that can't wait for a data model.

## 4. Current state, per app — verified 2026-09-24

The question that matters: **what can a brand-new registrant see today?**

| App | Scoping key | Shared or private | What a new registrant sees |
|---|---|---|---|
| **BookGeek** | none — `Book` has no owner field | Shared by every account | Everything. Full read/write/delete on the whole library. `requireUser` only checks "signed in", never "whose". `apps/basegeek/packages/api/src/graphql/bookgeek/resolvers.js:86-99` documents this as deliberate ("BookGeek is a deliberately SHARED household library"); `deleteBook` (`:408-415`) runs `Book.deleteOne` with no ownership check at all. Per-user data (`Profile`: Kindle email, device word, custom shelves, saved filters) IS scoped by `userId` in the same file. |
| **GameGeek** (new, not yet built) | `householdId` on every document | Shared within a household, but the household is a single hardcoded default until this plan lands | Same hole as BookGeek, scoped to whichever games exist. `packages/schemas/gamegeek/household.js`'s `resolveHouseholdId(user)` returns the constant `DEFAULT_HOUSEHOLD_ID = 'default'` for every authenticated user — verified in the file, which says so in its own header and cites this plan by name. |
| **FitnessGeek** | `UserSettings.household.household_id`, app-local | Private by default; shared only after opting into a household | A new registrant sees nothing of anyone else's data — they have no household until they join one. Joining is `joinFitnessHousehold` (`apps/basegeek/packages/api/src/graphql/fitnessgeek/resolvers.js:1647-1663`), keyed by a code minted in `createFitnessHousehold` (`:1628-1644`) as `crypto.randomBytes(6).toString('hex').toUpperCase()` — 12 hex characters, stored on the row with **no expiry field at all**. Sharing is then further gated per-feature by `share_food_logs`/`share_weight`/`share_meals` booleans (`typeDefs.js:138-160`), so joining a household doesn't itself expose everything — but the join code itself never expires and isn't single-use in the invite sense (anyone who has it can join, repeatedly, forever). |
| **BuJoGeek** | `createdBy` / `userId` | Private, per-user, no household concept | Nothing. Every resolver filters `{ createdBy: userId }` or passes `userId` into the service layer — verified `apps/basegeek/packages/api/src/graphql/bujogeek/resolvers.js:54-74` (a representative sample; the pattern is uniform). |
| **NoteGeek** | `userId` | Private, per-user, no household concept | Nothing. `apps/basegeek/packages/api/src/graphql/notegeek/resolvers.js:40-58` — every query builds `{ userId }` or passes it to a service function; note versions are looked up by `{ noteId, userId }`. |
| **FlockGeek** | `ownerId` via `requireUser(context)` | Private, per-user, no household concept | Nothing. `apps/basegeek/packages/api/src/graphql/flockgeek/resolvers.js:250-361` — every mutation sampled calls `requireUser(context)` and uses the returned `ownerId` to scope the write. (SUITE_TODO already tracks retiring FlockGeek's separate mounted REST layer, `routes/api.js`, as Chef item Q22 — orthogonal to this plan.) |
| **StoryGeek** | `Story.userId`, enforced by middleware, not the gateway | Private, per-user, no household concept | Nothing. StoryGeek is the odd one out architecturally: it isn't gatewayed through basegeek's GraphQL like the others (SUITE_TODO already flags a dead, unused `graphql/storygeek` schema in basegeek as Chef item Q38 — separate cleanup). Ownership is enforced by Express middleware, `apps/storygeek/backend/src/middleware/storyOwner.js:9-22`, which loads `Story.findById(req.params.storyId)` and 403s unless `story.userId` matches the caller. |

**The two live holes, in order of severity:** BookGeek (shared by every account, no boundary
at all) and GameGeek-as-designed (shares the same hole by construction, contained today only
because `resolveHouseholdId` hardcodes one household — see `DOCS/REGISTRATION_GATE_PLAN.md`
for why that matters *right now*, before this plan ships anything).

## 5. Data model

New collection in `userGeek` (basegeek's database, alongside `User`):

```js
// households
{
  _id: ObjectId,
  name: String,                    // "Crocker House", user-facing
  ownerId: ObjectId,                // ref User — the member who can't be removed except by transfer
  members: [{ userId: ObjectId, role: 'owner' | 'member', joinedAt: Date }],
  createdAt, updatedAt,
}

// household_invites — expiring, single-use
{
  _id: ObjectId,
  householdId: ObjectId,
  code: String,                    // random, unguessable, indexed unique
  createdBy: ObjectId,             // must be an existing member
  expiresAt: Date,                 // short-lived — hours, not FitnessGeek's forever
  usedAt: Date | null,
  usedBy: ObjectId | null,
}

// User gains: householdId: ObjectId | null
```

**Roles are owner/member, nothing richer, for now.** Owner is the account that created the
household (or later, one it was transferred to); member is everyone else. There's no
per-app permission matrix on top of this — that's still each app's own business (FitnessGeek's
`share_food_logs`-style flags are the model, applied per app, not centralized).

**Invites are expiring, single-use codes, approved by an existing member** — a deliberate
contrast with FitnessGeek's permanent join code. Minting one requires being a member already
(so a stranger with no household can't self-mint an invite into someone else's), and using one
consumes it (`usedAt`/`usedBy` set, a second use of the same code fails).

## 6. Server-side resolution, not a JWT claim

`householdId` is resolved **per request, server-side**, the same way `resolveHouseholdId` in
GameGeek's schema package already anticipates (`packages/schemas/gamegeek/household.js`) — it
is explicitly *not* read from `user.householdId` on a decoded token.

**Why not a claim:** a JWT is valid until it expires (basegeek's `JWT_EXPIRES_IN`), and a
household membership can change well inside that window — someone leaves a household, is
removed by the owner, or joins a new one. If membership rode in the token, leaving a household
would only take effect at the next token refresh, which means a removed member keeps reading
that household's data for however long their access token has left. Resolving it server-side
on every request (a light Mongo lookup, cacheable briefly like session validation already is)
means removal is immediate. The cost is one extra lookup per request, which is the same shape
of cost `requireUser` already pays for session validation and is not a new category of load.

## 7. Per-app migration table

| App | What changes | What doesn't |
|---|---|---|
| **BookGeek** | `Book` gains `householdId` (required, indexed). One-time backfill: every existing book gets the single household both current users belong to (see §8). Every resolver in `graphql/bookgeek/resolvers.js` adds a `householdId` filter alongside `requireUser`'s "signed in" check — same shape as GameGeek's `requireHousehold`. `deleteBook` in particular must gain the check it has none of today. |
| **GameGeek** | Nothing changes in the data model — it's already `householdId`-shaped (§4). `resolveHouseholdId` in `packages/schemas/gamegeek/household.js` swaps its hardcoded `DEFAULT_HOUSEHOLD_ID` return for a real lookup against the new `households` collection. That function is the *only* place this touches, by design (its own header says so). |
| **FitnessGeek** | Its app-local household becomes a thin layer **over** the suite household: `UserSettings.household.household_id` is superseded by `User.householdId`, and the per-feature sharing flags (`share_food_logs`, `share_weight`, `share_meals`) stay exactly as they are — they're a finer-grained opt-in on top of household membership, not a replacement for it. The existing 12-hex join-code flow either goes away in favor of the suite invite system, or stays as FitnessGeek's own "which household features do I share" step after suite membership already exists — Chef's call, not forced by this plan. |
| **BuJoGeek, NoteGeek, FlockGeek, StoryGeek** | **No change.** These are per-user apps and nothing in this plan makes them shared. If a household concept is ever wanted here (e.g., "see my partner's BuJo backlog"), that's a separate per-app product decision layered on the same `households` collection — the plumbing would already exist, but building the feature is out of scope here. |

## 8. Migration for today's two users

One household, both current users as members, one of them (whoever registered first, or
Chef by convention) as owner. BookGeek's existing books all backfill to that one household's
id in the same migration script — a single `updateMany` once the household exists and both
users are confirmed members, following the same "migration runs before the schema requires the
field" order the BP `measured_at` backfill used (`DOCS/WORK_LOG_2026-09.md`, "FitnessGeek —
blood pressure gains `measured_at`, households become visible").

**The landmine that backfill already taught, worth repeating here:** a backfill that *fills* a
field kills every `if (!field)` fallback written for its absence. `Book` has no owner field
today, so there's no fallback branch to worry about breaking — but any code written *during*
this migration that treats `householdId` as optional-then-required needs the same question
asked of it: what did the old code do when this was empty, and does that branch still run
after the backfill?

## 9. The test rule

**Every ownership test gets a second-household fixture that must see nothing.** This is
already GameGeek's stated testing plan (`DOCS/GameGeekPlan.md` §10: "tenancy first: a
second-household fixture in every ownership test, where household B can't read, count,
search, edit or delete household A's games"). This plan extends the same rule to BookGeek once
it's tenant-scoped: every existing BookGeek ownership/CRUD test gains a household-B fixture
that must fail to read, search, count, edit, or delete household A's books — including via
shelf counts and any AI candidate sets `whatNext` builds. A test suite that passes today
because there is only one household in fixtures would not catch a missing `householdId` filter
tomorrow; the fixture has to force two households to exist side by side.

## 10. Phased rollout

| Phase | Deliverable | Done when |
|---|---|---|
| **H0** | `households` + `household_invites` collections, models, basegeek resolvers (create household, invite, join, leave, list members) | A household can be created, invited into, and joined through the API; unit tests for the invite lifecycle (mint, use once, expire, reject reused) |
| **H1** | Migration: today's two users into one household | Both users show `householdId` on their `User` row; migration is idempotent and logged |
| **H2** | BookGeek backfill + resolver scoping | Every book carries `householdId`; every resolver (including `deleteBook`) filters by it; second-household fixture tests are red before the fix and green after |
| **H3** | GameGeek's `resolveHouseholdId` reads the real collection | GameGeek's own second-household tenancy tests (already planned) pass against a real household lookup, not the hardcoded default |
| **H4** | FitnessGeek household becomes a layer over the suite household | Existing sharing-flag behavior unchanged; the join-code flow is either retired or re-scoped, Chef's call |
| **H5** (optional, later) | Household admin UI (invite management, member list, leave/remove) | Whichever app hosts suite-account settings gets a household settings page |

## 11. Risks

- **BookGeek's `deleteBook` has no ownership check today, at all.** Adding `householdId`
  scoping to it is also the first time it gets *any* boundary — worth treating as its own
  small, verifiable step (H2) rather than bundling it silently into a bigger migration commit.
- **A second household existing before H2 ships would make BookGeek's shared-library premise
  visibly wrong** — a second household's members would see the first household's entire
  library, which is worse than today's implicit single-household reality because now it's
  *labeled* as a boundary that isn't enforced yet. Practically this isn't reachable before a
  third user exists, which `DOCS/REGISTRATION_GATE_PLAN.md` addresses directly.
- **Migration ordering matters**: `households` must exist and both users must be confirmed
  members before `Book.householdId` becomes required, mirroring the BP `measured_at` lesson
  in §8.
- **Server-side resolution costs a lookup per request.** Cache it briefly (session-validation
  style); don't cache it long enough that a removal takes minutes to take effect.

## 12. Open questions for Chef

1. Does FitnessGeek's join-code flow get retired in favor of the suite invite system, or does
   it stay as a second, finer-grained step after suite membership? (§7)
2. Household admin surface (H5): does it live in basegeek's account settings, StartGeek, or
   somewhere else?
3. Is owner→member role ever expected to need more granularity (e.g., "can invite" vs. "can
   remove"), or is owner/member sufficient indefinitely? Recommended: sufficient indefinitely
   until a real need shows up.

Once these are answered, H0 can start independently of GameGeek or BookGeek's own schedules —
it's additive infrastructure until H2/H3 point real apps at it.
