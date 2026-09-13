# GeekSuite

[![CI](https://github.com/clintgeek/GeekSuite/actions/workflows/ci.yml/badge.svg)](https://github.com/clintgeek/GeekSuite/actions/workflows/ci.yml)
[![Release images](https://github.com/clintgeek/GeekSuite/actions/workflows/release.yml/badge.svg)](https://github.com/clintgeek/GeekSuite/actions/workflows/release.yml)
[![Mobile Harness](https://github.com/clintgeek/GeekSuite/actions/workflows/mobile-harness.yml/badge.svg)](https://github.com/clintgeek/GeekSuite/actions/workflows/mobile-harness.yml)

Self-hosted monorepo of interconnected productivity apps built around a unified SSO auth system
and shared infrastructure. All apps authenticate through **basegeek** and share an Apollo GraphQL gateway
with service-layer ownership enforcement.

**How it deploys:** every push to `main` runs CI (gateway/api tests, frontend build smoke, mobile harness, syntax check, gql audit)
and publishes per-app images to GHCR tagged `latest` and `sha-<commit>`; the production box
pulls new images via Watchtower — no inbound access from CI. Details in [DOCS/CICD.md](DOCS/CICD.md).

---

## Apps

| App | Status | Port | Description |
|-----|--------|------|-------------|
| **basegeek** | Running | `8987` | Central hub — SSO auth, GraphQL gateway, AIGeek director, user management |
| **bujogeek** | Running | `5005` | Bullet-journal daily planner (Today → Review → Plan) |
| **fitnessgeek** | Running | `4080` | Health and fitness tracking — weight, blood pressure, nutrition, Garmin |
| **flockgeek** | Running | `5001` | Poultry flock management and egg production tracking |
| **storygeek** | Running | `9977` | Creative writing tool with Codex and narrative generation |
| **bookgeek** | Running | `1800` | Book library + reading tracker — on-demand format conversion, e-reader device baskets |
| **notegeek** | Running | `9988` | Note-taking app — text, markdown, code, mind map, sketch |
| **startgeek** | Running | `3000` | Personal-desktop launcher — clock, weather, world clocks, app dock |

---

## Monorepo layout

```
GeekSuite/
├── apps/                  # Active applications
│   ├── basegeek/          # Central auth + GraphQL gateway (:8987)
│   ├── bookgeek/          # Book tracking (:1800)
│   ├── bujogeek/          # Bullet journal (:5005)
│   ├── fitnessgeek/       # Fitness tracking (:4080)
│   ├── flockgeek/         # Flock management (:5001)
│   ├── notegeek/          # Notes (:9988)
│   ├── startgeek/         # App launcher (:3000)
│   └── storygeek/         # Creative writing (:9977)
├── archive/               # Retired / shelved apps
│   ├── babelgeek/         # Translation tool
│   ├── dashgeek/          # Dashboard (stub)
│   ├── musicgeek/         # Music library
│   ├── photogeek/         # Photo management
│   └── stackgeek/         # (stub)
├── packages/              # Shared libraries
│   ├── auth/              # @geeksuite/auth — SSO middleware + React auth hooks
│   ├── user/              # @geeksuite/user — ThemeProvider, themePreboot, session validation
│   ├── api-client/        # @geeksuite/api-client — GeekSuiteApolloProvider (GraphQL client)
│   ├── ui/                # @geeksuite/ui — shared UI components, GeekShell, mobile primitives
│   ├── utils/             # @geeksuite/utils — calendar-date and local-time helpers
│   ├── logger/            # @geeksuite/logger — pino logging + automatic redaction
│   ├── schemas/           # @geeksuite/schemas — Mongoose schemas shared by multiple writers
│   ├── crypto-vault/      # @geeksuite/crypto-vault — AES-256-GCM secrets-at-rest
│   └── eslint-config/     # @geeksuite/eslint-config — shared flat ESLint 9 config
├── tools/                 # Developer & operational tooling
│   ├── mobile-harness/    # Playwright phone screenshot & grammar probe (CI-enforcing)
│   ├── kill-orphans.mjs   # Stale agent dev process cleanup script
│   ├── syntax-check.mjs   # AST-level syntax gate across JS/MJS/CJS
│   └── gql-arg-audit.mjs  # GraphQL query & argument schema auditor
├── DOCS/                  # Suite-wide documentation & architecture
├── DEPLOY.md              # Deployment reference & environment variables
├── STATUS.md              # Live operational status and wave logs
├── build.sh               # Docker build + deploy script
└── pnpm-workspace.yaml    # pnpm monorepo config
```

---

## Shared packages

| Package | Purpose |
|---------|---------|
| `@geeksuite/auth` | `AuthProvider` + `useAuth` React hooks, `setupAxiosInterceptors` (attaches SSO cookie + handles refresh rotation), `loginRedirect` / `logout` / `getMe`, `GeekLogin` splash |
| `@geeksuite/user` | User store, `ThemeProvider`, `themePreboot` Vite plugin, `/users/bootstrap`, server session validation (`localSessionValidator`, `optionalUser`, `requireUser`) |
| `@geeksuite/api-client` | `GeekSuiteApolloProvider` — Apollo Client pointed at basegeek's `/graphql` with CSRF double-submit token and 503 retry handling |
| `@geeksuite/ui` | Shared MUI-based UI components, GeekShell, navigation primitives, mobile sheets/dialogs, theme factory |
| `@geeksuite/utils` | Calendar-date (`toUtcMidnight`, `utcMidnightToday`, `utcDateString`) and local-time helpers (`localDateString`) — strict separation of calendar dates from instants |
| `@geeksuite/logger` | Standardized Pino logger (`createLogger`, `createHttpLogger`, `installShutdownHooks`) with automatic credential redaction across all seven backends |
| `@geeksuite/schemas` | Canonical Mongoose schemas shared across apps and gateway — all 11 FitnessGeek pairs consolidated with parity tripwires |
| `@geeksuite/crypto-vault` | AES-256-GCM encryption for secrets at rest (`KEY_VAULT_SECRET`) — basegeek provider keys and fitnessgeek Garmin password |
| `@geeksuite/eslint-config` | Shared ESLint 9 flat config across all apps and packages |

### Developer & Operational Tooling (`tools/`)

- `tools/mobile-harness` (`@geeksuite/mobile-harness`): Playwright-driven mobile grammar and WCAG accessibility probe running 139 scenes in CI (`.github/workflows/mobile-harness.yml`).
- `tools/kill-orphans.mjs`: Stale dev process cleaner for stopped agent processes (`vite`, `vitest`, `playwright`, `jest`).
- `tools/syntax-check.mjs`: AST-level syntax gate validating all JS/MJS/CJS files in CI.
- `tools/gql-arg-audit.mjs`: Schema auditor asserting all frontend GraphQL query fields and arguments match the gateway SDL.

---

## How to deploy

```bash
./build.sh bujogeek      # Build + deploy a single app
./build.sh --all         # Build + deploy everything
```

See `DEPLOY.md` for full deployment reference, Docker Compose details, and env var setup.

---

## Documentation

| Doc | Purpose |
|-----|---------|
| [DOCS/THE_CONTEXT.md](DOCS/THE_CONTEXT.md) | **Master Context** — Monorepo architecture, app port map, shared datastores, and critical invariants |
| [DOCS/THE_PLAN.md](DOCS/THE_PLAN.md) | **Roadmap & Plan** — Current operational health, Night 2 completions, open Chef decision items (Q18b CSRF) |
| [DOCS/RUNBOOK.md](DOCS/RUNBOOK.md) | **Runbook** — Box operations, container networks, Nginx reverse proxy, deploy/rollback, and failure modes |
| [DOCS/CONTEXT.md](DOCS/CONTEXT.md) | **SSO Architecture** — Cookie mechanics, JWT structure, double-submit CSRF contract, and 503 auth error contract |
| [DOCS/GRAPHQL.md](DOCS/GRAPHQL.md) | **GraphQL Gateway** — Apollo gateway map, schema merging, shared types, and per-app queries/mutations |
| [DOCS/CICD.md](DOCS/CICD.md) | **CI/CD Pipeline** — GitHub Actions workflows, GHCR releases, Watchtower deployment, and test gates |
| [DOCS/SUITE_TODO.md](DOCS/SUITE_TODO.md) | **Suite Backlog** — Active, queued, and prioritized tasks across all apps |
| [DOCS/GEEK_SUITE_DESIGN_LANGUAGE.md](DOCS/GEEK_SUITE_DESIGN_LANGUAGE.md) | **Design System** — Studio Slate tokens, typography, dark/light contrast rules, and mobile shell grammar |
| [STATUS.md](STATUS.md) | **Operational Status** — Live container status, wave completion log, and verified system health |
| [DEPLOY.md](DEPLOY.md) | **Deployment Guide** — Container build/run instructions, environment variables, and shared secrets |
| [DOCS/ARCHIVE/](DOCS/ARCHIVE/) | **Historical Archive** — Landed 2026 logs, retired sprint plans, decision records, and migration retrospectives |

Each app has its own `README.md` and `DOCS/` directory with app-specific detail.

---

## Infrastructure

- **MongoDB** — primary data store (suite-shared instance `:27018`, per-app databases + `userGeek`)
- **Postgres** — relational store for basegeek's AI config + related tables (`:55432`)
- **Redis** — session caching, rate limiting, refresh-token rotation state (`:6380`)
- **InfluxDB** — time-series data for Garmin health metrics and request monitoring (`:8086`)
- **Docker** — each app builds to a container image via `build.sh` on `datageek_network`
- **pnpm** — monorepo package management across apps and shared packages

---

## License

[GNU General Public License v3.0](LICENSE)
