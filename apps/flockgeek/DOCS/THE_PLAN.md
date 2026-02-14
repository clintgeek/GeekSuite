# FlockGeek Migration Plan

## Goal
Rebuild the original FlockGeek application (currently living under `archive/`) inside the new GeekSuite application template in the repository root, preserving all existing functionality while taking advantage of the template conventions.

## Phase 1: Discovery and Environment Alignment
1. Inventory all runtime requirements in `archive/backend` and `archive/frontend` (`package.json`, `.env*`, Docker files) and compare to root template equivalents. Note dependency deltas, Node versions, and build scripts that must be ported.
2. Document all environment variables in use (backend, frontend, Docker, deployment scripts). Create a unified `.env.example` in the root template capturing every required value with descriptions.
3. Review `archive/DOCS/PLANNING.md`, `SS/`, and other docs for context, domain terminology, and existing workflows that must survive the migration.
4. Confirm backend data store expectations (Mongo schemas, seed scripts) and required external services.
5. Decide on the canonical local dev workflow (plain Node, Docker, or both) based on the new template conventions.

## Phase 2: Backend Migration
1. Map the existing backend architecture (`archive/backend/src`) to the template backend structure (`backend/src`). Identify controllers, routes, middleware, models, services, and utilities that must be moved or rewritten.
2. Create a checklist for each module:
   - Controllers (`auth`, `status`, etc.)
   - Routes (API endpoints and auth routes)
   - Middleware (auth, logging, error handling)
   - Services (token handling, business logic)
   - Utilities (logger, config loaders)
3. Port configuration files (`config/env.js`, JWT settings) ensuring they read from the new unified environment variables. Remove or adapt duplicate config loaders from the template.
4. Recreate Mongo models in the new backend, migrating any schema differences or virtuals. Add centralized model index if the template expects one.
5. Integrate authentication:
   - Merge JWT strategies and refresh-token logic from `archive/backend` with the template `authMiddleware` and `tokenService`.
   - Ensure password hashing, login, signup flows, and token renewal behave as before.
6. Rebuild REST endpoints:
   - Gradually copy route handlers from `archive/backend/routes/*` into the template router, updating imports and controller wiring.
   - Align route prefixes (`/api`, `/auth`) with the template conventions.
   - Add input validation as needed if the template ships with helpers (e.g., `zod`, `yup`, `express-validator`).
7. Migrate supporting scripts (`seed.js`, data loaders). Hook them into the template npm scripts with clear documentation.
8. Update logging and error handling to use the template`s `utils/logger.js` semantics, keeping useful legacy logging context.
9. Write or update unit/integration tests (if the template includes a testing harness) to cover critical paths: auth, bird CRUD, groups, egg production, health records.
10. Verify backend Dockerfile and runtime configuration align with the new code structure; update docker-compose services if needed.

## Phase 3: Frontend Migration
1. Compare the template frontend layout (`frontend/src`) with the legacy React app under `archive/frontend`. Note routing, state management, and theming differences.
2. Establish a component mapping plan:
   - Identify legacy pages (`BirdsPage`, `Login`, etc.) and decide their new locations under the template (`pages/`, `components/`, `contexts/`).
   - Determine how shared layout components (`LayoutShell`, `Navigation`, `Footer`) integrate with new routes.
3. Port shared utilities:
   - Move API client/helpers (`lib/api.js`, `services/apiClient.js`) into the template `services` layer; unify request/response handling, auth headers, and error handling.
   - Consolidate theme settings (`theme.js`, `AppThemeProvider`) into the new `theme/` directory.
4. Migrate authentication context:
   - Merge legacy context/hooks with `frontend/src/contexts/AuthContext.jsx` and `hooks/useApi.js` patterns.
   - Ensure login state, token persistence, and route guards match backend expectations.
5. Rebuild page-level components feature by feature:
   - Birds: listing, filtering, detail pages.
   - Bird traits, notes, health records.
   - Pairings, groups, locations, hatch logs, egg logs.
   - Metrics/visualizations (LineChart, notifications).
   Write down dependencies (charting, forms) and confirm template styling consistency.
6. Translate and modernize CSS:
   - Integrate `archive/frontend/index.css` and component styles into the template`s styling approach (CSS modules, Tailwind, styled-components, etc.).
   - Remove dead styles and ensure responsive design follows the GeekSuite design system (`DOCS/GeekSuite_Unified_Design_System.md`).
7. Update routing with Vite/React Router as per template (lazy loading, layout routes if available). Ensure deep links from legacy app still work or provide redirects.
8. Integrate notifications/toasts and other global UI concerns into template-provided patterns (providers, portals).
9. Write component tests or Storybook stories if the template provides tooling.

## Phase 4: Build Scripts, Tooling, and Deployment
1. Align npm/yarn scripts in root `package.json`, `backend/package.json`, and `frontend/package.json` with the migrated code (dev, build, lint, test, format).
2. Configure linting/formatting rules (ESLint, Prettier) to handle legacy code style while adhering to template conventions. Fix or suppress violations thoughtfully.
3. Update Docker files and `docker-compose.yml` to point to the new backend/frontend build outputs. Ensure environment variables propagate correctly in containerized environments.
4. Rework CI/CD or deployment scripts (`archive/deploy.sh`, `DOCKER_DEPLOYMENT.md`) to match the template’s preferred deployment approach.
5. Validate service startup order and health checks; update documentation for local and production deployment scenarios.

## Phase 5: Data and Migration Strategy
1. Plan for migrating existing databases (if any) by creating migration scripts or providing instructions for data export/import.
2. If schema changes occur, write explicit migration steps and communicate downtime requirements.
3. Provide seed data to facilitate QA and demos.

## Phase 6: Documentation and Handoff
1. Update `README.md` files (root, backend, frontend) to describe the new architecture, setup commands, environment variables, and deployment steps.
2. Document API endpoints and key flows, leveraging existing docs from `archive`.
3. Create a migration changelog summarizing major differences between the legacy and new implementations.
4. Outline testing instructions (unit, integration, UI), including commands and expected results.
5. Schedule a review/QA phase and capture sign-off criteria.

## Phase 7: Verification
1. Run full application stack locally (and via Docker if applicable) to verify:
   - User authentication and session persistence.
   - CRUD operations across birds, groups, traits, notes, health records.
   - Metrics dashboards and charts rendering with real sample data.
   - Notifications or other realtime components functioning.
2. Execute automated test suites and lint checks; resolve any failures.
3. Perform manual regression testing guided by legacy app behavior and `SS/` screenshots.
4. Prepare for production deployment, including smoke tests and monitoring setup if supported.

## Deliverables
- Updated backend and frontend within the root template matching the legacy app features.
- Comprehensive documentation (`THE_PLAN.md`, updated READMEs, migration notes).
- Unified environment configuration and deployment scripts.
- Automated tests appropriate for the migrated codebase.
- Verified, working application ready for QA and deployment.
