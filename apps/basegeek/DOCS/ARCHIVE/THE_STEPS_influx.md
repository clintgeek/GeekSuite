# THE_STEPS_influx.md

## Overview
Add an InfluxDB instance to the DataGeek stack and expose its health/metrics through the existing backend/frontend surfaces.

## 1. Infrastructure & Configuration
- [ ] Extend `docker-compose.yml` with an `influxdb` service (InfluxDB 2.x image, host port 8086, bound data/config volumes, admin credentials via env).
- [ ] Update `basegeek` service `depends_on` to include the new Influx service.
- [ ] Define `INFLUXDB_URL`, `INFLUXDB_ORG`, `INFLUXDB_BUCKET`, `INFLUXDB_TOKEN`, and any setup username/password fields across `.env`, `.env.local`, `.env.production` with safe defaults/placeholders.
- [ ] Capture the new environment variables and service notes in `DOCS/CURSOR-CONTEXT.md` (and any env/setup docs) so Chef has canonical references.

## 2. Backend Integration (packages/api)
- [ ] Install `@influxdata/influxdb-client` in the API workspace.
- [ ] Create `src/config/influx.js` to expose a singleton Influx client plus simple helpers (health check, query interface) driven by env vars.
- [ ] Add `src/routes/influx.js` that mirrors other DataGeek resource endpoints:
  - Guard with `authenticateToken`.
  - Implement `GET /api/influx/status` returning connection status, org/bucket info, and optionally recent measurement counts/retention info.
- [ ] Register the new router in `src/server.js` and ensure startup logs surface Influx connectivity (without printing tokens).
- [ ] Document any measurement naming conventions or assumptions for future metrics ingestion.

## 3. Frontend Integration (packages/ui)
- [ ] Update `DataGeekPage.jsx` to add a fourth "InfluxDB" tab and create an `InfluxStatus` component patterned after Redis/Postgres panels.
- [ ] Component should call `/api/influx/status`, show connection state, org/bucket metadata, sample measurement stats, and surface errors gracefully.
- [ ] If charting will be needed soon, note the preferred library (e.g., Recharts) but keep initial implementation text-based.

## 4. Observability & Security
- [ ] Ensure no sensitive Influx tokens are logged; rely solely on env vars.
- [ ] Add lightweight logging or health check hooks so Influx failures are obvious during startup/requests.

## 5. Deployment & Ops
- [ ] Update `DOCS/DEPLOYMENT_GUIDE.md` (or relevant ops doc) to call out docker-compose change and Chef-led rebuild requirements.
- [ ] Provide Chef with the initialization command sequence (org/bucket/token creation) if not automated via entrypoint scripts.
