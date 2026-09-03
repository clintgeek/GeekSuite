# StartGeek v2 ("DashGeek") — Day at a Glance — Implementation Plan

*Written 2026-09-03, revised 2026-09-03. Status: shipped 2026-09-03.*

"DashGeek" is the working name for the **concept**: StartGeek plus a command
box and a handful of quiet widgets. The **app stays named `startgeek`** and
stays at **`https://start.clintgeek.com`**. There is no separate dashgeek app,
image, or domain. Do not create one.

The existing `apps/startgeek/` (v1: wallpaper, clock, weather, dock) is moved
to `archive/startgeek-v1/` and a fresh `apps/startgeek/` is built, borrowing
v1 files piecemeal.

This document is written so that a smaller model can execute it phase by phase
without re-deriving decisions. Every phase ends with a verification step. Do
the phases in order; do not start a phase until the previous one verifies.

---

## 0. Ground rules (read before any phase)

1. **The app id, directory, image, compose service, and domain are all
   `startgeek` / `start.clintgeek.com`.** "DashGeek" appears only in this
   document's title and in the `archive/dashgeek/` folder, which is an
   unrelated earlier design (MUI, "Ledger"). **Do not reuse anything from
   `archive/dashgeek/`, and do not delete it.**
2. **StoryGeek is out of scope.** No StoryGeek widget, query, or dock icon.
3. **StartGeek v2 is a standalone Vite app** like v1 — `npm`, its own
   `package-lock.json`, **no `workspace:*` dependencies**, no MUI, no Apollo.
   Reason: a `workspace:*` dep broke v1's Docker image build once
   (`DOCS/TODO_ORDER.md` item 5). Talk to the API with plain `fetch`.
4. **No new npm dependencies** beyond what v1 has (`react`, `react-dom`,
   `framer-motion`, `serve`; dev: `vite`, `tailwindcss`, `eslint` 8). If you
   believe one is needed, stop and ask.
5. **Backend changes go in basegeek only**, under
   `apps/basegeek/packages/api/src/graphql/`. StartGeek has no backend.
6. **Auth is cookie SSO.** Cookies are `HttpOnly`, domain `.clintgeek.com`.
   The frontend never reads a token. See `DOCS/CONTEXT.md`. Every request to
   basegeek uses `credentials: 'include'`.
7. **Design brief** (inherited from v1 `CONTEXT.md`): calm, minimal,
   intentional. *Not* an admin dashboard. No charts, KPIs, or dense card
   grids. Widgets read like short lines of text. Details are one click away
   in the owning app.
8. **Logged-out is a first-class state, not an error state.** Time, date,
   weather, web search, and a login button. It must be a complete start page
   on its own.
9. **Never print secret values** in logs, tests, or docs.
10. Follow `DEPLOY.md` and `build.sh`. Service name == app directory name ==
    `startgeek`. Nothing about deploy changes from v1 except the image
    contents.

---

## 1. Facts you would otherwise have to discover

### 1.1 GraphQL endpoint and auth

- Endpoint: `https://basegeek.clintgeek.com/graphql` (POST, JSON). Frontend
  reads `VITE_GRAPHQL_API_URL`, defaulting to that URL.
- basegeek auth middleware
  (`apps/basegeek/packages/api/src/middleware/auth.js`) reads the
  `geek_token` cookie first, then `Authorization: Bearer`. GraphQL context is
  `{ user: req.user || null }`. Resolvers throw `Unauthorized` / return empty
  when `user` is null.
- Identity check: `GET https://basegeek.clintgeek.com/api/users/me` with
  `credentials: 'include'` → `200 { user }` or `401`.
- Login redirect: `https://basegeek.clintgeek.com/login?app=startgeek&redirect=<current url>`.
  `startgeek` is in `VALID_APPS`
  (`apps/basegeek/packages/api/src/config/validApps.js`).
- Logout: `POST https://basegeek.clintgeek.com/api/auth/logout` with
  `credentials: 'include'`, then reload.
- CORS: `https://start.clintgeek.com` is in the production fallback list
  (`apps/basegeek/packages/api/src/lib/corsOrigins.js`). If production sets
  `CORS_ORIGINS` explicitly it must include that origin — **server env,
  flag to Chef, do not guess.**
- The CSRF guard checks `Origin` against the same allow-list; browsers set
  it automatically.
- Local dev: `vite.config.js` proxies `/graphql` and `/api` to local
  basegeek so cookies work on one origin. Copy the proxy block from
  `apps/bujogeek/frontend/vite.config.js`; if the port isn't obvious there,
  ask Chef (open question §6.3).

### 1.2 Real data model field names (use these, not guesses)

**BuJoGeek `Task`** — `apps/basegeek/packages/api/src/graphql/bujogeek/models/Task.js`
- text field is **`content`** (not `title`/`description`)
- `status` enum: `pending | completed | migrated_back | migrated_future | cancelled | blocked`
- `signifier` enum: `* @ x < > - ! ? #` — `@` means *event*
- owner: **`createdBy`** (ObjectId)
- `dueDate: Date|null`, `priority: 1..3|null`, `tags: [String]`, `note`

**BuJoGeek `Habit` / `HabitLog`** — same dir. `Habit.daysOfWeek: [Int]`
(0 = Sunday; empty = every day). One `HabitLog` row per day done.

**NoteGeek `Note`** — `apps/basegeek/packages/api/src/graphql/notegeek/models/`
- `title`, `content`, `type`, `tags`, `isLocked`, `isEncrypted`, `updatedAt`;
  owner `userId` (ObjectId)
- **Never return `content` for a note where `isLocked || isEncrypted`.**

**BookGeek `Book`** — `apps/basegeek/packages/api/src/graphql/bookgeek/models/book.js`
- currently reading is `shelf === 'reading'`
- progress **`readingProgress`** (0–100), pages **`pageCount`**, cover
  **`coverPath`** (not `currentPage`/`totalPages`/`coverUrl`)
- books are **shared across users by design**; no owner field. Auth check only.

**FitnessGeek** — use existing `dailySummary(date)` and `loginStreak`
resolvers. Do not touch fitnessgeek models (`DOCS/CONTEXT.md` duplicated-
schema hazard).

**FlockGeek `EggProduction`** — `ownerId` (string), `date`, `eggsCount`.
`Bird.status` inactive values: `deceased, culled, sold, rehomed`.

### 1.3 The existing `dashboard` GraphQL module is broken — replace it

`apps/basegeek/packages/api/src/graphql/dashboard/` was written for the
archived dashgeek using `strict:false` shadow models with guessed field
names. Its tests (`src/__tests__/dashboardOwnership.test.js`) check tenant
isolation only. Defects:

| Resolver | Bug |
|---|---|
| `dashSearch` (bujo) | queries `title`/`description`; Task has `content`/`note` → never returns tasks |
| `dashBookProgress` | reads `currentPage`/`totalPages`/`coverUrl` → always 0 %, no cover |
| `dashBujoSummary` | `upcomingEvents` filters `JournalEntry.type === 'event'`; events are Tasks with signifier `@`. Counts cancelled/migrated as open. |
| `dashRecentNotes` | returns `content.substring(0,120)` for locked/encrypted notes |
| `dashWeeklyDigest` | stub returning nulls |

Phase 2 replaces it with `graphql/glance/`. Keep and extend the ownership tests.

### 1.4 Quick-capture syntax already exists

`apps/bujogeek/frontend/src/utils/parseTaskInput.js` (298 lines, pure)
parses one line into
`{ content, signifier, priority, dueDate, tags, note, noteGeekNote, recurrenceRule, blocked, blockedReason }`.
Syntax: `#tag`, `!high|medium|low`, `/today /tomorrow /mon … /2026-09-10`,
`(daily|weekly|monthly)`, `^note` (task note), `$^note` (also creates a
NoteGeek note), `~blocked reason`, leading signifier `* @ - ? !`.

**Copy the file verbatim** to `apps/startgeek/src/lib/parseTaskInput.js`
(rule 3 forbids workspace imports). Add a one-line header: copied from
bujogeek, keep in sync.

Mutations (already in the schema):
```graphql
createTask(content: String!, signifier: String, priority: Int, tags: [String],
           dueDate: Date, note: String, recurrenceRule: String): Task!
blockTask(id: ID!, reason: String): Task!
createNote(title: String, content: String!, type: String, tags: [String!]): Note!
updateTaskStatus(id: ID!, status: String!): Task!
toggleHabitLog(habitId: ID!, date: String!): ToggleHabitLogResult!
```

### 1.5 v1 files to borrow (after archiving, copy from `archive/startgeek-v1/`)

```
index.html  vite.config.js  tailwind.config.js  postcss.config.js
.eslintrc.cjs  .gitignore  Dockerfile  docker-compose.yml  package.json
src/index.css  src/main.jsx  src/constants.js
src/components/BackgroundManager.jsx  DateTime.jsx  WeatherStrip.jsx
               AppDock.jsx  DockItem.jsx  icons.jsx
src/config/apps.jsx
src/context/WeatherContext.jsx  weatherContextValue.js
src/hooks/useTime.js  useWeather.js
src/services/weatherService.js
```
Do **not** copy `ResumeSection.jsx`, `WorldClocks.jsx` (dead mock code),
`dist/`, `node_modules/`, `.serena/`, `package-lock.json` (regenerate),
`CONTEXT.md`, `README.md` (write new ones).

`Dockerfile`, `docker-compose.yml` (port `3000:3000`, image
`ghcr.io/clintgeek/startgeek:latest`) and `build.sh` need **no changes**.
The release workflow auto-discovers `apps/*/Dockerfile`, so archiving v1
under `archive/` (not `apps/`) is what stops it publishing.

### 1.6 The 9-dot switcher

`packages/ui/src/navigation/GeekAppSwitcher.jsx` `GEEKSUITE_APPS` derives
every URL as `https://${id}.clintgeek.com`. The `startgeek` entry therefore
links to `startgeek.clintgeek.com`, but the app is served at
`start.clintgeek.com`. Phase 5 fixes this with an optional `url` override.

---

## 2. Target GraphQL surface (Phase 2)

Replace `graphql/dashboard/` with `graphql/glance/`. One root query for the
page plus a fixed search. All resolvers **import the real models** from
sibling modules; no `strict:false` shadow schemas.

```graphql
"""Everything the StartGeek front page needs, in one round-trip."""
type GlanceToday {
  date: String!                      # yyyy-MM-dd, server-local
  tasks: GlanceTasks!
  habits: [GlanceHabit!]!
  recentNotes: [GlanceNote!]!
  reading: [GlanceBook!]!
  fitness: GlanceFitness             # null if no fitnessgeek data for user
  flock: GlanceFlock                 # null if user owns no active birds
}

type GlanceTasks {
  due: [GlanceTask!]!                # dueDate on `date`, status pending
  overdue: [GlanceTask!]!            # dueDate < start of `date`, status pending — cap 10
  events: [GlanceTask!]!             # signifier '@', dueDate on `date`, not cancelled
  completedCount: Int!               # completedAt within the day
  blockedCount: Int!
}

type GlanceTask {
  id: ID!
  content: String!
  signifier: String
  status: String!
  priority: Int
  dueDate: Date
  tags: [String!]!
}

type GlanceHabit {
  id: ID!
  name: String!
  color: String
  doneToday: Boolean!
  currentStreak: Int!
}

type GlanceNote {
  id: ID!
  title: String!
  type: String!
  tags: [String!]!
  updatedAt: Date!
  snippet: String                    # null when isLocked || isEncrypted
}

type GlanceBook {
  id: ID!
  title: String!
  authors: [String!]!
  readingProgress: Int               # 0-100
  pageCount: Int
  coverPath: String
}

type GlanceFitness {
  calories: Float
  calorieGoal: Float
  mealsLogged: Int!
  loginStreak: Int
}

type GlanceFlock {
  activeBirds: Int!
  todayEggs: Int!
  weekEggs: Int!
}

type GlanceSearchResult {
  id: ID!
  app: String!                       # notegeek | bujogeek | bookgeek | flockgeek
  type: String!                      # note | task | book | bird
  title: String!
  snippet: String
  url: String!
  updatedAt: Date
}

extend type Query {
  glanceToday(date: String): GlanceToday!
  glanceSearch(query: String!, limit: Int = 12): [GlanceSearchResult!]!
}
```

Additive changes in existing modules:

- `notegeek/typeDefs.js`: add `sort: String` to `notes(...)` —
  `"updatedAt_desc" | "updatedAt_asc" | "createdAt_desc" | "title_asc"`.
  Default behaviour unchanged.
- `bookgeek/typeDefs.js`: add `readingProgress: Int`, `dateStarted: Date`,
  `dateFinished: Date` to `UpdateBookInput`; pass through in `updateBook`.

Deleted: all `dash*` queries and `Dash*` types. Before deleting run
`rg "dash[A-Z]\w+" apps packages --glob '!**/node_modules/**'` and confirm
only the files being replaced (and their test) match.

### 2.1 Resolver rules

- `getUserId(context)` throws `Unauthorized` when no user; every resolver
  calls it first, including book queries.
- Cast user id to `ObjectId` for bujo (`createdBy`) and notes (`userId`). If
  invalid, return empty — **never drop the owner filter.**
- `date` defaults to today; compute `dayStart`/`dayEnd` once (helpers exist
  in the old resolvers — carry them over).
- Habits: unarchived habits whose `daysOfWeek` is empty or includes
  `dayStart.getDay()`; `doneToday` = a `HabitLog` exists for that day. Reuse
  the streak computation from `bujogeek/resolvers.js` / `bujogeek/services/`.
- Recent notes: `find({ userId }).sort({ updatedAt: -1 }).limit(5)`; snippet
  only when neither `isLocked` nor `isEncrypted`.
- Reading: `Book.find({ shelf: 'reading' }).sort({ updatedAt: -1 }).limit(5)`.
- Fitness: import and call the existing `dailySummary` and `loginStreak`
  resolver functions with `(parent, args, context)`. On throw → `fitness: null`.
- Flock: active bird count; if 0 → `flock: null`; else aggregate `eggsCount`
  today and last 7 days.
- `glanceSearch`: escape regex metacharacters. Task branch matches
  `content` / `note`. URLs:
  note `https://notegeek.clintgeek.com/notes/<id>`,
  task `https://bujogeek.clintgeek.com/`,
  book `https://bookgeek.clintgeek.com/books/<id>`,
  bird `https://flockgeek.clintgeek.com/birds/<id>`.
- Wrap each per-app sub-fetch in `try/catch` so one app's DB being down
  degrades that section to empty/null. Log at `warn` via pino `logger`.

### 2.2 Tests (`apps/basegeek/packages/api/src/__tests__/`)

Rename `dashboardOwnership.test.js` → `glanceOwnership.test.js`, port each
case. Add `glanceFields.test.js` for **field correctness**:

- task `content: 'Buy eggs'`, `dueDate: today` → in `tasks.due` with that content
- signifier `@` task → in `tasks.events`
- `cancelled` task → nowhere
- `blocked` task → not in `due`/`overdue`; `blockedCount` = 1
- habit `daysOfWeek: []` returned every day; `[1]` only on a Monday (pin the date)
- `isEncrypted: true` note → `snippet: null`
- `shelf: 'reading', readingProgress: 42` → `42`
- `glanceSearch('eggs')` finds the task via `content`
- `glanceSearch('a.*b')` is literal

Run: `cd apps/basegeek/packages/api && npm test` (~344 tests; must stay green).

---

## 3. Frontend design (Phases 3–4)

### 3.1 Layout — single screen, no router

```
┌──────────────────────────────────────────────────────────────┐
│  ambient weather strip                              [Sign in] │  ← or avatar/sign-out when in
│                                                               │
│                         14:32                                 │
│                  Thursday, September 3                        │
│                                                               │
│   ┌───────────────────────────────────────────────────┐ (?)  │
│   │ Search or type > for a task, < for a note…  Google│      │  ← autofocused; right label = mode/engine
│   └───────────────────────────────────────────────────┘      │
│         3 tasks today · 1 overdue · 2 habits left             │  ← GlanceLine (logged in only)
│                                                               │
│   Today      ○ Call the vet  #flock                           │
│              ○ Draft budget  !high                            │
│              ● Morning run                                    │
│   Habits     ○ Read 20 min   ● Stretch                        │
│   Notes      Project Architecture · 2h ago                    │
│              Chicken coop plans · yesterday                   │
│   Reading    Dune — 41%                                       │
│   Fitness    1,240 / 2,000 kcal · 12-day streak               │
│   Flock      4 eggs today · 23 this week                      │
│                                                               │
│           [ notes ] [ bujo ] [ fitness ] [ flock ] [ books ]  │  ← dock (unchanged from v1)
└──────────────────────────────────────────────────────────────┘
```

- Clock sits in the upper third (`pt-[16vh]`), not dead centre as in v1.
- Below the box: one narrow column (`max-w-xl`), left labels
  `text-white/40`, body `text-white/85`. No borders, card backgrounds, or
  icons except the task/habit dot. Sections with no data are **omitted**.
- Every row links to the owning app. Task/habit dots toggle inline (§3.4).
- **Logged out:** weather, clock, date, box (web search only), `(?)`, dock,
  and a `Sign in` button top-right → login redirect (§1.1). No glance column,
  no GlanceLine. Nothing else changes.
- **Logged in:** `Sign in` becomes the username with a `Sign out` action.

### 3.2 The command box — behaviour spec

This is the headline feature. Get it exactly right.

**Focus**
- `<input autoFocus>` plus `useEffect(() => ref.current?.focus(), [])`, plus
  refocus on `window` `focus`.
- `/` anywhere focuses the box when it is not focused (ignore with a
  modifier held, or when the event target is an input/textarea/contentEditable).
  Vim users are the audience; this is non-negotiable.
- `Esc` blurs the box and closes any dropdown/modal.

**Modes** — decided by a leading prefix, evaluated live while typing and on
Enter. The right-hand label inside the box always shows the current mode.

| Leading chars | Mode | Logged out | Action on Enter |
|---|---|---|---|
| *(none)* | **Web** | ✓ | Open `engine.url + encodeURIComponent(q)` in the same tab. Never for empty input. |
| `>` | **Task → BujoGeek** | disabled | Strip `>`, `parseTaskInput`, `createTask`; if `noteGeekNote` also `createNote`; if `blocked` then `blockTask`. Toast "Task added". Refetch glance. |
| `<` | **Note → NoteGeek** | disabled | Strip `<`, `createNote({ content, type: 'text' })`. First line up to 60 chars becomes `title` if the content has a newline; otherwise `title` is null. Toast "Note saved". Refetch glance. |
| `?` | **Suite search** | disabled | Strip `?`, debounce 250 ms, `glanceSearch`; dropdown under the box; ↑/↓ move, Enter opens highlighted `url`, Esc closes. |

Logged out, typing `>` `<` or `?` shows the mode label as "Sign in to
capture" / "Sign in to search the suite" and Enter does nothing.

**Web engines** (logged in or out)
- `src/lib/engines.js`:
  ```js
  export const ENGINES = [
    { id: 'google', label: 'Google',     url: 'https://www.google.com/search?q=' },
    { id: 'ddg',    label: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=' },
    { id: 'brave',  label: 'Brave',      url: 'https://search.brave.com/search?q=' },
    { id: 'bing',   label: 'Bing',       url: 'https://www.bing.com/search?q=' },
    { id: 'wiki',   label: 'Wikipedia',  url: 'https://en.wikipedia.org/w/index.php?search=' },
  ]
  ```
- **Tab cycles the engine** while in Web mode (Shift+Tab cycles backwards).
  `preventDefault` on Tab only when the box is focused and in Web mode.
  The mode label shows the engine name. Selection is persisted in
  `localStorage['startgeek.engine']`; default `google`.
- Tab in any other mode does the browser default.

**Help — the `(?)` button**
- Small round button to the right of the box, `text-white/40`, hover `/80`.
  Also opened by `?` typed as the *only* character followed by Enter
  (i.e. an empty suite search), and closed by Esc or clicking outside.
- Modal content is a two-column cheat sheet, plain Tailwind, framer-motion
  fade. Sections:
  1. **Web search** — "Just type. Tab switches engine (Google, DuckDuckGo,
     Brave, Bing, Wikipedia). Your choice is remembered."
  2. **Keys** — `/` focus box · `Tab` next engine · `Esc` close · `↑ ↓ Enter` in results
  3. **`>` Task → BujoGeek** — `> Call the vet #flock /tomorrow !high` then
     the syntax table from §1.4 (`#tag`, `!priority`, `/date`, `(daily)`,
     `^note`, `$^note`, `~blocked reason`, leading `@` for events).
  4. **`<` Note → NoteGeek** — `< remember the milk`
  5. **`?` Search the suite** — notes, tasks, books, birds.
  A muted line at the bottom: "Capture and suite search need you signed in."
- Modal must be keyboard reachable: the `(?)` button is a real `<button>`
  and the modal traps focus while open.

### 3.3 Data layer (no Apollo)

`src/lib/graphql.js`
```js
const URL = import.meta.env.VITE_GRAPHQL_API_URL || 'https://basegeek.clintgeek.com/graphql'
export class UnauthorizedError extends Error {}
export async function gql(query, variables) {
  const res = await fetch(URL, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  })
  if (res.status === 401) throw new UnauthorizedError()
  const json = await res.json()
  if (json.errors?.length) {
    const unauth = json.errors.some(e => e.extensions?.code === 'UNAUTHENTICATED' || /unauthori[sz]ed/i.test(e.message))
    if (unauth) throw new UnauthorizedError()
    throw new Error(json.errors[0].message)
  }
  return json.data
}
```
`src/lib/queries.js` — `GLANCE_TODAY` (every field in §2), `GLANCE_SEARCH`,
and the five mutations from §1.4 as template strings.

`src/lib/basegeek.js` — `BASEGEEK = import.meta.env.VITE_BASEGEEK_URL || 'https://basegeek.clintgeek.com'`,
`loginUrl()`, `logout()`.

`src/context/SessionContext.jsx` — on mount `GET ${BASEGEEK}/api/users/me`;
exposes `{ user, status: 'loading'|'in'|'out', signOut, markOut }`.

`src/context/glanceContextValue.js`, `src/context/GlanceContext.jsx`,
`src/hooks/useGlance.js` — provider + hook split (same pattern as weather
and session, to avoid `react-refresh/only-export-components` and to share
one `GLANCE_TODAY` result across `CommandBox` and `GlanceColumn`). `App.jsx`
wraps the page in `GlanceProvider`. `useGlance()` returns
`{ data, loading, error, refetch }`; `refetch` is called after captures so
both the command box and the glance column re-render from the same state.

`src/lib/commandMode.js` — pure: `detectMode(input) → { mode: 'web'|'task'|'note'|'suite', query }`.

Toasts: `src/components/Toast.jsx`, ~20 lines, framer-motion, bottom-centre
above the dock, auto-dismiss 2.5 s.

### 3.4 Inline actions (Phase 4)

- Task dot → `updateTaskStatus(id, 'completed')` / back to `'pending'`;
  optimistic, then `refetch`.
- Habit dot → `toggleHabitLog(habitId, date)`.

---

## 4. Phases

### Phase 1 — Archive v1, scaffold v2 shell (no data)

1. `git mv apps/startgeek archive/startgeek-v1`. Remove
   `archive/startgeek-v1/dist` and `.serena` from the tree if they are
   tracked (check `git ls-files archive/startgeek-v1 | head`). Add a
   3-line `archive/startgeek-v1/README.md`: "StartGeek v1 (static launcher).
   Superseded 2026-09 by v2 in apps/startgeek — see DOCS/DASHGEEK_PLAN.md."
2. `mkdir apps/startgeek`; copy the files in §1.5 from the archive.
3. `package.json`: bump `"version": "2.0.0"`. Same name, scripts, deps.
   `npm install` in `apps/startgeek` to regenerate `package-lock.json`.
4. `src/App.jsx`: v1 layout with the clock moved to the upper third and an
   empty `<CommandBox />` + `<GlanceColumn />` slot below it. Wrap in
   `SessionProvider` (stub returning `status: 'out'` for now).
5. `src/config/apps.jsx`: keep the same five dock apps. No StoryGeek.
6. Write `apps/startgeek/CONTEXT.md` (identity, is/isn't, file map — model
   on v1's) and a 10-line `README.md` with dev/build commands.
7. Add `{ app: startgeek, dir: apps/startgeek }` to the `build-frontends`
   matrix in `.github/workflows/ci.yml`.

**Verify:** `cd apps/startgeek && npm run lint && npm run build` pass.
`npm run dev` shows the v1 look with the clock moved up. From repo root
`docker build -f apps/startgeek/Dockerfile -t geeksuite/startgeek:test .`
succeeds. `build.sh` and `docker-compose.yml` are byte-identical to v1's.

### Phase 2 — Backend: replace `dashboard/` with `glance/`

1. Run the `rg` check in §2.
2. Create `graphql/glance/typeDefs.js` + `resolvers.js` per §2/§2.1. Look at
   how sibling `resolvers.js` files obtain models (some use
   `getAppConnection(appName)` from `../shared/appConnections.js`) and match.
3. Swap `dashboard` → `glance` in `graphql/index.js`. Delete `graphql/dashboard/`.
4. `notes(sort)` and `UpdateBookInput` additions.
5. Tests per §2.2.

**Verify:** `npm test` green in `apps/basegeek/packages/api`. Run a real
`glanceToday` against a local basegeek with a session cookie and confirm
task `content` and book `readingProgress` values are real.

### Phase 3 — Frontend: session, command box, web search, help

1. `src/lib/{graphql,queries,basegeek,engines,commandMode}.js`,
   `src/context/SessionContext.jsx`, `src/hooks/useGlance.js` per §3.3.
2. Copy `parseTaskInput.js` per §1.4.
3. `src/components/CommandBox.jsx` per §3.2 — focus rules, mode label,
   Tab engine cycling, prefix dispatch.
4. `src/components/SearchResults.jsx` (suite results dropdown).
5. `src/components/HelpButton.jsx` + `HelpModal.jsx` per §3.2.
6. `src/components/SessionButton.jsx` — top-right `Sign in` / username +
   `Sign out`.
7. `src/components/Toast.jsx`.
8. `vite.config.js` dev proxy per §1.1. Committed `.env.example` with
   `VITE_GRAPHQL_API_URL` and `VITE_BASEGEEK_URL` production values (public
   URLs, not secrets).

**Verify (logged out):** cursor is in the box on load; `vim macros` +
Enter opens Google; Tab → label reads DuckDuckGo, Enter opens DDG, reload
still shows DuckDuckGo; `>x` shows "Sign in to capture" and Enter is a
no-op; `(?)` opens the modal, Esc closes it; `Sign in` goes to basegeek
login with `app=startgeek`.
**Verify (logged in):** `>Call vet #flock /tomorrow` creates a task visible
in BujoGeek; `<remember the milk` creates a NoteGeek note; `?eggs` lists
results, ↑/↓/Enter opens one; `/` from anywhere refocuses; `Sign out`
returns to the logged-out page. `npm run lint` and `npm run build` clean.

### Phase 4 — Glance column, inline actions, polish

1. `src/components/GlanceColumn.jsx` + `GlanceLine`, `TaskRow`, `HabitRow`,
   `NoteRow`, `BookRow`, `FitnessLine`, `FlockLine` per §3.1; sections
   omitted when empty; skeleton of three `h-4 w-48 bg-white/10 rounded
   animate-pulse` bars while loading. Never a spinner.
2. Inline toggles per §3.4.
3. Wallpaper scrim behind the column: gradient `from-black/0 via-black/30
   to-black/50` (SUITE_TODO notes v1 labels vanish on bright photos).
4. `prefers-reduced-motion`: skip framer-motion stagger when set.

**Verify:** toggles round-trip to BujoGeek; a user with no birds sees no
Flock row; lint/build clean.

### Phase 5 — Switcher fix and ship

1. `packages/ui/src/navigation/GeekAppSwitcher.jsx`: allow an optional
   `url` on entries — change the `.map` to
   `({ ...app, url: app.url || \`https://${app.id}.clintgeek.com\` })` — and
   set the startgeek entry to
   `{ id: 'startgeek', label: 'Start', monogram: 'ST', url: 'https://start.clintgeek.com' }`.
   Run `packages/ui` tests (`npm test` there; `navigation.test.jsx` covers
   the switcher).
2. `./build.sh startgeek` from repo root. `curl -I http://localhost:3000`
   → 200.
3. **Manual, Chef only:** if production basegeek sets `CORS_ORIGINS`
   explicitly, confirm it includes `https://start.clintgeek.com`.
4. Docs: `DOCS/SUITE_TODO.md` startgeek row → "v2: cookie SSO + basegeek
   GraphQL, no backend"; strike the `ResumeSection.jsx`/`WorldClocks.jsx`
   dead-code item (archived with v1); strike "startgeek joins the suite"
   theme item or leave with a note that v2 is wallpaper-dark by design.
   Flip this file's status line to *Shipped <date>*.

---

## 5. Out of scope (do not build, even if tempting)

- StoryGeek anything.
- Weekly digest / AI summary. Charts, sparklines, weight trend.
- User-configurable widgets, engine list editing, custom bangs.
- Editing notes/tasks inline beyond status toggles.
- `geek_theme` wiring — v2 is wallpaper-dark only.
- A StartGeek backend. A separate "dashgeek" app/domain/image.
- Anything in `archive/dashgeek/`.
- The GraphQL-consolidation cleanup in other apps (tracked in
  `DOCS/SUITE_TODO.md`, not here).

---

## 6. Decisions (resolved 2026-09-03 — these are settled, do not re-litigate)

1. **`>` task with no `/date` is created undated**, matching BujoGeek's inline
   add. Do not default it to today.
2. **`<` creates notes with `type: 'text'`.**
3. Local basegeek port for the Vite dev proxy: **resolved to 3000.**
   `apps/startgeek/vite.config.js` proxies both `/api` and `/graphql` to
   `http://localhost:3000` (basegeek's default `PORT`). Override with
   `VITE_BASEGEEK_PROXY` if your local basegeek is elsewhere. Both are
   `changeOrigin: true`, `secure: false` for local HTTPS-free use.
