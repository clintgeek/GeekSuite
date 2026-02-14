# Token Refresh Guide

This project includes a token refresh pattern with access and refresh tokens.

Backend
- Access tokens are signed with `JWT_SECRET` and have short expiry (default 15m).
- Refresh tokens are signed with `JWT_REFRESH_SECRET` (falls back to JWT_SECRET) and have longer expiry (default 7d).
- Use `issueTokenPair(payload)` from `backend/src/services/tokenService.js` to create both tokens.
- Refresh endpoint: `POST /api/auth/refresh` accepts `{ refreshToken }` and returns `{ token, refreshToken }`.

Frontend
- `frontend/src/services/apiClient.js` injects the access token from `localStorage.babelgeek-token` into requests and will automatically call the refresh endpoint on 401 responses.
- `frontend/src/contexts/AuthContext.jsx` stores both `babelgeek-token` and `babelgeek-refreshToken` and schedules refresh 1 minute before expiry using the access token's exp claim.

Environment
- Set `JWT_SECRET` and `JWT_REFRESH_SECRET` in your environment. Defaults are provided for local development but should be changed in production.

Security notes
- Refresh tokens should be stored securely. This template uses localStorage for simplicity; consider httpOnly cookies for better security in production.
