# SSO Client Migration Playbook (Cookie-First Rollout)

This playbook documents the repeatable steps we used to migrate **GeekSuite (gateway)** and **BabelGeek** to GeekSuite SSO using **cookie-first + localStorage fallback**.

The goal is:
- baseGeek remains the central auth authority.
- Clients prefer **SSO cookies** (`geek_token`, `geek_refresh_token`) when present.
- Clients still support existing behavior via localStorage to avoid breaking apps.

## Assumptions / Invariants

- **Cookies set by baseGeek**
  - `geek_token` (access token)
  - `geek_refresh_token` (refresh token)
- Cookies are set for **Domain** `.clintgeek.com`
- Cookies are **not** `httpOnly` (so clients can read them during rollout)
- Login/refresh responses from baseGeek still include tokens in JSON for backward compatibility

## Decision Tree

### 1) Does the app call baseGeek directly from the browser?
- **Yes**: ensure requests use `credentials: "include"` and read cookies in token getters.

### 2) Does the app proxy baseGeek through its own server (Bun/Express/etc.)?
- **Yes**: you must forward **all `Set-Cookie` headers** from baseGeek back to the browser.
  - Otherwise cookies will be dropped and SSO will appear broken.

### 3) Are auth endpoints same-origin with the browser?
- **Yes** (recommended): safely use `credentials: "include"` on login/refresh/logout.
- **No** (common in local dev): avoid sending credentials unless CORS explicitly allows credentials.
  - Practical approach: only set `credentials: "include"` when your API base is same-origin (e.g. `https://bookgeek.clintgeek.com/api`).

## Standard Checklist (Do This For Every App)

### A) Token getters must be cookie-first
- Token key: `geek_token`
- Refresh key: `geek_refresh_token`

Minimum helper:
```js
const TOKEN_KEY = "geek_token";
const REFRESH_TOKEN_KEY = "geek_refresh_token";

function getCookie(name) {
  if (typeof document === "undefined") return null;
  const cookies = document.cookie ? document.cookie.split(";") : [];
  for (const raw of cookies) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    const key = eq >= 0 ? trimmed.slice(0, eq) : trimmed;
    if (key !== name) continue;
    const value = eq >= 0 ? trimmed.slice(eq + 1) : "";
    return decodeURIComponent(value);
  }
  return null;
}

function getToken() {
  return getCookie(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY);
}

function getRefreshToken() {
  return getCookie(REFRESH_TOKEN_KEY) || localStorage.getItem(REFRESH_TOKEN_KEY);
}
```

### B) Authenticated requests attach `Authorization: Bearer <token>`
- Use `getToken()` above.
- Keep localStorage writes for now (for apps still relying on localStorage elsewhere).

### C) Login must include credentials so cookies can be set
If using `fetch`:
```js
await fetch("/api/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  credentials: "include",
  body: JSON.stringify(payload),
});
```

If calling baseGeek directly:
```js
await fetch(`${BASEGEEK_URL}/api/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  credentials: "include",
  body: JSON.stringify({ ...payload, app: APP_NAME }),
});
```

### D) Refresh must include credentials and should refresh via baseGeek
- Use `getRefreshToken()`.
- Post to baseGeek refresh endpoint with `{ refreshToken, app }`.

```js
await fetch(`${BASEGEEK_URL}/api/auth/refresh`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  credentials: "include",
  body: JSON.stringify({ refreshToken, app: APP_NAME }),
});
```

### E) Logout must clear cookies (and local fallback)
During rollout:
- Call baseGeek logout to clear cookies.
- Clear localStorage keys so older code paths don’t think you’re logged in.

```js
try {
  await fetch(`${BASEGEEK_URL}/api/auth/logout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
  });
} catch {}

localStorage.removeItem("geek_token");
localStorage.removeItem("geek_refresh_token");
```

### F) If you proxy baseGeek through a server, forward Set-Cookie

#### Bun proxy (GeekSuite pattern)
When relaying upstream JSON, copy all set-cookie headers:
```js
const headers = new Headers({
  "Content-Type": contentType,
  "Cache-Control": "no-store",
});

const setCookies = typeof upstream.headers.getSetCookie === "function"
  ? upstream.headers.getSetCookie()
  : [];

for (const cookie of setCookies) {
  headers.append("Set-Cookie", cookie);
}

return new Response(bodyText, { status: upstream.status, headers });
```

#### Express proxy (general pattern)
If you proxy with `fetch`, forward multiple set-cookie values:
- Node fetch implementations differ; commonly you’ll use `upstream.headers.raw()['set-cookie']` (node-fetch) or an equivalent.
- Ensure you pass an array of cookies, not a single concatenated string.

## BabelGeek-Specific Notes (What We Actually Changed)

BabelGeek had two separate client paths that needed cookie-first updates:

- `frontend/src/services/authService.js`
  - Updated `baseGeekFetch()` to use cookie-first token and `credentials: 'include'`.
  - Updated `isAuthenticated()`, `refreshToken()`, `getToken()` to use cookie-first token getters.
  - Updated `logout()` to call baseGeek `/api/auth/logout`.
  - Removed a localStorage-only check in `getCurrentUser()` so cookie-only sessions work.

- `frontend/src/services/apiClient.js` (axios)
  - Request interceptor now uses cookie-first token.
  - 401 refresh now calls baseGeek `/api/auth/refresh` with `{ refreshToken, app: 'babelgeek' }`.
  - Still writes refreshed tokens into localStorage for backward compatibility.

## BookGeek-Specific Notes (What We Actually Changed)

BookGeek uses an API proxy (`/api/auth/*`) that calls baseGeek server-to-server.

- `api/src/routes/authRoutes.js`
  - Added forwarding of baseGeek cookies by copying `response.headers['set-cookie']` onto the BookGeek response.
  - Login/register/refresh now forward `Set-Cookie`.
  - Logout proxies to baseGeek `/api/auth/logout` and forwards cookie clears.

- `web/src/App.jsx`
  - Reads tokens cookie-first from `geek_token` / `geek_refresh_token`.
  - Falls back to legacy localStorage keys (`bookgeek_token`, `bookgeek_refresh_token`) to avoid breaking older behavior.
  - Calls `/auth/logout` so baseGeek cookies are cleared.
  - Uses a same-origin guard for credentials:
    - Only uses `credentials: "include"` when API base is same-origin (subdomain deploy).
    - Avoids CORS issues in local dev where web and API are on different ports.

## Verification Steps (Per App)

1. Log in via GeekSuite (or baseGeek) and confirm cookies exist:
   - `geek_token`
   - `geek_refresh_token`

2. Open the target app in a new tab.

3. Validate it can run cookie-only:
   - Clear localStorage keys for that app (or all localStorage) and refresh.
   - The app should remain authenticated using cookies.

4. Validate refresh:
   - Wait for token expiry (or force a 401) and confirm the app refreshes successfully.

5. Validate logout:
   - Logout from the app.
   - Confirm cookies are removed and localStorage tokens are removed.

## Common Gotchas

- **Cookies not being set at all**
  - If you proxy baseGeek, you are probably dropping `Set-Cookie`.
  - Fix by explicitly forwarding all `Set-Cookie` headers.

- **Local dev on localhost**
  - `.clintgeek.com` cookies won’t apply to `localhost`.
  - For true SSO testing, use real subdomains or a local domain setup that matches the cookie domain.

- **CORS + credentials mismatch**
  - If your browser is calling an API on a different origin (different port counts), `credentials: "include"` will fail unless CORS explicitly allows credentials.
  - Prefer same-origin API proxying for production SSO behavior.

- **Refresh loops**
  - Ensure you guard against multiple simultaneous refresh calls (axios refresh subscriber pattern).

- **Mixed token sources**
  - During rollout, always keep fallback to localStorage.
  - Don’t change token key names unless you migrate carefully.
