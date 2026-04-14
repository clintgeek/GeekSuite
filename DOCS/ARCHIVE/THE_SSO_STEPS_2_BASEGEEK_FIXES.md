# SSO Steps — Phase 2: baseGeek TTL Alignment & Middleware Fixes

> **Estimated time**: 1-2 hours  
> **Prerequisites**: Phase 0 and Phase 1 complete  
> **Goal**: Fix the token/cookie TTL mismatch and add cookie support to baseGeek's own middleware

---

## Why This Matters

Right now baseGeek issues **1-hour access tokens** inside cookies with a **7-day max-age**. After 1 hour, the cookie still exists but the JWT inside is expired. This is the #1 cause of surprise logouts across the suite.

Also, baseGeek's own middleware only reads Bearer headers — it can't authenticate requests that come with just the SSO cookie.

---

## 2.1 — Align Access Token Cookie Max-Age to JWT TTL

**Why**: Cookie max-age should match JWT expiration. A cookie containing an expired JWT is worse than no cookie — it causes confusing 401s where the user appears to have a session but doesn't.

**File**: `baseGeek/packages/api/src/routes/auth.js` — `setSSOCookies` function (~line 23)

**Find this**:
```javascript
function setSSOCookies(res, token, refreshToken) {
    const cookieOptions = {
        path: '/',
        httpOnly: true,
        secure: SSO_COOKIE_SECURE,
        sameSite: SSO_COOKIE_SAMESITE,
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    };
```

**Change the access token cookie max-age to 1 hour** (matching `JWT_EXPIRES_IN`):
```javascript
function setSSOCookies(res, token, refreshToken) {
    const accessCookieOptions = {
        path: '/',
        httpOnly: true,
        secure: SSO_COOKIE_SECURE,
        sameSite: SSO_COOKIE_SAMESITE,
        maxAge: 60 * 60 * 1000 // 1 hour — matches JWT_EXPIRES_IN
    };
    if (SSO_COOKIE_DOMAIN) accessCookieOptions.domain = SSO_COOKIE_DOMAIN;

    const refreshCookieOptions = {
        path: '/',
        httpOnly: true,
        secure: SSO_COOKIE_SECURE,
        sameSite: SSO_COOKIE_SAMESITE,
        maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
    };
    if (SSO_COOKIE_DOMAIN) refreshCookieOptions.domain = SSO_COOKIE_DOMAIN;

    res.cookie('geek_token', token, accessCookieOptions);
    res.cookie('geek_refresh_token', refreshToken, refreshCookieOptions);
}
```

**Key change**: Access cookie now has its own options with `maxAge: 1 hour` instead of sharing the 7-day config with the refresh cookie.

**Verify**:
- [ ] After login, check DevTools → Application → Cookies
- [ ] `geek_token` should show expiry ~1 hour from now
- [ ] `geek_refresh_token` should show expiry ~30 days from now
- [ ] After 1 hour, `geek_token` cookie disappears but `geek_refresh_token` remains

---

## 2.2 — Align Refresh Token TTL

**Why**: The refresh JWT expires in 7 days but the cookie lasts 30 days. After day 7, the cookie exists but the JWT is expired. Align them.

**File**: `baseGeek/packages/api/src/services/authService.js` line 8

**Find**:
```javascript
const REFRESH_TOKEN_EXPIRES_IN = process.env.REFRESH_TOKEN_EXPIRES_IN || '7d';
```

**Change to**:
```javascript
const REFRESH_TOKEN_EXPIRES_IN = process.env.REFRESH_TOKEN_EXPIRES_IN || '30d';
```

Also update the `.env` file (or `.env.production`) for baseGeek:
```
REFRESH_TOKEN_EXPIRES_IN=30d
```

**Verify**:
- [ ] After login, decode the refresh token (jwt.io or similar) and confirm `exp` is ~30 days out
- [ ] The refresh cookie max-age (30 days) now matches the JWT TTL (30 days)

---

## 2.3 — Ensure Refresh Endpoint Reads Cookie as Primary Source

**Why**: When the access token cookie expires after 1 hour, the frontend's silent refresh timer will POST to `/api/auth/refresh`. The refresh token lives in an HttpOnly cookie — the frontend can't read it to put it in the body. The backend must read it from the cookie.

**File**: `baseGeek/packages/api/src/routes/auth.js` — the `/refresh` route (~line 176)

This is already partially done. Check that the code reads:
```javascript
const bodyRefreshToken = req.body?.refreshToken;
const cookieRefreshToken = req.cookies?.geek_refresh_token;
const refreshToken = bodyRefreshToken || cookieRefreshToken;
```

**This is correct** — it tries body first, then cookie. If you see this, no change needed.

**But also**: Make sure the route does NOT require authentication. The whole point is that the access token is expired and we're using the refresh token to get a new one. The refresh route must be public.

**Verify**:
- [ ] `POST /api/auth/refresh` with no body but a valid `geek_refresh_token` cookie → returns new tokens
- [ ] `POST /api/auth/refresh` with `{ refreshToken: "..." }` in body → also works
- [ ] The route does not require a valid access token

---

## 2.4 — Add Cookie Support to baseGeek's Auth Middleware

**Why**: baseGeek's own `authenticateToken` middleware only reads Bearer headers. This means baseGeek's own protected endpoints (like `/api/auth/profile`) don't work with SSO cookies. Every other app in the suite reads cookies — baseGeek should too.

**File**: `baseGeek/packages/api/src/middleware/auth.js`

**Find**:
```javascript
export const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
```

**Replace the token extraction with**:
```javascript
export const authenticateToken = (req, res, next) => {
  const cookieToken = req.cookies?.geek_token;
  const authHeader = req.headers['authorization'];
  const headerToken = authHeader && authHeader.split(' ')[1];
  const token = cookieToken || headerToken;
```

This matches the pattern every other app uses: cookie first, Bearer fallback.

**Also**: Remove the verbose `console.log` debug lines in this middleware (lines 9-11, 20-21, 24). They log the JWT_SECRET value to stdout, which is a security concern:
```javascript
// DELETE these lines:
console.log('Auth middleware - Path:', req.path);
console.log('Auth middleware - Token present:', !!token);
console.log('Auth middleware - JWT_SECRET present:', !!process.env.JWT_SECRET);
console.log('JWT_SECRET:', process.env.JWT_SECRET);           // ← DANGER: logs the secret!
console.log('JWT_SECRET length:', process.env.JWT_SECRET ? process.env.JWT_SECRET.length : 'undefined');
console.log('Auth middleware - Token decoded successfully:', { id: decoded.id, app: decoded.app });
console.log('Auth middleware - Invalid app token:', decoded.app);
console.log('Auth middleware - Token verification failed:', error.message);
```

Replace with minimal, safe logging if needed:
```javascript
// Optional: safe debug logging (no secrets)
if (!token) {
  return res.status(401).json({ message: 'Authentication token required' });
}
```

**Verify**:
- [ ] `GET /api/auth/profile` works with just the `geek_token` cookie (no Authorization header)
- [ ] `GET /api/auth/profile` still works with `Authorization: Bearer <token>` header
- [ ] No `JWT_SECRET` values appear in server logs

---

## 2.5 — Remove Debug Logging from authService.js

**Why**: `baseGeek/packages/api/src/services/authService.js` has `console.log` statements that dump decoded JWT payloads and user data on every request.

**File**: `baseGeek/packages/api/src/services/authService.js`

Remove these lines:
- Line 42: `console.log('Login attempt:', { identifier, app, VALID_APPS });`
- Line 45: `console.log('App validation failed:', ...);`
- Line 95: `console.log('Decoded JWT payload:', decoded);`
- Line 97: `console.log('User found by decoded.id:', user);`

Keep error-level logging only.

**Verify**:
- [ ] Login and token validation still work
- [ ] Server logs are cleaner — no JWT payloads dumped

---

## Done with Phase 2?

```bash
git add -A
git commit -m "fix(baseGeek): SSO hardening Phase 2 - align TTLs, add cookie support to middleware"
```

Proceed to → `THE_SSO_STEPS_3_APP_MIGRATIONS.md`
