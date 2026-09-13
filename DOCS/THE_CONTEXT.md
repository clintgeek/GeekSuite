# GeekSuite — The Context

Master architecture context and canonical reference for the GeekSuite monorepo.
Maintained as the primary orientation and operating truth for Sage and the engineering squad.

---

## 1. System Architecture Overview

GeekSuite is a self-hosted, multi-tenant productivity and life-management ecosystem composed of **8 active applications**, shared backend services, and a unified authentication and data access layer.

```mermaid
graph TD
    Client["Browser / PWA Client"] --> Edge["NGINX Edge (80 / 443)<br/>clintgeek.com"]
    Edge -->|"*.clintgeek.com"| Apps["App Frontend & Services"]
    Edge -->|"*/graphql"| Gateway["Apollo GraphQL Gateway<br/>(basegeek :8987)"]
    
    subgraph Suite Apps [8 Active Applications]
        basegeek["basegeek (:8987)<br/>Auth, Gateway, AI, Admin"]
        bookgeek["bookgeek (:1800)<br/>Library, Baskets, E-Reader"]
        bujogeek["bujogeek (:5005)<br/>Bullet Journal Planner"]
        fitnessgeek["fitnessgeek (:4080)<br/>Nutrition, Vitals, Garmin"]
        flockgeek["flockgeek (:5001)<br/>Flock Management, Eggs"]
        notegeek["notegeek (:9988)<br/>Notes, Code, Mindmaps"]
        startgeek["startgeek (:3000)<br/>Launcher, Hero, Dock"]
        storygeek["storygeek (:9977)<br/>Creative Writing, Codex"]
    end
    
    Gateway --> Datastores
    Apps --> Datastores
    
    subgraph Datastores [Shared Infrastructure (datageek_network)]
        Mongo[("MongoDB (:27018)<br/>userGeek & App Collections")]
        Postgres[("PostgreSQL (:55432)<br/>AI Config & Catalog")]
        Redis[("Redis (:6380)<br/>Sessions, Rates, Tokens")]
        Influx[("InfluxDB (:8086)<br/>Vitals & Request Metrics")]
    end
```

### 1.1 Central Auth Authority (basegeek SSO)
- **Host**: `https://basegeek.clintgeek.com` (host port `8987`).
- **User DB**: MongoDB `userGeek` database and collection on the shared instance (`192.168.1.17:27018`).
- **Cookie Domain**: `.clintgeek.com` — all subdomains share session cookies.
- **SSO Tokens**:
  - `geek_token` (Access JWT, 1-hour TTL, `HttpOnly: true`, `SameSite=Lax`, `Secure`).
  - `geek_refresh_token` (Refresh token, 30-day TTL, `HttpOnly: true`, `SameSite=Lax`, `Secure`, rotated on use with reuse-detection).
  - `geek_csrf` (Double-submit CSRF token, 30-day TTL, `HttpOnly: false`, `SameSite=Lax`, `Secure`).
- **Bootstrap Contract**: Apps do not read access tokens in JS. Frontends call `/api/users/me` or `/api/auth/refresh` through `@geeksuite/auth` / `@geeksuite/user`.

### 1.2 Apollo GraphQL Gateway
- **Single Apollo Server**: Mounted at `/graphql` in `apps/basegeek/packages/api/src/server.js` (host port `8987`).
- **Nginx routing**: Every app's Nginx configuration proxies `/graphql` to `http://192.168.1.17:8987/graphql`. The browser communicates with its own origin, avoiding cross-origin issues.
- **Merged schema**: Combines `shared`, `basegeek`, `bujogeek`, `fitnessgeek`, `flockgeek`, `bookgeek`, `notegeek`, and `glance` typeDefs/resolvers via `@graphql-tools/merge`.
- **Ownership & Auth**: Resolvers enforce user ownership using `context.user` verified via in-process JWT validation against `userGeek`.

### 1.3 Active Applications & Port Map
All containers run on `server` (`192.168.1.17`) attached to `datageek_network` (bridge):

| App | Host Port | Internal Port | Stack | Status / Role |
|-----|-----------|---------------|-------|---------------|
| **basegeek** | `8987` | `8987` | Vite + React / Node + Express | SSO authority, GraphQL gateway, AIGeek director |
| **bookgeek** | `1800` | `1800` | Vite + React + Tailwind / Node | Book catalog, format conversion, device baskets |
| **bujogeek** | `5005` | `5005` | Vite + React + MUI 7 / Node | Bullet journal (pure GraphQL consumer) |
| **fitnessgeek** | `4080` | `3001` | Vite + React / Node (ESM, v20) | Nutrition, weights, vitest suites, Garmin sync |
| **flockgeek** | `5001` | `5001` | Vite + React / Node + Express | Poultry tracking, harvest logging |
| **notegeek** | `9988` | `9988` | Vite + React / Node + Express | Note-taking, mind maps, tags |
| **startgeek** | `3000` | `3000` | Vite + React + Tailwind (serve) | Standalone launcher, quick-glance, dock |
| **storygeek** | `9977` | `9977` | Vite + React / Node + Express | Interactive writing, narrative generation |

### 1.4 Shared Packages (`packages/*`)
- **`@geeksuite/auth`**: SSO client hooks (`useAuth`, `AuthProvider`), Axios cookie/token interceptors, CSRF header attachment, BroadcastChannel logout.
- **`@geeksuite/user`**: User store, ThemeProvider, `themePreboot` Vite plugin, server-side session validator (`localSessionValidator`, `optionalUser`, `requireUser`).
- **`@geeksuite/api-client`**: `GeekSuiteApolloProvider` — shared Apollo Client preconfigured with auth link, CSRF headers, and error retry handlers.
- **`@geeksuite/ui`**: Shared MUI component library, GeekShell, GeekTopBar, GeekSidebar, GeekBottomNav, GeekDialog, GeekSheet, GeekFab, themes.
- **`@geeksuite/utils`**: ISO-8601 calendar date (`toUtcMidnight`, `utcMidnightToday`, `utcDateString`) and local instant (`localDateString`) helpers.
- **`@geeksuite/logger`**: Standardized Pino HTTP logger and serializers with automatic credential redaction (passwords, tokens, cookies).
- **`@geeksuite/schemas`**: Canonical Mongoose schema definitions shared across apps and gateway (FitnessGeek models, tripwire tests).
- **`@geeksuite/crypto-vault`**: AES-256-GCM symmetric encryption for secrets at rest (`KEY_VAULT_SECRET`).
- **`@geeksuite/eslint-config`**: Shared ESLint 9 flat config across packages and applications.

### 1.5 Shared Datastores
All datastores run under Docker Compose in `apps/basegeek/docker-compose.yml`:
- **MongoDB** (`datageek_mongodb`): Port `27018 -> 27017`. Auth database `userGeek`, plus per-app databases.
- **PostgreSQL** (`datageek_postgres`): Port `55432 -> 5432`. Relational store for AI configuration, models, and provider metadata.
- **Redis** (`datageek_redis`): Port `6380 -> 6379`. Session validation, rate limiting, and token rotation tracking.
- **InfluxDB** (`datageek_influxdb`): Port `8086 -> 8086`. Time-series metrics (Garmin health vitals, system metrics).

---

## 2. Core Reference Links

For granular, domain-specific specifications and operational procedures, link directly to:

- [DOCS/RUNBOOK.md](file:///mnt/Media/Projects/GeekSuite/DOCS/RUNBOOK.md) — Comprehensive operations manual: box architecture, network topology, container environments, Nginx reverse proxy, CI/CD pipeline, Watchtower updates, and known failure modes.
- [DOCS/CONTEXT.md](file:///mnt/Media/Projects/GeekSuite/DOCS/CONTEXT.md) — SSO deep dive: token specs, cookie attributes, double-submit CSRF mechanics, refresh rotation, and 503 auth unavailable contracts.
- [DOCS/GRAPHQL.md](file:///mnt/Media/Projects/GeekSuite/DOCS/GRAPHQL.md) — Apollo Gateway documentation: schema composition, shared types (`AIProvenance`, `DeleteResponse`), and complete per-app query/mutation surfaces.
- [DOCS/CICD.md](file:///mnt/Media/Projects/GeekSuite/DOCS/CICD.md) — GitHub Actions workflows (`ci.yml`, `release.yml`, `mobile-harness.yml`), GHCR image tagging, and deployment mechanics.
- [DOCS/GEEK_SUITE_DESIGN_LANGUAGE.md](file:///mnt/Media/Projects/GeekSuite/DOCS/GEEK_SUITE_DESIGN_LANGUAGE.md) — Visual standards: Studio Slate and GeekSuite tokens, typography, dark/light contrast rules, and mobile shell grammar.
- [STATUS.md](file:///mnt/Media/Projects/GeekSuite/STATUS.md) — Live system health, recent wave completion logs, and active Chef decision items.
- [DEPLOY.md](file:///mnt/Media/Projects/GeekSuite/DEPLOY.md) — Deployment instructions, shared secret requirements, and environment configuration.

---

## 3. Known Critical Rules & Contracts

### 3.1 UTC in Containers
- **All Docker containers run in UTC** (no tzdata dependency; Q42 maintains container clock at UTC).
- **Date Separation Principle**:
  - **Calendar Dates** (due dates, log dates, egg harvests, streaks): Must be stored and queried as **UTC midnight** (`00:00:00.000Z`). Use `@geeksuite/utils` (`toUtcMidnight`, `utcMidnightToday`, `utcDateString`, `displayCalendarDate`). Never mix with local midnight or un-normalized ISO strings.
  - **Instants in Time** (created timestamps, audit events, sensor readings): Store as full ISO-8601 UTC strings. Format for display using the browser's local timezone.
- **No Local Midnight in Queries**: Never use `setHours(0,0,0,0)` on backend dates; use `setUTCHours(0,0,0,0)`.

### 3.2 Cookie-First Authentication & CSRF
- **HttpOnly Access & Refresh**: `geek_token` and `geek_refresh_token` are `HttpOnly: true`. Web clients never touch them directly; no tokens in `localStorage`.
- **Double-Submit CSRF (`geek_csrf`)**:
  - State-changing requests (`POST`, `PUT`, `PATCH`, `DELETE`) authenticated by cookie to basegeek must transmit `X-CSRF-Token` header matching the `geek_csrf` cookie value.
  - Handled automatically by `@geeksuite/auth` (Axios interceptor) and `@geeksuite/api-client` (Apollo link).
  - Current mode: `CSRF_TOKEN=report` (monitored for zero warnings before flipping to `enforce`).
- **Cross-Tab Logout**: Handled via BroadcastChannel name `geeksuite-auth` and message `{ type: "LOGOUT" }`.

### 3.3 The 503 Auth Unavailable Contract
- **Contract Definition**: When session validation is temporarily unreachable (network blip, gateway timeout, database lag, DNS failure), backends must return:
  ```http
  HTTP/1.1 503 Service Unavailable
  Retry-After: 5
  Content-Type: application/json

  { "message": "Authentication service unavailable", "code": "AUTH_UNAVAILABLE", "retryAfter": 5 }
  ```
- **Fails Closed on Both Paths**: Holds for `requireUser()` AND `optionalUser()`. An unavailable check must **never** fall through to anonymous mode, which would cause downstream resolvers to return `UNAUTHENTICATED`.
- **Client Handling**: Clients must **never** log out or clear session on 503 or 5xx status codes. Only an explicit 401 or GraphQL `UNAUTHENTICATED` error initiates a logout sequence.
