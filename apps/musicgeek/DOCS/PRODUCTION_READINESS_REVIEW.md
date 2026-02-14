# MusicGeek / GuitarGeek – Production Readiness Review

_Date: 2025-11-22_
_Reviewer: Sage (Principal Engineer pass)_

---

## 1. High-Level Assessment

- **Overall maturity**: Solid foundation with good separation of concerns (backend services, frontend services/contexts, BaseGeek SSO, Mongo migration docs). Reasonable for a first production deployment on a **Docker-based runtime** after a focused hardening pass.
- **Primary risks**:
  - Legacy PostgreSQL assumptions still present (envs, error handling, dependencies, docker-compose) despite Mongo-first runtime.
  - Auth/session handling uses access + refresh tokens in `localStorage` with client-side refresh, which matches the FitnessGeek/BaseGeek pattern but still lacks CSRF/httpOnly-cookie hardening and increases XSS blast radius.
  - Logging & monitoring are file/console-only; no centralized metrics, alerts, or health probes defined for orchestration.
  - Docker configuration is dev-focused (`npm run dev` in containers, envs not clearly split dev/prod).
- **Readiness verdict**: _Not yet “production Grade A”_, but **close**. With 1–2 strong engineering days focused on the items below, this can be moved into a state where I’d be comfortable running it for real users on a small/medium scale.

---

## 2. Architecture Snapshot

### 2.1 Backend

- **Stack**: Node 18+/Express, MongoDB via Mongoose, Winston logging, BaseGeek SSO.
- **Entrypoint**: `backend/src/server.js`
  - Connects to Mongo via `src/config/mongo.js` (uses `MONGO_URI` from env, logs success, exits on failure).
  - Starts Express app from `src/app.js` using port from `src/config/config.js`.
  - Handles `SIGTERM` for graceful shutdown.
- **App wiring**: `backend/src/app.js`
  - Security: `helmet`, CORS with origin from env (`CORS_ORIGIN`).
  - Logging: `morgan` in dev; in non-dev logs via Winston to files.
  - Health check: `GET /health` returns `status: ok` + timestamp.
  - Routes:
    - `/api/auth` → `src/routes/auth.js` (BaseGeek SSO integration)
    - `/api/users`, `/api/lessons`, `/api/progress`, `/api/practice`, `/api/achievements`, `/api/instruments`
  - Error handling: centralized `errorHandler` / `notFoundHandler` in `src/middleware/errorHandler.js`.
- **Auth & SSO**:
  - `src/controllers/authController.js` proxies register/login/refresh to BaseGeek and maintains local `UserProfile` in Mongo.
  - `src/middleware/auth.js` verifies JWTs with shared `JWT_SECRET` from `config.jwt.secret` (must match BaseGeek).
  - Endpoints documented and tested in `DOCS/BASEGEEK_INTEGRATION.md`, `DOCS/SSO_INTEGRATION_COMPLETE.md`, `DOCS/TESTING_SSO.md`.
- **Data layer**:
  - Mongo models under `src/models/`, services under `src/services/` (e.g., `lessonService`, `progressService`, etc.).
  - Legacy PostgreSQL: `pg` dependency and `node-pg-migrate` scripts remain in `backend/package.json`, and error handler still special-cases PG error codes (`23505`, `23503`). Runtime usage of `pg` has been removed.
- **Config**: `src/config/config.js`
  - Loads `.env` from repo root.
  - Exposes `port`, `nodeEnv`, `databaseUrl` (legacy), `baseGeekUrl`, JWT config, CORS origin, and some XP constants.

### 2.2 Frontend

- **Stack**: React 18, Vite, React Router v6, MUI, React Context for auth/progress/instrument/theme.
- **Entrypoint**: `frontend/src/main.jsx` → `App.jsx` → `router.jsx`.
- **Routing**: `frontend/src/router.jsx`
  - Public: `/`, `/login`, `/register`.
  - Protected via `ProtectedRoute`: instruments selection, tuner pages, metronome, lessons list/detail, practice session page, profile.
- **Auth client**:
  - `frontend/src/context/AuthContext.jsx` + `frontend/src/services/userService.js`.
  - Stores `authToken`, `refreshToken`, and serialized `currentUser` in `localStorage`, matching the FitnessGeek/BaseGeek pattern.
  - Supports login/register/SSO-validate flows via `/api/auth` endpoints; logout clears all auth-related local storage.
  - Implements client-side token refresh via `/api/auth/refresh` when API requests return 401/403, rotating access and refresh tokens.
- **API client**: `frontend/src/services/api.js`
  - Uses `import.meta.env.VITE_API_URL` (also set in `.env`/docker-compose) as API base.
  - Automatically attaches `Authorization: Bearer {authToken}` when present.
  - Normalized error handling via `ApiError` (includes status + payload).

### 2.3 Infrastructure & Ops

- **Docker**: `docker-compose.yml`
  - `backend` container:
    - Builds from `backend/Dockerfile`.
    - Uses `npm run dev` and mounts source + node_modules volume (dev-only pattern).
    - Env includes both Mongo and **Postgres** related vars, plus `DATABASE_URL` and JWT/BASEGEEK/CORS.
  - `frontend` container:
    - Builds from `frontend/Dockerfile`.
    - Uses `npm run dev`, mounts source + node_modules.
    - Exposes port 3000, with `VITE_API_URL=http://localhost:3001`.
  - A single bridge network `musicgeek_network`.
- **Environment management**:
  - `.env` exists at repo root (dev-centric, contains real host IPs and credentials for PG and Mongo).
  - `.env.development.example` documents expected vars (including `MONGO_URI`, `JWT_SECRET`, `BASEGEEK_URL`, `VITE_API_URL`).
  - `.gitignore` excludes `.env` and `*.env`; good baseline.
- **Migration docs**:
  - `DOCS/MONGO_MIGRATION_PLAN.md` and `MIGRATION_NOTES.md` clearly document the PG→Mongo transition, schema strategy, and JWT ObjectId mismatch caveat.
- **SSO docs**:
  - `DOCS/BASEGEEK_INTEGRATION.md`, `SSO_INTEGRATION_COMPLETE.md`, `TESTING_SSO.md` provide strong, production-minded documentation for auth flows and troubleshooting.

---

## 3. Strengths (Production-Friendly)

- **Clear backend composition**:
  - Single entrypoint, central Express app, route/service layering, and consistent middleware.
  - Mongo connection is centralized and logged.
- **SSO implementation quality**:
  - Matches the "FitnessGeek" pattern, with refresh endpoint, optional auth, and strong logging.
  - Dedicated docs and test scripts for JWT verification and end-to-end SSO.
- **Error handling**:
  - Centralized error middleware with opinionated mapping for JWT failures and DB issues.
  - 404 handler for unknown routes.
- **Health check**:
  - `/health` endpoint available for liveness checks.
- **Frontend structure**:
  - Router + context architecture cleanly separates concerns (auth, progress, instrument, theme).
  - API client centralizes base URL, headers, and error handling.
- **Documentation quality**:
  - Handoff document and SSO/migration docs reduce bus factor and clarify intended flows.

These reduce operational surprises and make the system debuggable and maintainable in production.

---

## 4. Risks & Gaps (By Priority)

### 4.1 P0 – Must Address Before Production

1. **Dev-style Docker Compose for Production**
   - **Issue**: `docker-compose.yml` uses `npm run dev` for both backend and frontend, mounts source, and assumes local dev-style behavior, while the intended runtime for both MVP and production is Docker containers.
   - **Impact**: Unbounded CPU/memory overhead, hot-reload behavior in prod, and harder-to-reproduce deployments.
   - **Recommendation**:
     - Create a **production** docker-compose (or overlay) that:
       - Builds backend image and runs `npm start` (no nodemon).
       - Builds frontend with `npm run build` and serves built assets (e.g., via a static file server or Vite preview/Node adapter).
       - Drops source-mount volumes; rely on built artifacts.

2. **Secrets & Configuration Hygiene**
   - **Issue**:
     - `.env` currently includes real DB credentials and JWT secrets (OK for local dev, but should never be committed or mirrored to docs). It’s gitignored, but the same values appear verbatim in docs under `DOCS/BASEGEEK_INTEGRATION.md` / `SSO_INTEGRATION_COMPLETE.md`.
   - **Impact**: If docs are public or shared, secrets are effectively leaked.
   - **Recommendation**:
     - Treat docs as non-secret: **remove or redact actual secret values** from documentation (use placeholders and reference infrastructure secrets by name).
     - Store production secrets exclusively in your secrets manager / deployment environment.

3. **Auth Token Storage & Session Security**
   - **Current behavior**:
   - Frontend stores access and refresh tokens in `localStorage` (`authToken`, `refreshToken`) plus `currentUser`, and uses them for all API calls. When a request returns 401/403, the client calls `/api/auth/refresh` and rotates tokens, matching the documented FitnessGeek/BaseGeek pattern.
   - **Issue**:
   - Tokens in `localStorage` increase XSS blast radius and do not use httpOnly cookies or CSRF protections.
   - **Impact**: Acceptable for a small, controlled MVP (consistent with other Geekverse apps), but not ideal for higher-sensitivity or broader public deployments.
   - **Recommendation (minimum for MVP)**:
   - Add content security hardening on the frontend and audit for XSS vectors.
   - Ensure failed refresh (invalid/expired refresh token) consistently clears auth state and forces re-login.
   - **Recommendation (ideal, iterative)**:
   - Move refresh tokens to **httpOnly secure cookies** and keep only short-lived access tokens in memory (not `localStorage`).
   - Add CSRF protection when cookies are used (CSRF token or same-site cookies strategy).

4. **Monitoring, Metrics, and Centralized Logging**
   - **Issue**:
     - Logging is via Winston to local files and console; no standard integration with centralized log/metrics systems.
     - No explicit health/readiness endpoints beyond `/health`, no metrics endpoint.
   - **Impact**: Hard to operate reliably in production; issues may go unnoticed.
   - **Recommendation**:
     - Adjust logger for containerized production to log **JSON to stdout/stderr** instead of local disk, and configure your platform (e.g., CloudWatch, ELK, Loki) to collect and index logs.
     - Keep `/health` as liveness and optionally add a lightweight `/ready` readiness check (e.g., verifies Mongo connectivity and BaseGeek reachability, with strict timeout).

5. **Mongo Migration Completeness & Legacy PostgreSQL Footprint**
   - **Issue**:
     - Runtime code appears to be fully Mongo-based, but leftover PG pieces remain:
       - `pg` and `node-pg-migrate` entries in `backend/package.json`.
       - `DATABASE_URL` and PG env vars still wired into `docker-compose.yml`.
       - Error handler still explicitly handles PG-specific error codes.
   - **Impact**: Confusing operational story, potential misconfiguration or accidental PG re-introduction; more cognitive load for new maintainers.
   - **Recommendation**:
     - Confirm that no production workloads rely on PG; then:
       - Remove unused PG dependencies and migration scripts from `backend/package.json`.
       - Remove PG env vars and `DATABASE_URL` from **production** docker-compose.
       - Update `errorHandler` to handle Mongo/Mongoose-specific errors instead (validation, duplicate key, cast errors) while preserving JWT handling.

### 4.2 P1 – Should Address Soon After Go-Live

1. **Token Lifetime & Revocation Strategy**
   - **Issue**:
     - Token lifetimes and refresh policies are mostly defined by BaseGeek; MusicGeek’s side has no explicit session management (e.g., revocation, logout everywhere, admin invalidation).
   - **Recommendation**:
     - Document an operational procedure for revoking access (e.g., via BaseGeek) and clarify how long access tokens/refresh tokens live.
     - Consider a simple "token version" or `sessionId` pattern in UserProfile for forced global logout events.

2. **Rate Limiting & Abuse Protection**
   - **Issue**:
     - Docs mention BaseGeek rate limiting, but the MusicGeek backend itself doesn’t appear to enforce its own rate limits on key endpoints.
   - **Recommendation**:
     - Add request-level rate limiting for high-risk endpoints (practice tracking, lesson APIs) to avoid accidental overload or misuse.

3. **Front-End Error Surfaces & Retry Behavior**
   - **Issue**:
     - `ApiError` conveys errors cleanly, but some pages may not gracefully handle repeated network failure, auth expiration, or partial data loads.
   - **Recommendation**:
     - Add a consistent global error boundary and a simple retry/backoff pattern for idempotent GETs.
     - Ensure auth errors (401/403) consistently trigger logout + redirect with a clear message.

4. **Asset & Content Delivery**
   - **Issue**:
     - Handoff docs specify missing audio/image assets and rely on placeholder URLs.
   - **Recommendation**:
     - Before a content-heavy go-live, ensure that audio and image assets are:
       - Versioned and stored in a durable object store or CDN.
       - Referenced with stable URLs (and not from within the container filesystem unless baked into the image).

### 4.3 P2 – Nice-to-Haves / Maturity Upgrades

1. **More Granular Health/Diagnostics Endpoints**
   - Consider adding a diagnostics route for internal use that surfaces:
     - Current Mongo connection state.
     - Application version/commit hash.
     - Basic dependency health (e.g., quick ping to BaseGeek with timeout).

2. **Observability Enhancements**
   - Introduce structured logging correlation IDs (per request) and propagate them across backend logs.
   - Add application-level metrics (requests/sec, error rates, latency histograms) via a library or APM.

3. **Automated Testing & CI Hooks**
   - The docs list manual testing commands; there’s room for:
     - A minimal smoke test suite that hits the core APIs and SSO flows.
     - CI pipeline that runs tests + `npm run build` for both backend and frontend on each merge to main.

---

## 5. Concrete Next Steps (Execution Checklist)

**Before first production deployment (P0):**

1. **Harden Docker & Runtime Commands**
   - Create a production-only compose file or overlay:
     - Backend: `command: npm start`, no source mounting.
     - Frontend: build once, serve static assets (or use Vite preview with `npm run preview`).
   - Ensure `NODE_ENV=production` for prod containers.

2. **Clean Up Legacy PostgreSQL Artifacts**
   - Remove `pg` and `node-pg-migrate` from `backend/package.json` once confirmed unused.
   - Remove PG env vars and `DATABASE_URL` from production env/compose.
   - Update error handling to reflect Mongo-specific failure modes.

3. **Secret Handling & Documentation**
   - Redact real secrets from docs; replace with placeholders and explicit instructions to source values from secure secret stores.
   - Ensure `.env.production` is managed outside of Git and not checked in.

4. **Auth & Session Hardening**
   - Implement client-side token refresh using `/api/auth/refresh`, with automatic re-login flow when refresh fails.
   - Document token lifetime expectations and failure handling for support.

5. **Logging/Monitoring Integration**
   - Switch Winston in production to log JSON to stdout/stderr for container-friendly aggregation.
   - Wire logs and metrics into your chosen platform (e.g., CloudWatch, Datadog, Prometheus + Grafana).
   - Configure liveness (`/health`) and readiness checks in your orchestrator.

**Shortly after go-live (P1/P2):**

- Add rate limiting for critical endpoints.
- Introduce central error monitoring (Sentry or equivalent).
- Expand automated test coverage around SSO, progress tracking, and lesson flows.
- Implement token revocation/session management where required by business/security needs.

---

## 6. Summary

The project is **architecturally sound and well-documented**, especially around BaseGeek SSO and the Mongo migration. The main blockers are operational and security hardening details typical of a system moving from "strong dev/staging" into "real production":

- Solidify runtime (no dev servers in production, no dangling PG assumptions).
- Treat secrets as secrets (remove them from docs, centralize storage).
- Upgrade auth/session handling beyond basic localStorage tokens.
- Add the minimal logging/monitoring/rate-limiting needed to run this safely.

With those addressed, I’d be comfortable putting this in front of real users and iterating on content and UX from there.
