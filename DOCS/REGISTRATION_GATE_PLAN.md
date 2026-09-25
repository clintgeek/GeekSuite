# Registration Gate — Plan

Status: **proposal awaiting Chef's call. NOT implemented.** Written 2026-09-24. Source:
`DOCS/GameGeekPlan.md` §2.1a and §13 open question 1a, which first flagged this as a
suite-level issue found while designing GameGeek's tenancy, not a GameGeek fix.

## 1. The hole, plainly

`POST /api/auth/register` is public, rate-limited, and unauthenticated
(`apps/basegeek/packages/api/src/routes/auth.js:251`, guarded only by `registerLimiter` —
10 attempts/hour/IP, defined at `:85-93`). Anyone who reaches it gets a real account in the
shared `userGeek` collection. Two apps make that dangerous today, not hypothetically:

- **BookGeek**: `Book` has no owner field and every resolver only checks "is signed in", never
  "whose" (`graphql/bookgeek/resolvers.js:86-99`, `deleteBook` at `:408-415` runs
  `Book.deleteOne` with no ownership check at all). Any new account can read, edit, and delete
  the entire household library.
- **GameGeek** (being built now): tenant-scoped by design, but `resolveHouseholdId` returns a
  single hardcoded default until `DOCS/SUITE_HOUSEHOLDS_PLAN.md` ships
  (`packages/schemas/gamegeek/household.js`) — so it inherits the identical hole by
  construction, not by oversight, until real households exist.

Every other app (BuJoGeek, NoteGeek, FlockGeek, StoryGeek) is scoped per-user already, so a new
registrant sees nothing of theirs — see `DOCS/SUITE_HOUSEHOLDS_PLAN.md` §4 for the full
per-app table. This plan is only about closing the BookGeek/GameGeek hole *before* the real
households plan lands, because that plan is bigger and shouldn't block a one-line stopgap.

## 2. Options

### Option A — `REGISTRATION_MODE=open|invite|closed` env flag

A three-state switch read at the top of the register route:

- `open` — today's behavior, unchanged.
- `closed` — the route 403s unconditionally. One `if` at the top of the handler. No new
  model, no new UI. The one-line stopgap.
- `invite` — the route requires a valid, unused invite code in the request body, minted by an
  existing user or an admin. Needs a small model and a mint/validate/consume path.

### Option B — invite codes only (no env flag, always invite-gated)

Same as `invite` above, but permanent rather than a toggle. Simpler mental model (one path,
not three), but removes the instant `closed` escape hatch for "I just need this off right
now."

### Option C — admin-approval queue

Registration always succeeds at creating a row, but the account is `pending` until an admin
(Chef) approves it; gated routes check approval status. More moving parts (a pending-user
state, an approval UI, a rejection path) for a two-user household that isn't adding members
often. Overkill for the current household size.

## 3. Recommendation

**Two-step, in order:**

1. **Ship `closed` today** as the one-line stopgap — flip registration off entirely until
   `DOCS/SUITE_HOUSEHOLDS_PLAN.md` lands or a real invite need shows up. Chef and his wife
   already have accounts; nobody else needs to register right now.
2. **Build `invite` mode** (single-use, admin-minted codes) as the durable answer, so
   registration can reopen later without reopening the hole — this is also the natural
   precursor to `DOCS/SUITE_HOUSEHOLDS_PLAN.md`'s own invite codes (§5 of that plan), and
   ideally the same code/model shape serves both: a registration invite gets someone an
   account, a household invite gets an existing account into a household. Worth designing
   once, used twice — but that unification is a nice-to-have, not a blocker for step 1.

`REGISTRATION_MODE` as an env flag (Option A) is preferred over Option B's "always gated" for
one reason: `closed` needs to be reachable without a code change or a Mongo write, because the
whole point of step 1 is "flip this off in the next five minutes." An env flag is closed by a
value; a hardcoded invite requirement is closed by a deploy.

## 4. Exact files to touch

**Backend — the actual gate:**
- `apps/basegeek/packages/api/src/routes/auth.js` — the `POST /register` handler
  (`:251` onward) gains the mode check before any of today's logic runs. `closed` returns 403
  immediately. `invite` validates a code from the request body before calling into
  `authService` (mirrors the existing `app` validation already at the top of this handler, same
  shape, same place).
- `registerLimiter` (`:85-93`) stays as-is regardless of mode — rate limiting a gated route is
  still worth doing.
- New, for `invite` mode only: a small `RegistrationInvite` model (code, createdBy, expiresAt,
  usedAt, usedBy — same shape as `DOCS/SUITE_HOUSEHOLDS_PLAN.md` §5's `household_invites`,
  and worth sharing the model if that plan is close behind this one) and a mint endpoint
  reachable only by an authenticated existing user (or restricted further to an admin flag —
  Chef's call, §6).

**Frontend — there is exactly one registration form to gate, not several.** Every app's own
"Register" page is a thin wrapper: `bujogeek/frontend/src/pages/RegisterPage.jsx` and
`fitnessgeek/frontend/src/pages/Register.jsx` both call `register()` from `@geeksuite/auth`'s
`AuthProvider`, which is `loginRedirect(appName, returnTo, 'register')`
(`packages/auth/src/AuthProvider.jsx:72-78`) — a browser redirect to basegeek's own shared
`/register` page, rendered by `packages/auth/src/GeekLogin.jsx`. That page is the one UI that
actually POSTs to `/api/auth/register` and the one place a `closed` message or an invite-code
field needs to be added. (NoteGeek's `frontend/src/components/Register.jsx` calls its own
`useAuthStore().register()` rather than `@geeksuite/auth`'s hook — worth confirming during
implementation whether it also redirects to the shared page or has drifted onto a separate
path; if the latter, it needs the same gate applied directly.)

**Env:**
- `apps/basegeek/.env.production` — new `REGISTRATION_MODE` var. `.env.example` gets the name
  only, per the suite convention.

## 5. The env-var landmine — this WILL bite if forgotten

Watchtower never picks up a new `.env.production` variable on an ordinary deploy — `env_file`
is resolved at container-create time, and Watchtower only recreates the container when the
image digest changes, not when the env file does (`DOCS/RUNBOOK.md`, Watchtower section:
"Watchtower compares registry digest to local digest to decide whether to update"; the
CORS_ORIGINS-unset landmine in `DOCS/SUITE_TODO.md` §2 is the same failure mode already hit
once in production). **Setting `REGISTRATION_MODE=closed` in `.env.production` alone does
nothing until `docker compose up -d` runs in `apps/basegeek/`.** This is not optional
follow-through — a push to `main` that only changes the env value will deploy the *code* that
reads the flag but leave the *flag* itself unset in the running container, silently falling
through to whatever the code's default is. Make the code's default `open` intentionally (fail
the way today already fails, not fail closed by accident) and treat the `compose up -d` step
as part of shipping this, not a follow-up.

## 6. Open questions for Chef

1. `closed` now, `invite` later — agreed? Or is `invite` worth building immediately since
   the review is already open? (Recommended: `closed` now, ship in the next few minutes;
   `invite` when there's a real second-household reason to register someone.)
2. Who can mint an invite code once `invite` mode exists — any existing member, or only an
   admin flag on the user? `DOCS/SUITE_HOUSEHOLDS_PLAN.md` §5 assumes "any existing household
   member" for household invites; registration invites arguably want a tighter circle since
   they mint a whole new account, not just household membership.
3. Should `RegistrationInvite` and `SUITE_HOUSEHOLDS_PLAN.md`'s `household_invites` share one
   model, or stay separate? They serve adjacent but distinct purposes (account creation vs.
   household membership) and the fields are nearly identical.

## 7. Tests

- `REGISTRATION_MODE=closed` → `POST /api/auth/register` returns 403 regardless of body
  contents, and the rate limiter still applies on top (a flood of attempts against a closed
  route shouldn't be free either).
- `REGISTRATION_MODE=invite` with no code, an expired code, a used code, and a valid unused
  code → 400/400/400/200, and the valid code is marked used exactly once (concurrent-use race:
  two simultaneous requests with the same code, only one should succeed — the invite model's
  `findOneAndUpdate` with a `usedAt: null` filter is the standard atomic-consume pattern,
  worth a test that fires both requests at once).
- `REGISTRATION_MODE` unset or invalid → falls through to `open` (today's behavior),
  logged as a warning the same way the existing `CORS_ORIGINS not set` fallback logs at boot
  (`DOCS/SUITE_TODO.md` §2) — a silently-wrong default is worse than a loud one.
- Confirm the shared `GeekLogin.jsx` register form surfaces a `closed`/invite-required message
  rather than a generic failure, so a real person hitting it (not just an API test) gets an
  honest answer.
