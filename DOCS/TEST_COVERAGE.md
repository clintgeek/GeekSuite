# GeekSuite Test Coverage Report

_Generated 2026-04-21. Qualitative survey — not measured via coverage tooling._

## Summary

| App | Frontend | Backend | Test Framework | Test Files | Coverage |
|---|---|---|---|---|---|
| basegeek | React/Vite | Express + GraphQL | Jest | 5 | **Partial (~10–15%)** |
| bookgeek | React/Vite | Express | — | 0 | **None** |
| bujogeek | React/Vite | Express | Jest (configured, unused) | 0 | **Minimal (<5%)** |
| fitnessgeek | React/Vite | Express | Jest (configured, unused) | 0 | **Minimal (<5%)** |
| flockgeek | React/Vite | Express | — | 0 | **None** |
| notegeek | React/Vite | Express | Vitest (FE) + Jest (BE) | 36 | **Partial (~50%)** |
| startgeek | React/Vite | — | — | 0 | **None** |
| storygeek | React/Vite | Express | Jest (configured, unused) | 0 | **Minimal (<5%)** |

**Headline:** Only [notegeek](apps/notegeek/) and [basegeek](apps/basegeek/) have real tests. notegeek is the only app with frontend test coverage of any kind. Five apps have zero test files; three of those have Jest installed but unused.

---

## basegeek

**Structure:** monorepo — [packages/api/](apps/basegeek/packages/api/) (Express + GraphQL), [packages/ui/](apps/basegeek/packages/ui/) (React).

**Tooling:** Jest with ESM support, MongoMemoryServer, fakeRedis, supertest. Configured in [jest.config.js](apps/basegeek/packages/api/jest.config.js).

**Tested** (`packages/api/src/__tests__/`):
- [auth.test.js](apps/basegeek/packages/api/src/__tests__/auth.test.js) — login, refresh, logout, password reset, JWT encryption, token rotation + reuse detection
- [conversationService.test.js](apps/basegeek/packages/api/src/__tests__/conversationService.test.js) — create, messages, summarization, expiration
- [cryptoVault.test.js](apps/basegeek/packages/api/src/__tests__/cryptoVault.test.js) — AES-256-GCM round-trip
- [ambientService.test.js](apps/basegeek/packages/api/src/__tests__/ambientService.test.js) — weather, Spotify, Gmail parsing
- [oauthConnectionService.test.js](apps/basegeek/packages/api/src/__tests__/oauthConnectionService.test.js) — OAuth refresh lifecycle, family revocation

**Not tested:**
- GraphQL resolvers (all)
- ~28 route files under `routes/` (aiRoutes, apiKeys, apps, influx, mongo, etc.)
- ~80 service files except the 3 listed above
- All Mongoose models directly
- Entire `packages/ui/` frontend

---

## bookgeek

**Structure:** [api/](apps/bookgeek/api/) (13 source files), [web/](apps/bookgeek/web/) (6 source files).

**Tooling:** none. No test script, no test deps, no configs.

**Tested:** nothing.

**Not tested:** all routes (auth, ai, import), services (aiGeek, email), models, all React components, API client.

---

## bujogeek

**Structure:** [backend/](apps/bujogeek/backend/) (24 source files), [frontend/](apps/bujogeek/frontend/) (81 source files).

**Tooling:** Jest + supertest installed, `test` script present, but **no jest config and no test files**.

**Tested:** nothing.

**Not tested:** 5 routes, 5 controllers, 5 models (User, Task, JournalEntry, Template, TaskOrder), taskService, authMiddleware, entire frontend (81 files including components, hooks, stores).

---

## fitnessgeek

**Structure:** [backend/](apps/fitnessgeek/backend/) (64 source files), [frontend/](apps/fitnessgeek/frontend/) (162 source files), [tools/](apps/fitnessgeek/tools/) (InfluxDB MCP).

**Tooling:** Jest installed on backend, no config, no supertest, no test files. Frontend has nothing.

**Tested:** nothing.

**Not tested:** 18 routes (aiCoach, auth, fitness, food, goal, influx, log, meal, medication, settings, streak, summary, user, weight, …), 15+ services (aiCoach, aiInsights, aiRecovery, foodQuality, fitnessGoal, …), all models, all middleware, 162 frontend files, MCP tools. Largest untested app in the suite.

---

## flockgeek

**Structure:** [backend/](apps/flockgeek/backend/) (42 source files), [frontend/](apps/flockgeek/frontend/) (28 source files).

**Tooling:** none.

**Tested:** nothing.

**Not tested:** 9 routes/services/controllers, ~10 models (Bird, BirdNote, BirdTrait, EggProduction, Event, Group, …), all middleware, all 28 frontend files.

---

## notegeek

**Structure:** [backend/](apps/notegeek/backend/) (16 source files, 12 test files), [frontend/](apps/notegeek/frontend/) (51 source files, 24 test files).

**Tooling:**
- Backend: Jest 29 + supertest + mongodb-memory-server, Vitest config also present. Setup at [jest.setup.js](apps/notegeek/backend/jest.setup.js) with mongoose mocking.
- Frontend: Vitest 4 + React Testing Library + user-event, jsdom environment, v8 coverage provider. Config at [vitest.config.js](apps/notegeek/frontend/vitest.config.js).

**Tested — backend (12):**
- Controllers: auth, folders, notes, search, tags
- Models: Note, User
- Middleware: authMiddleware, errorMiddleware
- Routes: auth (supertest integration)
- Utils: tagValidation
- Config: db

**Tested — frontend (24):**
- Stores: authStore, folderStore, noteStore, tagStore
- Editor components (6)
- Note components (4)
- Misc components (7)
- api service, pages, resetUserStore util

**Not tested:**
- Backend: route integration for notes/search/tags, server.js bootstrap, migrations, lib/logger.js
- Frontend: App.jsx, AppBootstrapper.jsx, main.jsx, Layout.jsx, Login/Register, Header, NoteViewer, NoteHeader, SearchResults, MindMapNode, theme providers, ~15 utility/component files

**Caveat:** coverage skews to business logic (stores, controllers); heavy mocking means integration coverage is thinner than file counts suggest. No E2E tests.

---

## startgeek

**Structure:** [src/](apps/startgeek/src/) (17 files). Frontend-only, no backend.

**Tooling:** none.

**Tested:** nothing.

**Not tested:** all 17 React components/pages.

---

## storygeek

**Structure:** [backend/](apps/storygeek/backend/) (19 source files), [frontend/](apps/storygeek/frontend/) (18 source files).

**Tooling:** Jest + supertest installed on backend, `test` script present, **no config and no test files**. Frontend has nothing.

**Tested:** nothing.

**Not tested:** 4 routes (auth, story, game, settings), 4 controllers, models, services (storyService), authMiddleware, all 18 frontend files.

---

## Cross-cutting gaps

1. **No frontend tests outside notegeek.** Every other React app is untested on the UI side.
2. **No GraphQL resolver tests** in basegeek — the GraphQL layer is the primary API surface and is unverified.
3. **No E2E tests anywhere** in the suite (no Playwright, Cypress, or similar).
4. **No route integration tests** except notegeek's auth route and basegeek's auth flow.
5. **Three apps have Jest installed but no jest.config.js and no tests** (bujogeek, fitnessgeek, storygeek) — quickest wins: write first tests against existing scaffolding.
6. **Model/database tests are almost absent** — basegeek relies on MongoMemoryServer infra but doesn't exercise models directly; notegeek is the only app testing model behavior.

## Suggested priorities

- **notegeek:** close frontend integration gap (App, Layout, Login/Register) and backend route integration for notes/search/tags.
- **basegeek:** add GraphQL resolver tests — highest-value surface currently uncovered.
- **fitnessgeek:** largest untested surface; start with auth + food/fitness route smoke tests.
- **bujogeek / storygeek:** Jest is already wired — write a first auth test as a template, then expand.
- **bookgeek / flockgeek / startgeek:** decide whether to install test tooling or defer.
