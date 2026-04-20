# GeekSuite

Self-hosted monorepo of interconnected productivity apps built around a unified SSO auth system
and shared infrastructure. All apps authenticate through **basegeek** and share a GraphQL gateway.

---

## Apps

| App | Status | Description |
|-----|--------|-------------|
| **basegeek** | Running | Central hub — SSO auth, GraphQL gateway, AI integration, user management |
| **bujogeek** | Running | Bullet-journal daily planner (Today → Review → Plan) |
| **fitnessgeek** | Running | Health and fitness tracking — weight, blood pressure, nutrition, Garmin |
| **flockgeek** | Running | Poultry flock management and egg production tracking |
| **storygeek** | Running | Creative writing tool |
| **bookgeek** | Partial | Book library and reading tracker (format conversion pending) |
| **notegeek** | Running | Note-taking app — text, markdown, code, mind map, sketch |
| **dashgeek** | Stub | Dashboard |
| **startgeek** | Running | Personal-desktop launcher — clock, weather, world clocks, app dock |

---

## Monorepo layout

```
GeekSuite/
├── apps/                  # Individual applications
│   ├── basegeek/          # Central auth + GraphQL gateway
│   ├── bujogeek/          # Bullet journal
│   ├── fitnessgeek/       # Fitness tracking
│   ├── flockgeek/         # Flock management
│   ├── storygeek/         # Creative writing
│   ├── bookgeek/          # Book tracking
│   ├── notegeek/          # Notes
│   ├── dashgeek/          # Dashboard
│   └── startgeek/         # App launcher
├── packages/              # Shared libraries
│   ├── auth/              # @geeksuite/auth — SSO middleware + React auth hooks
│   ├── user/              # @geeksuite/user — ThemeProvider, themePreboot Vite plugin, /me handler
│   ├── api-client/        # @geeksuite/api-client — GeekSuiteApolloProvider (GraphQL gateway client)
│   └── ui/                # @geeksuite/ui — shared UI components
├── DOCS/                  # Suite-wide documentation
├── DEPLOY.md              # Deployment reference
├── build.sh               # Docker build + deploy script
└── pnpm-workspace.yaml    # pnpm monorepo config
```

---

## Shared packages

| Package | Purpose |
|---------|---------|
| `@geeksuite/auth` | `AuthProvider` + `useAuth` React hooks, `setupAxiosInterceptors` (attaches SSO cookie + handles refresh rotation), `loginRedirect` / `logout` / `getMe`, `GeekLogin` splash |
| `@geeksuite/user` | User store, `ThemeProvider`, `themePreboot` Vite plugin, `/users/bootstrap` |
| `@geeksuite/api-client` | `GeekSuiteApolloProvider` — Apollo Client pointed at basegeek's `/graphql` |
| `@geeksuite/ui` | Shared MUI-based UI components |

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
| `DEPLOY.md` | Deployment how-to |
| `DOCS/SUITE_TODO.md` | Prioritized suite-wide backlog |
| `DOCS/DEFERRED_WORK.md` | Running list of deferred items |
| `DOCS/SSO_OVERVIEW.md` | SSO architecture, risks, and migration plan |
| `DOCS/GEEK_SUITE_DESIGN_LANGUAGE.md` | Design system (colors, typography, components) |
| `DOCS/PWA_STANDARD.md` | PWA / service worker standard |
| `DOCS/CONTEXT.md` | Suite-level SSO context and architecture debt |

Each app has its own `README.md` and `DOCS/` directory with app-specific detail.

---

## Infrastructure

- **MongoDB** — primary data store (suite-shared instance, per-app databases)
- **Postgres** — relational store for basegeek's AI config + related tables
- **Redis** — session caching, rate limiting, refresh-token rotation state
- **InfluxDB** — time-series data (Garmin health metrics, basegeek request metrics)
- **Docker** — each app builds to a container image via `build.sh`
- **pnpm** — monorepo package management

---

## License

[GNU General Public License v3.0](LICENSE)
