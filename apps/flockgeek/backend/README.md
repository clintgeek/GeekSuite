# FlockGeek API

Thin Express backend for FlockGeek. All flock/bird/egg/health data lives on basegeek's
GraphQL gateway (`apps/basegeek/packages/api/src/graphql/flockgeek/`) — this backend no
longer has any CRUD surface of its own. See `apps/flockgeek/CONTEXT.md` for the full
account (why, and what was here before Night 2 2026-09-06 / Q22 deleted it).

## Scripts

```bash
npm install
npm run dev            # Runs nodemon with live reload
npm start               # Production-style launch
npm run migrate-owner   # Raw-collection ownerId reassignment tool (run with no args for usage)
npm test                # Jest (native ESM)
```

## Routes

- `GET /api/health` — healthcheck for monitoring and smoke tests
- `GET /api/me` — cookie-first session check (`@geeksuite/user`'s `attachUser()` + `meHandler()`)
- `POST /api/auth/refresh` — server-to-server proxy: replays the browser's cookies to
  basegeek's `/api/auth/refresh`
- `POST /api/auth/logout` — same pattern, `/api/auth/logout`
- Static file serving + SPA fallback for the built frontend (`public/`)

`POST /api/auth/{login,register}` and this router's own `/api/auth/me` do not exist here —
the frontend never called them. Login/register redirect the browser straight to basegeek's
hosted pages (`@geeksuite/auth`'s `loginRedirect()`); the session check goes through
`GET /api/me` above.
