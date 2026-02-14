# FlockGeek Starter Kit

FlockGeek is a starter application for managing small flocks. It includes a React + MUI frontend, an Express API skeleton, PWA wiring, and Docker tooling so you can get a working flock-management UI and API running quickly.

## Stack

- React 18 + Vite (JavaScript)
- MUI v5 theming aligned with the GeekSuite Unified Design System
- Express API with placeholder auth flow and health route
- Shared spacing, typography, and layout primitives
- PWA manifest + service worker registration
- Docker setup for frontend and backend
- `docker-compose.yml` orchestrating local dev

## Getting Started

```bash
# One-shot bootstrap from repo root
npm install

# Start both servers in watch mode (backend via nodemon, frontend via Vite)
npm start

# Manual installs if you prefer separate steps
npm install --prefix frontend
npm install --prefix backend

# Docker option
docker compose up --build
```

Frontend is available at http://localhost:5173 and proxies API calls to http://localhost:4000. When using the root `npm start`, Concurrently keeps both processes running in a single terminal.

- `backend/src/server.js` boots Express with CORS, logging, and versioned routes.
- `backend/src/routes/auth.js` + controllers provide an auth skeleton ready for integration with real data sources.
- `backend/src/middleware/authMiddleware.js` shows how to guard routes once tokens are issued.

## Docker

- `docker-compose.yml` starts both services with shared `.env` overrides.
- Individual `Dockerfile`s live in `frontend/` and `backend/` folders.

## Extending

- Replace mock logic in `backend/src/controllers/authController.js` with production-ready services.
- Expand `frontend/src/pages` with real screens, reusing layout primitives.
- Add persistent storage (Postgres, Mongo, etc.) by extending `docker-compose.yml`.

Refer to the design system in `DOCS/GeekSuite_Unified_Design_System.md` for detailed styling guidance.
