# BuJoGeek — Project Context

Current state reference for development work. Update this when architecture, data models, or feature status changes significantly.

Last major revision: 2026-08-30 (bug/cleanup/feature pass — see git log for the commit series).
Amended 2026-09-03: blocked ("parked") task state — gateway half.
Amended 2026-09-05: first-load pass — routes are now `React.lazy`, `manualChunks` is a
path-matching function, and the markdown renderer loads on demand. Entry chunk 1605 → 449 kB,
`/today` 1606 → 1324 kB. See "Frontend — Bundle" below before touching `frontend/vite.config.js`
or adding a heavy dependency.
Amended 2026-09-05: BURN_REVIEW #8 fix — `TaskList.jsx`'s `getLocalDate` grouped tasks by the
UTC day for `dueDate`/`createdAt`, which this app stores as **instants** (a task can carry a
reminder time, `graphql/bujogeek/validation.js:25-28,84-85`), not calendar dates. Now uses
`localDateString` from `@geeksuite/utils`. Only call site in the frontend (grepped). See
`DOCS/BURN_REVIEW.md` #8 for the full account and the two new regression tests
(`__tests__/components/TaskList.test.jsx`, run under `TZ=America/Chicago`).

---

## Project Overview

**bujogeek** is a bullet-journal-inspired digital planner. Daily ritual app: Today view → Review aging tasks → Plan ahead. Auto-migrating tasks, collections, habit tracking, template-based task creation, keyboard-first UX.

Part of GeekSuite. Authenticates via `@geeksuite/auth` (basegeek SSO). **All data flows through Apollo to the basegeek GraphQL gateway** — the local Express backend serves only static files, the SSO proxy, `/api/me`, and `/api/health`. The bujogeek data layer lives in `apps/basegeek/packages/api/src/graphql/bujogeek/`.

---

## Tech Stack

**Frontend:**
- React 18 + Vite + VitePWA
- Material-UI (MUI) v7, Framer Motion, Lucide icons
- Apollo Client (GraphQL), React Router v6, date-fns

**Backend (local, thin):**
- Express, ES modules; SSO proxy + static serving only
- pino + pino-http

**Data layer (in basegeek):**
- Mongoose models + services + GraphQL typeDefs/resolvers under `graphql/bujogeek/`
- Jest + mongodb-memory-server tests in `packages/api/src/__tests__/bujogeek*.test.js`
  (`node --experimental-vm-modules node_modules/jest/bin/jest.js bujogeek --runInBand`)

**Infrastructure:**
- Single Docker container `bujogeek` (port 5005); React build served by Express
- basegeek GraphQL gateway at `GATEWAY_URL` (`host.docker.internal:4100`)

---

## Routes

| Route | View |
|-------|------|
| `/` | Redirect → `/today` |
| `/today` | Daily planner (primary screen, with Upcoming section) |
| `/review` | Review aging tasks (keep / tomorrow / date / backlog / cancel / delete) |
| `/plan/weekly` · `/plan/monthly` · `/plan/backlog` | Planning views |
| `/collections` · `/collections/:id` | Named lists outside the daily log |
| `/habits` | Habit week-grid tracker with streaks |
| `/search` | Search + filters + JSON/Markdown export |
| `/templates` · `/tags` | Templates, tag browser |
| `/login` | Login (SSO splash) |

Keyboard: `j/k/x/e/d/c` row nav, `g→t/r/p/s/l/h` chords, `Cmd+N`, `?` help.

---

## Data Model (gateway: `graphql/bujogeek/models/`)

### Task
```
content, signifier,
status (pending|completed|cancelled|blocked|migrated_back|migrated_future),
dueDate (UTC midnight = date-only; non-midnight = carries a due time),
priority (1=High 2=Medium 3=Low, null=None), note, tags[],
originalDate, originalDueDate, migratedFrom/To, isBacklog,
completedAt, cancelledAt, blockedAt (mutually exclusive; set/cleared by
  updateTaskStatus / blockTask / unblockTask), blockedReason (≤280 chars),
recurrenceRule (RRULE string; ONLY recurrence mechanism — recurrencePattern is a
  deprecated input shim translated server-side), seriesId, isSeriesMaster, exdates[],
collectionId (undated collection tasks are excluded from log views/carry-forward),
remindedAt (push reminder dedup), parentTask, subtasks[], createdBy, timestamps
```
Recurring tasks are virtual: masters are expanded per view window as
`virtual_<masterId>_<epochMs>`; edits materialize overrides via editScope
(THIS_INSTANCE / ALL_INSTANCES / FUTURE_INSTANCES — the last splits the series).

#### Blocked ("parked") tasks — added 2026-09-03

A blocked task is waiting on something outside itself. It **keeps its dueDate**
— it is parked, not rescheduled — but it leaves the log entirely while blocked:
`dailyTasks` / `weeklyTasks` / `monthlyTasks` filter `status: 'blocked'` out, so
a blocked task is neither "due today" nor overdue. The `all` corpus (search,
export, backlog) still sees it, and `blockedTasks` is the list view.

- `blockTask(id, reason)` → `status: 'blocked'` + `blockedReason` + `blockedAt`.
  Allowed from `pending` / `migrated_back` / `migrated_future`, and from
  `blocked` itself (rewrites the reason, keeps the original `blockedAt` so
  "parked since" never drifts). From `completed` / `cancelled` it is a
  `BAD_USER_INPUT` (400) GraphQL error. A reason over 280 chars is the same
  error, thrown before anything is written.
- `unblockTask(id)` → back to `pending`, `blockedReason`/`blockedAt` cleared,
  **dueDate untouched** — a date that has since passed simply reappears as
  overdue. `BAD_USER_INPUT` when the task is not blocked.
- `updateTaskStatus(id, 'blocked')` delegates to `blockTask` (one guard, one
  place). Every other status clears the blocked fields, so completing or
  cancelling straight from the blocked list works and un-parks the task.
- **Recurrence**: a blocked series *master* stops expanding, exactly like
  completed/cancelled. Blocking a single `virtual_…` occurrence materializes a
  blocked override for that date, which suppresses that date's virtual — so
  neither path can spawn a duplicate. (The daily view's ordinary carry-forward
  of a series' previous, unblocked occurrence is unaffected.)
- Reminders are unaffected by design: `reminderService`'s sweep only considers
  `status: 'pending'`, so a parked task sends no push and resumes on unblock.
- There is no summary/stats type in this schema, so the requested `blocked: Int`
  count has no home yet — the frontend reads `blockedTasks.length`.

### Collection
`name, description, archived, createdBy, timestamps` — tasks reference it via `collectionId`; delete detaches by default, cascades on request.

### Habit / HabitLog
`Habit: name, daysOfWeek[0-6] (empty = daily), color, archived, createdBy`.
`HabitLog: habitId, createdBy, date (UTC midnight)` — unique `(habitId, date)`.
`currentStreak` computed server-side (scheduled days only; today-unlogged doesn't break).

### PushSubscription
`createdBy, endpoint (unique), keys{p256dh,auth}` — web-push reminders; see `DOCS/REMINDERS.md`.

### TaskOrder / Template / JournalEntry
Unchanged: per-day drag order (`dateKey 'yyyy-MM-dd'`, local dates), multi-line templates, journal entries.

---

**Frontend (2026-09-03):** Today renders a `BlockedSection` last (always visible, count in the
header, empty state when none). `TaskRow` shows a plum BLOCKED chip, the reason as muted
secondary text and "parked N days"; Block… / Unblock live in the row action strip and open
`BlockTaskDialog` (optional reason, 280 max). Quick-add accepts `~blocked <reason>` as the
last token (create → blockTask). ReviewPage excludes blocked tasks; BacklogList and TaskList
render them with the indicator. PageHeader stats show "N blocked".

## Invariants (do not regress)

- **Ownership**: every gateway read/write is scoped by `createdBy` in the service layer (`requireUser` pattern). Cross-user ids behave as not-found. Covered by jest suites.
- **Dates**: date-only values are UTC midnight; date KEYS on the client use date-fns `format(date, 'yyyy-MM-dd')` (local), never `toISOString()`.
- **Sorting**: one canonical comparator (`compareTasks` in TaskContext, `sortTasks` in taskService) per `DOCS/SORTING_RULES.md`; completed/cancelled sink (cancelled last).
- **Errors**: Apollo error shapes parsed by `handleApiError`, surfaced via the TaskProvider snackbar. Status toggles are optimistic with rollback.

---

## Local Express API (all that remains)

- `POST /api/auth/*` — SSO passthrough to basegeek
- `GET /api/me`, `GET /api/health`
- Static SPA serving

Everything else is GraphQL on the gateway: dailyTasks/weeklyTasks/monthlyTasks/allTasks,
blockedTasks, task CRUD + updateTaskStatus + blockTask/unblockTask +
migrateTaskToFuture + saveDailyTaskOrder, taskTags/tasksByTag,
collections CRUD, habits CRUD + toggleHabitLog + habitLogs, templates, journal,
pushVapidKey + save/removePushSubscription.

---

**TemplatePreview markdown styling (2026-09-05, TODO_ORDER #30):** the template preview
(`components/templates/TemplatePreview.jsx`) rendered raw `ReactMarkdown` with none of its
own styling — UA-blue links on dark paper, no code-block background, and the content box
shared `background.paper` with the surrounding `Paper` (no visual separation). Added
`remark-gfm` + `remark-breaks` (same versions storygeek pins) and a `components` map so
links/code/blockquotes read from the theme palette (`primary.main`, `alpha(text.primary,
0.08)`, `divider`), and switched the content box to `background.default` + a border. Still
no `rehype-raw`, so literal HTML in a template body renders as inert text, not markup —
same sanitization contract as storygeek's `Narration.jsx`. Added the app's first component
test (`__tests__/components/TemplatePreview.test.jsx`, 7 cases) and, with it, the app's
first `@testing-library/react` + `@testing-library/jest-dom` devDependencies and a
`src/__tests__/setup.js` (vitest `setupFiles`) — none of that existed before this pass;
prior coverage was utils/graphql only.

**a11y pass (2026-09-05):** the mobile harness' axe run had bujogeek at **28 findings — 0 now**. Named the task/subtask toggle after its entry (`TaskCheckbox` `label`), wired the four editor `Select`s to their `InputLabel`s via `labelId`, gave the recurrence glyph `role="img"`, and pulled every hardcoded `ink[300]`/`ink[400]`/low-alpha-cream *text* colour onto `palette.text.muted`/`.secondary` — the domain inks (aging, priority, signifier) now go through `theme/inks.js`, which measures each hue against the least forgiving ground it lands on instead of guessing a fixed nudge like `toneForMode` did.

**Housekeeping note (2026-09-05):** `DOCS/SUITE_TODO.md` still listed a
"bujogeek duplicate model files (`userModel.js`/`User.js`,
`templateModel.js`/`Template.js`)" cleanup item. Checked the repo — none of
those files exist anywhere under `apps/bujogeek`; they (plus the entire
legacy REST routes/controllers layer) were already deleted in `3af40cc`
("remove dead REST layer and orphaned frontend code", 2026-08-30). The TODO
entry was stale; struck it.

## Frontend — Bundle (2026-09-05)

Before this pass bujogeek had **no code splitting of any kind**: no
`manualChunks`, no `React.lazy`, one 1605 kB entry script that every visitor
downloaded in full before the first task row appeared. `pnpm build` ended with
the "chunks are larger than 500 kB" warning. It no longer does. Numbers below
are from `frontend/dist`, KiB (bytes / 1024), gzip via `zlib.gzipSync`.

**First load** — the entry chunk plus everything `dist/index.html` references
(`<script>`, `<link rel="modulepreload">`, `<link rel="stylesheet">`):

| | before | after |
|---|---|---|
| entry chunk `index-*.js` | 1605.1 kB (gz 480.0) | **449.4 kB (gz 139.1)** |
| first load, total | 1605.6 kB (gz 480.3) | **1010.1 kB (gz 309.7)** |
| files on the critical path | 2 | 6 |
| all built js + css | 1611.2 kB (gz 482.6) | 1621.7 kB (gz 509.3) |
| chunks emitted | 3 | 44 |
| chunks over 500 kB | 1 (the entry, 1605) | 0 (largest is the entry at 449) |

**Route cost** — what a route pulls *beyond* the first load, following its
static imports transitively. Before the pass every one of these was zero,
because every page was already in the entry; the honest comparison is the
right-hand column against 1605.6 kB.

| route | after (extra) | total for a cold visit |
|---|---|---|
| `/today` (the default landing route) | 314.4 kB (gz 101.4) | **1324.0 kB (gz 410.8)** |
| `/tags` | 285.3 kB (gz 90.2) | 1295.4 kB |
| `/search` | 273.4 kB (gz 87.2) | 1283.5 kB |
| `/collections/:id` | 306.3 kB (gz 99.1) | 1316.4 kB |
| `/review` | 183.2 kB (gz 58.0) | 1193.3 kB |
| `/plan/*` | 47.5 kB (gz 15.9) | 1057.6 kB |
| `/habits` | 25.5 kB (gz 10.4) | 1035.6 kB |
| `/templates` | 24.0 kB (gz 9.3) | 1034.1 kB |
| `/collections` | 12.1 kB (gz 5.9) | 1022.2 kB |
| `/login` | 5.8 kB (gz 2.3) | 1015.9 kB |
| `/settings` | 3.4 kB (gz 1.5) | 1013.5 kB |

Read `/today` as the real headline: **1605.6 → 1324.0 kB (gz 480.3 → 410.8)**
for the screen everybody actually lands on. The shell-only number is the better
one for `/plan`, `/habits`, `/templates` and `/settings`, which is most of the
app.

### 1. Route-level `React.lazy` (`src/App.jsx`)

All twelve pages, `LoginPage`/`RegisterPage` included, are `lazy()` imports
behind one `<Suspense>` around `<Routes>`. Nothing about what a route renders
changed; the only visible difference is one chunk fetch before a route paints
for the first time.

The fallback is **`RouteFallback`**, which reuses `SkeletonLoader` — the app's
own warm-parchment shimmer — at TodayPage's exact measure (720px, `px: {xs:1,
sm:3}`, the FAB's `pb: 11` on mobile). Deliberately not a centred
`CircularProgress`: every page in this app already loads into that skeleton
while its data arrives, so a spinner handing off to a skeleton would be two
different loading surfaces stacked on one navigation. Paper journal, unbroken.

### 2. `manualChunks` as a path-matching function, and one group that is *not* here

The object form of `manualChunks` matches by resolved module id and silently
misses CommonJS proxies (fitnessgeek's finding — its `vendor: ['react',
'react-dom']` came out as a 0.03 kB chunk). bujogeek never had a `manualChunks`
at all, so it went straight to the function form. `VENDOR_GROUPS` in
`frontend/vite.config.js`:

| chunk | contents | eager? |
|---|---|---|
| `react-vendor` | react, react-dom, scheduler, react-is, react-router + `@remix-run/router` | yes (166.5 kB) |
| `apollo` | `@apollo/client`, graphql and its runtime tail | yes (221.4 kB) |
| `motion` | framer-motion / motion-dom — pulled by `packages/ui`'s `GeekAppFrame`, not by app code | yes (125.4 kB) |
| `date-fns` | date-fns | yes (46.9 kB) — via `AdapterDateFns` |
| `markdown` | react-markdown + the whole unified/remark/micromark/mdast/hast tail | **no** (153.1 kB) |
| — | `@mui/*`, `@emotion/*`, `@mui/x-date-pickers`, lucide | **unclaimed on purpose** |

**There is no `mui` group, and that is the opposite of fitnessgeek's config.**
It is measured, not assumed — same tree, four configurations:

| grouping of `@mui` | shell first load | `/today` total | entry |
|---|---|---|---|
| **none — shipped** | **1010.1 kB (gz 310)** | **1324.0 kB** | 449.4 kB |
| `@mui/system`+`utils`+`@emotion` only | 1030.6 kB (gz 317) | — | 384.1 kB |
| explicit `@mui/material|system|base|…` | 1087.4 kB (gz 335) | 1339.2 kB | 165.3 kB |
| naive `/^(@mui|@emotion)\//` | 1261.5 kB (gz 383) | 1343.4 kB | ~165 kB |

A manual chunk goes eager the moment *any* eager module reaches it, so a `mui`
group puts every `@mui/material` component the app uses **anywhere** onto the
first load — including the ones only `TaskEditor` and the date pickers touch.
Leaving `@mui` unclaimed lets rollup split it at module granularity: the shell's
components go eager, the route-only ones ride their route's chunk. No group wins
on both columns that matter.

The last row is worth keeping: `/^(@mui|@emotion)\//` also swallows
`@mui/x-date-pickers`, and because `App.jsx` wraps the whole tree in a
`LocalizationProvider`, that one lazy regex character-class drags the entire
136 kB picker tree onto the first load. Same trap, one level down.

fitnessgeek's `mui` group is load-bearing for the *opposite* reason — without a
MUI chunk boundary, rollup hoisted its chart vendors (nivo, recharts) into the
entry's graph. bujogeek has no chart library. **If a heavy route-only vendor is
ever added here, re-measure before trusting this.**

The trade being made: app code changes every deploy, so the 449 kB entry
(gz 139) is re-fetched every deploy, ~284 kB of it MUI that did not change. The
explicit `mui` group would keep that slice cached across deploys at the cost of
77 kB on a cold load and 15 kB on `/today`. The one-line flip is recorded in
`vite.config.js`.

### 3. The markdown renderer loads on the click, not with the route

`react-markdown` + `remark-gfm` + `remark-breaks` (added the same day for the
template preview's styling) drag 153 kB of unified/micromark/mdast/hast with
them, and the app has exactly one consumer: `TemplatePreview`. It is now
`React.lazy`'d **at its call site**, `TemplateApplier.jsx`, which renders `null`
until a template is opened for apply — so the `markdown` chunk is fetched when a
preview actually renders and never otherwise. `TemplatePreview` itself stays a
plain synchronous component, which is why the seven
`__tests__/components/TemplatePreview.test.jsx` cases needed no changes. The
Suspense fallback is the same centred `CircularProgress` the dialog already
shows while `applyTemplate` is in flight, so a chunk fetch and a network fetch
look identical.

### 4. The FAB registry needed no handling

`useGeekPrimaryAction` (`packages/ui/src/navigation/primaryActionContext.js`)
registers in a mount effect and unregisters on unmount, as a stack — a lazy
component simply registers when Suspense resolves it. bujogeek has exactly one
registrant, `components/today/QuickAddSheet.jsx`, rendered by `TodayPage` and
`CollectionDetailPage`. Both are **eager within their own route chunk**: the
only new boundary is at the route, so the sheet is in the same chunk as the page
that renders it and registers on the same mount it always did. Nothing that
registers a FAB sits behind an *additional* Suspense boundary. Same call
fitnessgeek made, for the same reason. Harness scenes `02-add-sheet` and
`08-collection-add-sheet` open the FAB's sheet on both pages and are clean.

### 5. Service worker

Precache-only — `VitePWA`'s `generateSW` with the default
`globPatterns: ['**/*.{js,css,html,ico,png,svg}']` and exactly one runtime rule
(the mandatory `auth-bypass` NetworkOnly). Verified after the split: **44 hashed
`.js`/`.css` on disk, all 44 present in `dist/sw.js`'s 47-entry precache
manifest** (the other three are `index.html`, `offline.html`, `favicon.svg`).
New chunk names are covered automatically; there is nothing to maintain when the
chunk list changes.

The deploy path is safe at both ends, and neither end needed changing:

- Registered routes in the built SW are exactly two — the `NavigationRoute`
  bound to the precached `index.html`, and the auth `NetworkOnly`. A
  `NavigationRoute` matches only `request.mode === 'navigate'`, so a `<script>`
  or `<link>` request for a hashed chunk is never intercepted by it. A hashed
  URL the SW does not have precached simply **falls through to the network**.
- On the network it meets `backend/src/app.js`'s SPA fallback, which 404s any
  path with a file extension ahead of `res.sendFile(index.html)` — the
  suite-wide guard bujogeek already carried before the Q53 sweep (`2d0f5a5`
  lists bujogeek under "already had it"). So a stale index can never be handed
  an HTML document under a `.js` URL.
- There is no StaleWhileRevalidate asset rule at all, so there is no runtime
  cache for such a response to poison even if one arrived. That is why the
  suite's `cacheWillUpdate` requirement reads "n/a" for bujogeek in
  `DOCS/PWA_STANDARD.md` §1a. **If bujogeek ever adds a runtime asset rule, it
  must ship with that plugin.**

Note `vite preview` is *not* a proxy for this check: it answers
`/assets/gone-DEAD.js` with 200 `text/html`, because it has its own
unconditional SPA rewrite. The Express backend is what ships.

### 6. How to re-measure

No bundle visualizer is installed and none was added. First load is
`dist/index.html`'s `<script>` + `modulepreload` + stylesheet list, sized on
disk and gzipped with `zlib.gzipSync`. Route cost is the transitive closure of a
route's chunk over the `import "./x.js"` statements in the emitted files, minus
the eager closure. Two throwaway node scripts, no dependencies; the second is
worth rewriting rather than keeping, it is fifteen lines.

### What was left on the table

- **`@mui/x-date-pickers` (136–158 kB) rides `/today`, `/review`, `/search`,
  `/tags` and `/collections/:id`.** `TaskEditor` imports `DateTimePicker` at
  module scope and `TaskList` imports it twice more; between them
  `TaskEditor` (92.5 kB) + `useMobilePicker` (157.6 kB) are 250 kB of `/today`'s
  314 kB route cost. Deferring it means only mounting `TaskEditor` while it is
  open, and it is currently always-mounted-with-`open={bool}` — unmounting on
  close would reset the dialog's internal state and kill MUI's close transition.
  That is a behaviour change, so it was left alone. It is the single biggest
  remaining win and it is one deliberate decision away.
- **Apollo (221 kB) is above the router** — `main.jsx` mounts `ApolloProvider`
  around `<App/>`, so the client is on the first paint by construction.
- **framer-motion (125 kB) comes from `packages/ui`'s `GeekAppFrame`**, which
  wraps every route transition. Out of this app's reach.
- **date-fns (47 kB) is eager** because `App.jsx` wraps the tree in a
  `LocalizationProvider dateAdapter={AdapterDateFns}` and the shell formats
  dates. Moving the provider down is a tree change for ~10 kB gzipped; not worth
  it.
- **No drag-and-drop library exists** to split — the daily reorder is
  framer-motion's `Reorder`, already in the eager `motion` chunk — and the only
  export path (`utils/exportTasks.js`, JSON/Markdown) is a few dozen lines of
  local code with no library behind it.

---

## Known Issues / Technical Debt

- ~~Every Apollo query is `fetchPolicy: 'no-cache'`~~ — **superseded 2026-09-05** (`d53b008`
  + same-day follow-up). The cache rule — four clauses, plus the one documented exception — is
  the doc comment at the top of `apps/bujogeek/frontend/src/apolloClient.js`; the `update`
  functions it describes live in `graphql/cacheUpdates.js`. The task LOG views
  (dailyTasks/weeklyTasks/monthlyTasks/allTasks/blockedTasks) remain `no-cache`, mirrored into
  React state by `TaskContext` — that part of this line is still true, see the rule's own
  "documented exception" section for why.
- TaskContext still holds dual array/object state shapes (works, but a refactor candidate).
- ~~Subtasks: schema fields exist (`parentTask`/`subtasks`, addSubtask mutation) but no frontend
  UI.~~ — **done 2026-09-05** (`d53b008`).
- CompletedSection not in keyboard nav.
- No frontend test coverage (gateway suites cover the data layer).
- Upcoming section reuses `monthlyTasks` for a 7-day window; the client-side filter does the real windowing.

---

## Environment

| Var | Notes |
|-----|-------|
| `BASEGEEK_URL` | SSO base URL |
| `GATEWAY_URL` | basegeek GraphQL gateway (compose) |
| `PORT` | Default `5005` |
| `CORS_ORIGINS`, `LOG_LEVEL` | Optional |
| VAPID keys | Live in **basegeek** env — see `DOCS/REMINDERS.md` |

Dev: backend on `5001`, frontend on `5173` (Vite).
