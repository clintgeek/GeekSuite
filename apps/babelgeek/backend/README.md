# TemplateGeek API

Minimal Express server aligned with Geek Suite conventions. It exposes a health endpoint and a starter auth flow that stores users in-memory until swapped for a persistent data layer.

## Scripts

```bash
npm install
npm run dev   # Runs nodemon with live reload
npm start     # Production-style launch
```

## Routes

- `GET /api/health` — healthcheck for monitoring and smoke tests
- `POST /api/auth/register` — creates a mock user record and returns a JWT
- `POST /api/auth/login` — validates credentials against the mock store
- `GET /api/auth/me` — returns the decoded JWT payload, requires Authorization header

## Next steps

1. Replace the in-memory `mockUsers` Map in `src/controllers/authController.js` with database logic.
2. Wire secure cookie handling or session storage if preferred over bearer tokens.
3. Layer additional domain routes under `src/routes/` following the versioned `/api` namespace.
