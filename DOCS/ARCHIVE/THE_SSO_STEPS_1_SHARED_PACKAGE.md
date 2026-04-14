# SSO Steps — Phase 1: Create Shared Auth Package

> **Estimated time**: 4-6 hours  
> **Prerequisites**: Phase 0 complete  
> **Goal**: Build `@geeksuite/auth` — one package to replace 9 copies of auth logic

---

## Why a Shared Package?

Right now every app has its own copy of:
- `authClient.js` (frontend) — getMe, loginRedirect, logout, onLogout
- Auth middleware (backend) — cookie parsing, token extraction, baseGeek proxy
- Set-Cookie forwarding helpers
- User ID normalization (`_id` / `id` / `userId`)

They're all slightly different. Different BroadcastChannel names, different event types, different error handling. One package to rule them all.

---

## 1.1 — Create Package Directory

```bash
mkdir -p packages/geeksuite-auth/src/client
mkdir -p packages/geeksuite-auth/src/server
```

Create `packages/geeksuite-auth/package.json`:
```json
{
  "name": "@geeksuite/auth",
  "version": "1.0.0",
  "type": "module",
  "main": "src/index.js",
  "exports": {
    "./client": "./src/client/index.js",
    "./server": "./src/server/index.js"
  },
  "dependencies": {
    "axios": "^1.6.0"
  },
  "peerDependencies": {
    "react": ">=18.0.0"
  },
  "peerDependenciesMeta": {
    "react": { "optional": true }
  }
}
```

---

## 1.2 — Create Client Constants

**File**: `packages/geeksuite-auth/src/client/constants.js`

```javascript
export const BROADCAST_CHANNEL = 'geeksuite-auth';
export const LOGOUT_EVENT_TYPE = 'LOGOUT';
export const DEFAULT_BASEGEEK_URL = 'https://basegeek.clintgeek.com';
export const REFRESH_INTERVAL_MS = 50 * 60 * 1000; // 50 minutes
```

These are the **canonical values**. No more `geek-auth` vs `geeksuite-auth`, no more `logout` vs `LOGOUT`.

---

## 1.3 — Create Client authClient.js

**File**: `packages/geeksuite-auth/src/client/authClient.js`

This replaces every app's local `authClient.js`. Study the existing ones in BabelGeek, fitnessGeek, etc. for reference. Your implementation must:

**`getMe(apiBase)`**
- `GET {apiBase}/api/me` with `credentials: 'include'` and `cache: 'no-store'`
- Return `null` on 401 (not an error — just means not logged in)
- Parse response: try `data.data.user`, then `data.user`, then `null`
- Throw on non-401 errors

**`loginRedirect(baseGeekUrl, app, returnTo, mode)`**
- Build URL: `{baseGeekUrl}/{mode}?app={app}&redirect={sanitizedReturnTo}`
- Sanitize returnTo: if pathname is `/login` or `/register`, redirect to origin root instead (prevents redirect loops)
- `window.location.href = url`

**`logout(apiBase)`**
- `POST {apiBase}/api/auth/logout` with `credentials: 'include'`
- Always broadcast logout afterward (even if POST fails)
- Use `BROADCAST_CHANNEL` and `LOGOUT_EVENT_TYPE` from constants

**`onLogout(callback)`**
- Open BroadcastChannel with `BROADCAST_CHANNEL`
- Listen for messages with `type === LOGOUT_EVENT_TYPE`
- Return an unsubscribe function that closes the channel

**Important**: Look at BabelGeek's `authClient.js` as the cleanest reference. Don't invent — consolidate.

---

## 1.4 — Create Client refreshTimer.js

**File**: `packages/geeksuite-auth/src/client/refreshTimer.js`

Based on fitnessGeek's `startSessionKeepAlive`. This is the **only app that currently does silent refresh**, and the absence of this in other apps is the #1 cause of surprise logouts.

**`startRefreshTimer(apiBase, onFailure)`**
- POST to `{apiBase}/api/auth/refresh` with `credentials: 'include'` and empty JSON body
- Run immediately on start, then every `REFRESH_INTERVAL_MS` (50 min)
- On 401 response: stop timer, call `onFailure()`
- On other errors: log warning, keep trying

**`stopRefreshTimer()`**
- Clear the interval

Keep a module-level `let timerId = null` — only one timer at a time.

---

## 1.5 — Create Client AuthProvider.jsx (React)

**File**: `packages/geeksuite-auth/src/client/AuthProvider.jsx`

A React context provider that every app can wrap around its root. Pattern:

```javascript
import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { getMe, loginRedirect, logout as logoutRequest, onLogout } from './authClient.js';
import { startRefreshTimer, stopRefreshTimer } from './refreshTimer.js';

const GeekAuthContext = createContext(null);

export function GeekAuthProvider({ children, app, baseGeekUrl, apiBase }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const me = await getMe(apiBase);
        if (cancelled) return;
        setUser(me);
        if (me) {
          startRefreshTimer(apiBase, () => {
            setUser(null);
          });
        }
      } catch {
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    const unsubscribe = onLogout(() => {
      setUser(null);
      stopRefreshTimer();
    });

    return () => {
      cancelled = true;
      unsubscribe();
      stopRefreshTimer();
    };
  }, [apiBase]);

  const login = useCallback(
    (returnTo) => loginRedirect(baseGeekUrl, app, returnTo || window.location.href, 'login'),
    [baseGeekUrl, app]
  );

  const register = useCallback(
    (returnTo) => loginRedirect(baseGeekUrl, app, returnTo || window.location.href, 'register'),
    [baseGeekUrl, app]
  );

  const logout = useCallback(async () => {
    await logoutRequest(apiBase);
    stopRefreshTimer();
    setUser(null);
  }, [apiBase]);

  const value = useMemo(() => ({
    user,
    loading,
    login,
    register,
    logout,
    isAuthenticated: !!user,
  }), [user, loading, login, register, logout]);

  return (
    <GeekAuthContext.Provider value={value}>
      {children}
    </GeekAuthContext.Provider>
  );
}

export function useGeekAuth() {
  const ctx = useContext(GeekAuthContext);
  if (!ctx) throw new Error('useGeekAuth must be used within GeekAuthProvider');
  return ctx;
}
```

---

## 1.6 — Create Client Index

**File**: `packages/geeksuite-auth/src/client/index.js`

```javascript
export { getMe, loginRedirect, logout, onLogout } from './authClient.js';
export { startRefreshTimer, stopRefreshTimer } from './refreshTimer.js';
export { GeekAuthProvider, useGeekAuth } from './AuthProvider.jsx';
export { BROADCAST_CHANNEL, LOGOUT_EVENT_TYPE, DEFAULT_BASEGEEK_URL } from './constants.js';
```

---

## 1.7 — Create Server Constants

**File**: `packages/geeksuite-auth/src/server/constants.js`

```javascript
export const ACCESS_COOKIE = 'geek_token';
export const REFRESH_COOKIE = 'geek_refresh_token';
export const DEFAULT_BASEGEEK_URL = 'https://basegeek.clintgeek.com';
```

---

## 1.8 — Create Server cookieAuth.js (Middleware)

**File**: `packages/geeksuite-auth/src/server/cookieAuth.js`

This replaces every app's auth middleware. Two flavors:

**`getTokenFromRequest(req)`**
- Check `req.cookies?.geek_token` (Express cookie-parser)
- Fallback: manual parse of `req.headers.cookie` for `geek_token`
- Fallback: `Authorization: Bearer <token>` header
- Return token string or `null`

**`geekProxyAuth(options)`** — validates via baseGeek (network call)
- Extract token via `getTokenFromRequest`
- No token → 401
- `GET {baseGeekUrl}/api/users/me` with `Authorization: Bearer {token}`
- Normalize user: ensure `id`, `_id`, `userId` all set to the same value
- Set `req.user`
- On 401/403 from baseGeek → 401 to client
- On network error → 502

**`geekLocalAuth(jwtSecret)`** — validates locally (no network call)
- Extract token via `getTokenFromRequest`
- `jwt.verify(token, jwtSecret)`
- Normalize user ID fields
- Set `req.user`
- On expired → 401 with `TOKEN_EXPIRED` code
- On invalid → 403

Both return Express middleware functions: `(req, res, next) => { ... }`

---

## 1.9 — Create Server forwardCookies.js

**File**: `packages/geeksuite-auth/src/server/forwardCookies.js`

```javascript
export function forwardSetCookieHeaders(res, upstreamHeaders) {
  const setCookie = upstreamHeaders?.['set-cookie'];
  if (!setCookie) return;
  if (Array.isArray(setCookie)) {
    res.setHeader('Set-Cookie', setCookie);
  } else {
    res.setHeader('Set-Cookie', [setCookie]);
  }
}
```

---

## 1.10 — Create Server authRoutes.js (Route Factory)

**File**: `packages/geeksuite-auth/src/server/authRoutes.js`

A factory function that returns an Express Router with all standard auth proxy routes:

```javascript
import { Router } from 'express';
import axios from 'axios';
import { getTokenFromRequest } from './cookieAuth.js';
import { forwardSetCookieHeaders } from './forwardCookies.js';

export function createAuthRoutes({ baseGeekUrl, app }) {
  const router = Router();

  // POST /login — proxy to baseGeek
  // POST /register — proxy to baseGeek
  // POST /refresh — read refresh token from cookie, proxy to baseGeek
  // POST /logout — proxy to baseGeek, forward Set-Cookie
  // GET /me — read access token, validate via baseGeek /api/users/me

  return router;
}
```

For each route, follow this pattern:
1. Extract token/cookie from request
2. Forward to baseGeek with `Cookie` and `Authorization` headers
3. Forward `Set-Cookie` from baseGeek response back to client
4. Return baseGeek's response data

Study `BuJoGeek/server/src/routes/authRoutes.js` or `bookgeek/api/src/routes/authRoutes.js` as reference — they're the cleanest proxy implementations.

**Critical for `/refresh`**: Read `geek_refresh_token` from `req.cookies` AND forward the raw `Cookie` header to baseGeek. This ensures cookie-only refresh works.

**Critical for `/me`**: Set `Cache-Control: no-store` on the response.

---

## 1.11 — Create Server Index

**File**: `packages/geeksuite-auth/src/server/index.js`

```javascript
export { geekProxyAuth, geekLocalAuth, getTokenFromRequest } from './cookieAuth.js';
export { createAuthRoutes } from './authRoutes.js';
export { forwardSetCookieHeaders } from './forwardCookies.js';
export { ACCESS_COOKIE, REFRESH_COOKIE, DEFAULT_BASEGEEK_URL } from './constants.js';
```

---

## 1.12 — Create Root Index

**File**: `packages/geeksuite-auth/src/index.js`

```javascript
export * from './client/index.js';
export * from './server/index.js';
```

---

## 1.13 — Test the Package

Before using it in any app:

1. From any app directory, verify you can import it:
   ```javascript
   import { getMe, loginRedirect } from '@geeksuite/auth/client';
   import { geekProxyAuth, createAuthRoutes } from '@geeksuite/auth/server';
   ```

2. Write a small test script that:
   - Calls `getTokenFromRequest` with a mock request containing a cookie
   - Calls `getTokenFromRequest` with a mock request containing a Bearer header
   - Verifies both return the expected token

3. If using npm workspaces, add to root `package.json`:
   ```json
   "workspaces": ["packages/*"]
   ```
   Then run `npm install` from the root.

**Verify**:
- [ ] Package exists at `packages/geeksuite-auth/`
- [ ] All files listed above are created
- [ ] Import from `@geeksuite/auth/client` works
- [ ] Import from `@geeksuite/auth/server` works

---

## Done with Phase 1?

```bash
git add -A
git commit -m "feat(auth): SSO hardening Phase 1 - create @geeksuite/auth shared package"
```

Proceed to → `THE_SSO_STEPS_2_BASEGEEK_FIXES.md`
