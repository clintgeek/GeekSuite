# GeekSuite SSO Overview — Platform Hardening Audit & Architecture

> **Author**: Sage  
> **Date**: February 2026  
> **Status**: Architecture & Analysis (no code changes yet)

---

## Table of Contents

1. [Phase 1: Current Auth Implementation Inventory](#phase-1-current-auth-implementation-inventory)
2. [Phase 2: Risks & Problems](#phase-2-risks--problems)
3. [Phase 3: GeekSuite Auth Standard](#phase-3-geeksuite-auth-standard)
4. [Phase 4: Migration Plan](#phase-4-migration-plan)

---

# Phase 1: Current Auth Implementation Inventory

## Central Auth Authority: baseGeek

| Aspect | Detail |
|--------|--------|
| **URL** | `https://basegeek.clintgeek.com` |
| **User DB** | MongoDB `userGeek` on `192.168.1.17:27018` |
| **JWT Secret** | Shared `JWT_SECRET` env var (128-char hex) |
| **Access Token TTL** | 1 hour (`JWT_EXPIRES_IN`) |
| **Refresh Token TTL** | 7 days (`REFRESH_TOKEN_EXPIRES_IN`) |
| **Cookie: geek_token** | 7 days max-age, HttpOnly: **true**, Secure: production, SameSite: lax |
| **Cookie: geek_refresh_token** | 30 days max-age, HttpOnly: **true**, Secure: production, SameSite: lax |
| **Cookie Domain** | `.clintgeek.com` (production), omitted in dev |
| **VALID_APPS** | `basegeek, notegeek, bujogeek, fitnessgeek, storygeek, startgeek, flockgeek, musicgeek, babelgeek, bookgeek, gamegeek` |

### baseGeek Auth Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/auth/login` | POST | Login → sets SSO cookies + returns JSON tokens |
| `/api/auth/register` | POST | Register → sets SSO cookies + returns JSON tokens |
| `/api/auth/refresh` | POST | Refresh → accepts body or cookie refresh token, sets new SSO cookies |
| `/api/auth/validate` | POST | Validate token (body) → returns user |
| `/api/auth/logout` | POST | Clears SSO cookies |
| `/api/auth/profile` | GET | Protected — requires Bearer token (old middleware) |
| `/api/users/me` | GET | Protected — used by all apps for cookie-first validation |

### ⚠️ baseGeek Has TWO Auth Middlewares

1. **`packages/api/src/middleware/auth.js`** — Bearer-only (`Authorization` header), no cookie support
2. **`src/middleware/auth.js`** — Older duplicate, also Bearer-only, different VALID_APPS list (missing `musicgeek`, `gamegeek`)

**Neither baseGeek middleware reads cookies.** This is significant: baseGeek's own `/api/auth/profile` endpoint only works with Bearer tokens. The `/api/users/me` endpoint (used by all client apps) is handled separately.

### baseGeek Frontend (Legacy)

- **Zustand store** (`sharedAuthStore.js`): persists `token`, `refreshToken`, `user` to localStorage via `zustand/persist` under key `geek-shared-auth`
- Uses `window.postMessage` for cross-tab auth state sync (not BroadcastChannel)
- `SharedAuthProvider` initializes by calling `/api/auth/validate` with stored token
- `RequireAuth` component redirects to `/login` if not authenticated

---

## Per-App Inventory

### Legend

| Symbol | Meaning |
|--------|---------|
| 🍪 | Cookie-first (reads `geek_token` from cookie) |
| 🔑 | Bearer-only (requires `Authorization` header) |
| 🔄 | Proxies to baseGeek |
| 🏠 | Has own local user DB |
| ⚡ | Has silent refresh |
| 📡 | BroadcastChannel logout |

---

### 1. BabelGeek ✅ Well-Migrated

| Layer | File | Pattern |
|-------|------|---------|
| **Frontend authClient** | `frontend/src/utils/authClient.js` | 🍪 `getMe()` → `/api/me` with `credentials: 'include'` |
| **Frontend AuthContext** | `frontend/src/contexts/AuthContext.jsx` | Hydrates via `getMe()`, login/register → redirect to baseGeek |
| **Frontend authService** | `frontend/src/services/authService.js` | Wrapper around authClient, `refreshToken()` throws (cookie-managed) |
| **Backend middleware** | `backend/src/middleware/authMiddleware.js` | 🍪🔑 Bearer OR `geek_token` cookie → validates via baseGeek `/api/users/me` |
| **Backend controller** | `backend/src/controllers/authController.js` | 🔄 Proxies login/register/refresh/logout to baseGeek, forwards `Set-Cookie` |
| **Backend routes** | `backend/src/routes/auth.js` | `/me` (protected), `/login`, `/register`, `/refresh`, `/logout`, `/validate-sso` |

- **Token Storage**: Cookies only (no localStorage for tokens)
- **Login UX**: Redirect to baseGeek
- **Logout**: BroadcastChannel `geeksuite-auth` with `{ type: "LOGOUT" }` 📡
- **Refresh**: No frontend-initiated refresh; relies on cookie TTL
- **Local User DB**: No

---

### 2. bookgeek ✅ Well-Migrated

| Layer | File | Pattern |
|-------|------|---------|
| **Frontend authClient** | `web/src/utils/authClient.js` | 🍪 `getMe()` → `/api/me` with `credentials: 'include'` |
| **Frontend App** | `web/src/App.jsx` | Uses authClient directly (no separate AuthContext) |
| **Backend middleware** | `api/src/middleware/auth.js` | 🍪🔑 Manual cookie parsing + Bearer fallback → validates via baseGeek `/api/users/me` |
| **Backend routes** | `api/src/routes/authRoutes.js` | 🔄 Full proxy: login/register/refresh/me/logout → baseGeek, forwards `Set-Cookie` |

- **Token Storage**: Cookies only
- **Login UX**: Redirect to baseGeek
- **Logout**: BroadcastChannel `geek-auth` with `{ type: "logout" }` ⚠️ **Different channel name and event type!**
- **Refresh**: Backend proxies refresh to baseGeek
- **Local User DB**: No

---

### 3. BuJoGeek ✅ Mostly Migrated (has legacy remnants)

| Layer | File | Pattern |
|-------|------|---------|
| **Frontend authClient** | `client/src/utils/authClient.js` | 🍪 `getMe()` → `/api/me` with `credentials: 'include'` |
| **Frontend AuthContext** | `client/src/context/AuthContext.jsx` | Hydrates via `getMe()`, login/register → redirect to baseGeek |
| **Backend middleware** | `server/src/middleware/authMiddleware.js` | 🍪🔑 Bearer OR `geek_token` cookie → validates via baseGeek `/api/users/me` |
| **Backend routes** | `server/src/routes/authRoutes.js` | 🔄 Proxies login/register/refresh/logout to baseGeek, `/me` uses authenticate middleware |

- **Token Storage**: Cookies (primary), **but `ssoTokens.js` still exists** reading cookies + localStorage fallback
- **Login UX**: Redirect to baseGeek
- **Logout**: BroadcastChannel `geeksuite-auth` with `{ type: "logout" }` ⚠️ **lowercase type!**
- **Legacy Files**: `client/src/utils/ssoTokens.js` — reads `document.cookie` + `localStorage` fallback for `token` / `bujogeek_refresh_token`
- **Backend authController** (`server/src/controllers/authController.js`): ⚠️ **Has LOCAL register/login that creates users in a LOCAL MongoDB**, issues its own JWTs with `{ _id }` payload (7d TTL). This is a **completely separate auth path** from the SSO proxy routes.
- **Local User DB**: Yes (local User model with password)

---

### 4. fitnessGeek ✅ Well-Migrated (reference implementation)

| Layer | File | Pattern |
|-------|------|---------|
| **Frontend authClient** | `frontend/src/utils/authClient.js` | 🍪 `getMe()` → `/api/me`, **has session keep-alive** ⚡ |
| **Frontend AuthContext** | `frontend/src/contexts/AuthContext.jsx` | Hydrates via `getMe()`, starts `startSessionKeepAlive()` on login |
| **Frontend authService** | `frontend/src/services/authService.js` | Axios-based, `withCredentials: true`, `refreshToken()` throws |
| **Backend middleware** | `backend/src/middleware/auth.js` | 🍪🔑 **LOCAL JWT verification** using shared `JWT_SECRET` (⚠️ hardcoded fallback!) |
| **Backend routes** | `backend/src/routes/authRoutes.js` | 🔄 Proxies login/register/refresh/validate/logout to baseGeek |

- **Token Storage**: Cookies only
- **Login UX**: Redirect to baseGeek
- **Logout**: BroadcastChannel `geeksuite-auth` with `{ type: "LOGOUT" }` 📡
- **Silent Refresh**: ⚡ `startSessionKeepAlive()` — POSTs to `/api/auth/refresh` every 15 minutes (configurable). On failure, forces logout. **Only app with proactive refresh.**
- **Backend Auth Strategy**: **HYBRID** — middleware verifies JWT locally using shared secret (fast, no network call), but auth routes proxy to baseGeek. This means fitnessGeek can validate tokens even if baseGeek is temporarily down.
- **Security Concern**: `JWT_SECRET` is **hardcoded as fallback** in `backend/src/middleware/auth.js` line 5
- **Local Cookie Rewriting**: Dev mode rewrites `Set-Cookie` domain/secure flags for localhost
- **Local User DB**: No
- **Service Worker**: `sw.js` present (Workbox PWA) — potential cache interaction with auth

---

### 5. FlockGeek ✅ Well-Migrated

| Layer | File | Pattern |
|-------|------|---------|
| **Frontend authClient** | `frontend/src/utils/authClient.js` | 🍪 `getMe()` → `/api/me` with `credentials: 'include'` |
| **Frontend AuthContext** | `frontend/src/contexts/AuthContext.jsx` | Hydrates via `getMe()`, no login/register redirect built in |
| **Backend middleware** | `backend/src/middleware/authMiddleware.js` | 🍪🔑 Bearer OR `geek_token` cookie → validates via baseGeek `/api/users/me` |
| **Backend controller** | `backend/src/controllers/authController.js` | 🔄 Proxies login/register/refresh/logout/me to baseGeek |

- **Token Storage**: Cookies only
- **Login UX**: Redirect to baseGeek (via authClient)
- **Logout**: BroadcastChannel `geeksuite-auth` with `{ type: "LOGOUT" }` 📡
- **Refresh**: FlockGeek's `refresh` controller **requires `refreshToken` in body** — does NOT read from cookie. This means cookie-only refresh won't work.
- **`requireOwner` middleware**: Additional ownership layer that extracts ownerId from user
- **Local User DB**: No
- **Service Worker**: `sw.js` present

---

### 6. MusicGeek ✅ Well-Migrated

| Layer | File | Pattern |
|-------|------|---------|
| **Frontend authClient** | `frontend/src/utils/authClient.js` | 🍪 `getMe()` → `/api/me` with `credentials: 'include'` |
| **Frontend AuthContext** | `frontend/src/context/AuthContext.jsx` | Hydrates via `getMe()`, login/register → redirect to baseGeek |
| **Backend middleware** | `backend/src/middleware/auth.js` | 🍪🔑 Bearer OR `geek_token` cookie → validates via baseGeek `/api/users/me` |
| **Backend controller** | `backend/src/controllers/authController.js` | 🔄 Proxies all auth to baseGeek, creates local UserProfile on login/register |

- **Token Storage**: Cookies only
- **Login UX**: Redirect to baseGeek
- **Logout**: BroadcastChannel `geeksuite-auth` with `{ type: "logout" }` ⚠️ **lowercase type!**
- **Refresh**: Requires `refreshToken` in body (same issue as FlockGeek)
- **Local User DB**: Yes — `UserProfile` model for music-specific data (created on login)
- **`/auth/logout` requires authentication** — must be logged in to log out ⚠️

---

### 7. NoteGeek ⚠️ Partially Migrated (highest risk)

| Layer | File | Pattern |
|-------|------|---------|
| **Frontend authClient** | `client/src/utils/authClient.js` | 🍪 `getMe()` → `/api/me` with `credentials: 'include'` |
| **Frontend authStore** | `client/src/store/authStore.js` | Zustand + persist (but partializes to `{}` — no tokens persisted) |
| **Backend middleware (OLD)** | `server/middleware/auth.js` | 🔑 **Bearer-only**, local JWT verify + local User DB lookup |
| **Backend middleware (NEW)** | `server/middleware/authMiddleware.js` | 🍪🔑 Cookie-first → validates via baseGeek, creates local user mapping |
| **Backend routes** | `server/routes/auth.js` | **MIXED**: `/me` and `/logout` proxy to baseGeek, but `/login` and `/register` use LOCAL controllers |
| **Backend controller** | `server/controllers/auth.js` | ⚠️ **Fully local auth**: bcrypt password hashing, own JWT generation (30d TTL!), own User model |

- **Token Storage**: Cookies for SSO, but local auth also issues tokens
- **Login UX**: Redirect to baseGeek (via authClient)
- **Logout**: BroadcastChannel `geeksuite-auth` with `{ type: "LOGOUT" }` 📡
- **Critical Issues**:
  - **TWO auth middlewares** — old `auth.js` (Bearer-only, local DB) and new `authMiddleware.js` (cookie-first, baseGeek proxy). Which routes use which is unclear without checking all route files.
  - **Local login/register** still creates users in NoteGeek's own MongoDB with bcrypt passwords and 30-day JWTs
  - **Local JWT TTL is 30 DAYS** vs baseGeek's 1 hour — massive inconsistency
  - **`validate-sso` route** verifies JWT locally, then looks up user in local DB — creates user with `passwordHash: 'SSO_USER'` if not found
- **Local User DB**: Yes — with full password auth capability separate from baseGeek

---

### 8. photoGeek ⚠️ Partially Migrated

| Layer | File | Pattern |
|-------|------|---------|
| **Frontend authClient** | `frontend/src/utils/authClient.js` | 🍪 `getMe()` → `/api/me` with `credentials: 'include'` |
| **Frontend AuthContext** | `frontend/src/contexts/AuthContext.jsx` | Hydrates via `getMe()`, login/register → redirect to baseGeek |
| **Backend middleware** | `backend/src/middleware/auth.js` | 🍪🔑 **HYBRID**: tries local JWT verify first, falls back to baseGeek `/api/users/me` |
| **Backend controller** | `backend/src/controllers/authController.js` | 🔄 Proxies login/register to baseGeek, but creates local User records |

- **Token Storage**: Cookies (primary)
- **Login UX**: Redirect to baseGeek
- **Logout**: BroadcastChannel `geeksuite-auth` with `{ type: "LOGOUT" }` 📡
- **Critical Issues**:
  - **`photogeek` is NOT in baseGeek's `VALID_APPS` list!** Frontend hardcodes `app: 'fitnessgeek'` as workaround
  - Backend middleware tries **local JWT verification first** before falling back to baseGeek — this means old local tokens still work
  - `generateToken()` function in middleware creates **30-day local JWTs**
  - Local user records created with `password: 'sso_managed_password'` (literal string, not hashed)
- **Local User DB**: Yes — with local user creation on every SSO login

---

### 9. geekSuite (Gateway/Landing) ✅ Clean

| Layer | File | Pattern |
|-------|------|---------|
| **Frontend auth** | `src/client/state/auth.jsx` | 🍪 `apiMe()` → `/api/me` with `credentials: 'include'` |
| **Backend (Bun)** | `src/server/index.js` | 🍪 Reads `geek_token` from cookie, forwards to baseGeek `/api/users/me` |

- **Token Storage**: Cookies only
- **Login UX**: Redirect to baseGeek via `/api/auth/login-redirect`
- **Logout**: Direct `fetch` to `/api/auth/logout`, no BroadcastChannel ⚠️
- **Runs on Bun** (not Express) — different cookie parsing
- **No local user DB**

---

## Summary: Token Verification Strategy by App

| App | Frontend | Backend Token Source | Backend Verification | Local User DB | Refresh Strategy |
|-----|----------|---------------------|---------------------|---------------|-----------------|
| **baseGeek** | Zustand + localStorage | Bearer header only | Local JWT verify | Central (userGeek) | Body or cookie → new tokens + cookies |
| **BabelGeek** | Cookie (getMe) | Cookie + Bearer | Proxy to baseGeek | No | None (frontend) |
| **bookgeek** | Cookie (getMe) | Cookie + Bearer | Proxy to baseGeek | No | Proxy to baseGeek |
| **BuJoGeek** | Cookie (getMe) | Cookie + Bearer | Proxy to baseGeek | ⚠️ Yes (legacy) | Proxy to baseGeek |
| **fitnessGeek** | Cookie (getMe) | Cookie + Bearer | **Local JWT verify** | No | ⚡ Keep-alive every 15min |
| **FlockGeek** | Cookie (getMe) | Cookie + Bearer | Proxy to baseGeek | No | Body-only (broken for cookies) |
| **MusicGeek** | Cookie (getMe) | Cookie + Bearer | Proxy to baseGeek | Yes (profiles) | Body-only (broken for cookies) |
| **NoteGeek** | Cookie (getMe) | Cookie + Bearer | **Mixed** (2 middlewares) | ⚠️ Yes (full local auth) | None |
| **photoGeek** | Cookie (getMe) | Cookie + Bearer | **Hybrid** (local first) | ⚠️ Yes (local records) | None |
| **geekSuite** | Cookie (apiMe) | Cookie only | Proxy to baseGeek | No | None |

---

## BroadcastChannel Inconsistencies

| App | Channel Name | Logout Message Type |
|-----|-------------|-------------------|
| **BabelGeek** | `geeksuite-auth` | `LOGOUT` |
| **bookgeek** | `geek-auth` ⚠️ | `logout` ⚠️ |
| **BuJoGeek** | `geeksuite-auth` | `logout` ⚠️ |
| **fitnessGeek** | `geeksuite-auth` | `LOGOUT` |
| **FlockGeek** | `geeksuite-auth` | `LOGOUT` |
| **MusicGeek** | `geeksuite-auth` | `logout` ⚠️ |
| **NoteGeek** | `geeksuite-auth` | `LOGOUT` |
| **photoGeek** | `geeksuite-auth` | `LOGOUT` |
| **geekSuite** | *(none)* ⚠️ | N/A |
| **baseGeek** | *(postMessage)* ⚠️ | `GEEK_AUTH_STATE_CHANGE` |

**Impact**: Cross-tab logout will NOT work between apps using different channel names or message types. bookgeek uses `geek-auth`/`logout`, several apps use lowercase `logout`, baseGeek uses `postMessage` instead of BroadcastChannel entirely.

---

## Legacy/Deprecated Files Still Present

| File | App | Status |
|------|-----|--------|
| `baseGeek/packages/ui/src/utils/ssoTokens.js` | baseGeek | Marked for deletion in CONTEXT.md |
| `fitnessGeek/frontend/src/utils/ssoTokens.js` | fitnessGeek | Marked for deletion |
| `BuJoGeek/client/src/utils/ssoTokens.js` | BuJoGeek | **Still referenced?** Reads cookie + localStorage fallback |
| `baseGeek/packages/ui/src/store/sharedAuthStore.js` | baseGeek | Legacy Zustand store persisting tokens to localStorage |
| `baseGeek/src/middleware/auth.js` | baseGeek | Old duplicate middleware with different VALID_APPS |

---

## Service Workers Present

| App | SW File | Risk |
|-----|---------|------|
| **BabelGeek** | `frontend/public/sw.js` | May cache `/api/me` responses |
| **BuJoGeek** | `client/dev-dist/sw.js` | Workbox PWA — potential stale auth cache |
| **fitnessGeek** | `frontend/public/sw.js` | Workbox PWA — potential stale auth cache |
| **FlockGeek** | `frontend/public/sw.js` | May cache auth responses |
| **NoteGeek** | `client/dev-dist/sw.js` | Workbox PWA |

---

# Phase 2: Risks & Problems

## 🔴 Critical Security Risks

### 1. JWT Secret Hardcoded in fitnessGeek
`fitnessGeek/backend/src/middleware/auth.js` line 5 contains the **full production JWT secret** as a fallback default. If this file is ever exposed (source leak, debug endpoint, stack trace), the entire platform's auth is compromised.

### 2. photoGeek Not in VALID_APPS
`photogeek` is missing from baseGeek's `VALID_APPS`. The frontend works around this by sending `app: 'fitnessgeek'` — meaning photoGeek sessions masquerade as fitnessGeek sessions. Any app-specific authorization decisions based on the `app` claim will be wrong.

### 3. NoteGeek Dual Auth System
NoteGeek has **two completely separate authentication paths**: local bcrypt auth (30-day tokens) and SSO cookie auth (1-hour tokens). A user could have two different sessions simultaneously. The local auth path has no refresh mechanism and extremely long token TTL.

### 4. Plaintext Placeholder Passwords
photoGeek stores `'sso_managed_password'` as literal plaintext in local user records. NoteGeek stores `'SSO_USER'` as `passwordHash`. Neither is actually hashed — if anyone attempts local login with these values, behavior is undefined.

### 5. Debug Endpoint Exposes User Data
`baseGeek/packages/api/src/routes/auth.js` has `GET /api/auth/debug/user/:identifier` — returns user metadata including password existence/length for any user. **No authentication required.**

### 6. Reset Password Endpoint Has No Auth
`baseGeek POST /api/auth/reset-password` accepts `identifier` + `newPassword` with **zero authentication**. Anyone can reset anyone's password.

---

## 🟠 Session & UX Problems

### 7. Access Token TTL Mismatch
baseGeek issues **1-hour access tokens** but sets the `geek_token` cookie with a **7-day max-age**. After 1 hour, the cookie still exists but the JWT inside is expired. Only fitnessGeek has proactive refresh to prevent this. All other apps will encounter "surprise logouts" after 1 hour of inactivity.

**This is the #1 cause of occasional logouts.**

### 8. No Universal Silent Refresh
Only fitnessGeek implements `startSessionKeepAlive()`. All other apps have no mechanism to refresh tokens before they expire. When the 1-hour access token expires:
- The cookie is still present (7-day max-age)
- But the JWT inside is expired
- The next `/api/me` call returns 401
- User appears logged out despite having a valid cookie

### 9. Refresh Token Not Usable From Cookies in Most Apps
baseGeek's refresh endpoint reads `req.cookies?.geek_refresh_token` as fallback — good. But:
- FlockGeek and MusicGeek's refresh controllers require `refreshToken` in the request body
- Most frontends don't send the refresh token (it's HttpOnly, they can't read it)
- Result: **refresh is broken** for cookie-first apps that don't proxy properly

### 10. Cache Clearing Breaks Sessions
Clearing browser cache/cookies removes `geek_token` and `geek_refresh_token`. Since no app stores tokens in memory (all rely on cookies), this immediately logs the user out of everything. There's no re-hydration mechanism — the user must visit baseGeek to log in again.

### 11. Cross-Tab Logout Doesn't Work Reliably
Three different BroadcastChannel names (`geeksuite-auth`, `geek-auth`, none) and two different message types (`LOGOUT`, `logout`) mean cross-tab logout is fragmented. baseGeek itself uses `postMessage` instead of BroadcastChannel.

### 12. Service Worker Caching Auth Responses
Apps with Workbox service workers (fitnessGeek, BuJoGeek, NoteGeek, FlockGeek, BabelGeek) may cache `/api/me` responses. Even though backends set `Cache-Control: no-store`, service workers can intercept before the cache header is evaluated. A stale cached "authenticated" response after logout would keep showing the user as logged in.

---

## 🟡 Architecture Inconsistencies

### 13. Two Validation Strategies
- **Proxy validation** (BabelGeek, bookgeek, BuJoGeek, FlockGeek, MusicGeek, geekSuite): Each request to `/api/me` makes a network call to `baseGeek /api/users/me`. Adds latency and creates baseGeek as single point of failure.
- **Local JWT validation** (fitnessGeek): Verifies JWT locally with shared secret. Fast, works offline from baseGeek, but won't catch revoked tokens.
- **Hybrid** (photoGeek, NoteGeek): Tries local first, falls back to proxy. Complex, harder to reason about.

### 14. Duplicated Utility Code
Every app has its own copy of:
- `getTokenFromRequest()` / `getCookieFromHeader()` — cookie parsing
- `forwardSetCookieHeaders()` — Set-Cookie forwarding
- `authClient.js` — frontend auth utilities (getMe, loginRedirect, logout, onLogout)
- User ID normalization (`_id` / `id` / `userId`)

These are all slightly different implementations of the same logic.

### 15. No Token Revocation
There is no token blacklist or revocation mechanism. Logging out clears cookies but the JWT remains valid until expiration. If an attacker captures a token, it's valid for the full 1-hour TTL regardless of logout.

### 16. Local User DB Fragmentation
BuJoGeek, NoteGeek, MusicGeek, and photoGeek maintain local user records mapped to baseGeek user IDs. Each has its own user creation/mapping logic. If baseGeek user IDs change (migration, data recovery), the mapping breaks silently.

---

# Phase 3: GeekSuite Auth Standard

## Design Goals

1. **Seamless SSO**: Login once at baseGeek → authenticated everywhere on `*.clintgeek.com`
2. **Silent refresh**: Tokens refresh before expiration — no surprise logouts
3. **Consistent UX**: All apps redirect to baseGeek for login/register
4. **Single source of truth**: One shared auth package, not 9 copies
5. **Extension-ready**: Works with a future browser extension
6. **Resilient**: Graceful degradation if baseGeek is temporarily unreachable

---

## Token Architecture

### Where Tokens Live

| Token | Storage | HttpOnly | Max-Age | Notes |
|-------|---------|----------|---------|-------|
| `geek_token` (access) | Cookie on `.clintgeek.com` | **true** | Match JWT TTL (align to 1h) | Browser sends automatically |
| `geek_refresh_token` | Cookie on `.clintgeek.com` | **true** | 30 days | Used server-side only |

**No tokens in localStorage or JS memory.** Frontend never reads tokens. Period.

### Token TTL Alignment (Critical Fix)

| Current | Proposed | Rationale |
|---------|----------|-----------|
| Access JWT: 1h, Cookie: 7d | Access JWT: **1h**, Cookie: **1h** | Cookie and JWT TTL must match. A cookie containing an expired JWT is worse than no cookie. |
| Refresh JWT: 7d, Cookie: 30d | Refresh JWT: **30d**, Cookie: **30d** | Refresh token should last as long as "remember me" session |

### How Refresh Should Work

```
┌─────────────┐     every ~50 min      ┌──────────────┐     POST /api/auth/refresh     ┌──────────────┐
│   Browser    │ ──────────────────────▶│  App Backend  │ ────────────────────────────▶  │   baseGeek   │
│  (frontend)  │                        │  (proxy)      │    Cookie: geek_refresh_token  │   (auth)     │
│              │◀──────────────────────│              │◀────────────────────────────── │              │
│              │  Set-Cookie: new tokens│              │  Set-Cookie: new tokens        │              │
└─────────────┘                        └──────────────┘                                └──────────────┘
```

1. **Frontend** runs a `setInterval` that POSTs to its own backend `/api/auth/refresh` every **50 minutes** (before the 60-min access token expires)
2. **App backend** reads `geek_refresh_token` from the incoming cookie, forwards to `baseGeek /api/auth/refresh`
3. **baseGeek** validates refresh token, issues new access + refresh tokens, sets new SSO cookies
4. **App backend** forwards `Set-Cookie` headers back to browser
5. If refresh fails (e.g., refresh token expired), frontend triggers logout + redirect to baseGeek login

### How Apps Should Check Auth on Load

```javascript
// Standard hydration flow (every app)
async function hydrate() {
  const user = await getMe();     // GET /api/me, credentials: 'include'
  if (user) {
    setUser(user);
    startRefreshTimer();           // Begin silent refresh cycle
  } else {
    setUser(null);
    // App decides: show landing page or redirect to login
  }
}
```

### Login UX Pattern

**All apps MUST redirect to baseGeek for login/register.** No in-app login forms.

```
User visits app → app calls /api/me → 401 → show "Continue with GeekSuite" button
  └─▶ Click → redirect to basegeek.clintgeek.com/login?app=X&redirect=<return_url>
       └─▶ baseGeek login form → success → Set-Cookie on .clintgeek.com → redirect back
            └─▶ App loads → /api/me → 200 → user is authenticated
```

### Logout UX Pattern

```javascript
async function logout() {
  // 1. Tell backend to proxy logout to baseGeek (clears SSO cookies)
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
  
  // 2. Broadcast to other tabs
  const bc = new BroadcastChannel('geeksuite-auth');
  bc.postMessage({ type: 'LOGOUT' });
  bc.close();
  
  // 3. Clear local state
  setUser(null);
  stopRefreshTimer();
}
```

### Cross-Subdomain Trust Model

All apps on `*.clintgeek.com` automatically receive the SSO cookie because it's set with `domain=.clintgeek.com`. Trust is implicit via the shared domain. Each app's backend validates the token independently (either locally or via proxy to baseGeek).

---

## Shared Auth Package: `@geeksuite/auth`

### Recommended Structure

```
packages/
  geeksuite-auth/
    package.json
    src/
      client/                    # Frontend utilities
        authClient.js            # getMe, loginRedirect, logout, onLogout
        useGeekAuth.js           # React hook (optional)
        AuthProvider.jsx         # React context provider
        refreshTimer.js          # Silent refresh interval
        constants.js             # Channel names, event types
      server/                    # Backend utilities (Express middleware)
        cookieAuth.js            # Read geek_token from cookie/bearer
        proxyAuth.js             # Validate via baseGeek /api/users/me
        localAuth.js             # Validate JWT locally (for apps that want it)
        authRoutes.js            # Standard proxy routes factory
        forwardCookies.js        # Set-Cookie forwarding helper
        constants.js             # Cookie names, baseGeek URL
      index.js                   # Main export
```

### Client API

```javascript
// @geeksuite/auth/client

export async function getMe(apiBase?: string): Promise<User | null>
export function loginRedirect(app: string, returnTo?: string, mode?: 'login' | 'register'): void
export async function logout(apiBase?: string): Promise<void>
export function onLogout(callback: () => void): () => void  // returns unsubscribe
export function startRefreshTimer(apiBase?: string, onFailure?: () => void): void
export function stopRefreshTimer(): void

// React
export function GeekAuthProvider({ children, app }): JSX.Element
export function useGeekAuth(): { user, loading, login, register, logout, isAuthenticated }
```

### Server API

```javascript
// @geeksuite/auth/server

export function geekCookieAuth(options?: { baseGeekUrl: string }): ExpressMiddleware
  // Reads geek_token from cookie or Bearer header
  // Validates via baseGeek /api/users/me
  // Sets req.user

export function geekLocalAuth(jwtSecret: string): ExpressMiddleware
  // Reads geek_token from cookie or Bearer header
  // Verifies JWT locally (no network call)
  // Sets req.user

export function createAuthRoutes(options: { baseGeekUrl: string, app: string }): ExpressRouter
  // Returns router with: POST /login, /register, /refresh, /logout, GET /me
  // All proxy to baseGeek with Set-Cookie forwarding

export function forwardSetCookieHeaders(res, upstreamHeaders): void
export function getTokenFromRequest(req): string | null
```

---

## Standardized Constants

```javascript
// All apps must use these exact values:
const BROADCAST_CHANNEL = 'geeksuite-auth';
const LOGOUT_EVENT_TYPE = 'LOGOUT';
const ACCESS_COOKIE = 'geek_token';
const REFRESH_COOKIE = 'geek_refresh_token';
```

---

# Phase 4: Migration Plan

## Principles

- **Incremental**: One app at a time, no big bang
- **Backward compatible**: Existing sessions must survive each step
- **Testable**: Each step has verification criteria
- **Reversible**: Each step can be rolled back

---

## Step 0: Critical Security Fixes (Do First, Do Now)

These are urgent regardless of the broader migration:

- [ ] **Remove hardcoded JWT secret** from `fitnessGeek/backend/src/middleware/auth.js`
- [ ] **Add authentication** to `baseGeek POST /api/auth/reset-password`
- [ ] **Remove or protect** `baseGeek GET /api/auth/debug/user/:identifier`
- [ ] **Add `photogeek`** to baseGeek's `VALID_APPS` list (all three locations)
- [ ] **Remove old baseGeek middleware** at `baseGeek/src/middleware/auth.js` (the duplicate)

---

## Step 1: Create Shared Package `@geeksuite/auth`

- [ ] Create `packages/geeksuite-auth/` at the monorepo root
- [ ] Implement `client/authClient.js` — canonical getMe, loginRedirect, logout, onLogout
- [ ] Implement `client/refreshTimer.js` — based on fitnessGeek's `startSessionKeepAlive`
- [ ] Implement `client/AuthProvider.jsx` — canonical React context
- [ ] Implement `server/cookieAuth.js` — canonical middleware
- [ ] Implement `server/authRoutes.js` — factory for standard proxy routes
- [ ] Implement `server/forwardCookies.js` — Set-Cookie helper
- [ ] Add tests for all utilities
- [ ] Publish locally (workspace dependency or npm link)

**Verification**: Unit tests pass, package can be imported from any app.

---

## Step 2: Align baseGeek Token/Cookie TTLs

- [ ] Set `geek_token` cookie `maxAge` to match `JWT_EXPIRES_IN` (1 hour)
- [ ] Ensure `geek_refresh_token` cookie `maxAge` matches refresh TTL (30 days)
- [ ] Update `REFRESH_TOKEN_EXPIRES_IN` to `30d` to match cookie max-age
- [ ] Make baseGeek refresh endpoint **always read refresh token from cookie** as primary source (body as fallback)

**Verification**: After login, `geek_token` cookie expires in 1h. After 1h, cookie disappears. Refresh endpoint can use cookie-only refresh.

---

## Step 3: Add Cookie Support to baseGeek's Own Middleware

- [ ] Update `packages/api/src/middleware/auth.js` to read `geek_token` cookie as fallback (not just Bearer)
- [ ] This makes baseGeek's own protected endpoints (like `/api/auth/profile`) work with SSO cookies

**Verification**: `GET /api/auth/profile` works with just the SSO cookie (no Authorization header).

---

## Step 4: Migrate Apps (One at a Time)

For each app, in order of risk (lowest risk first):

### Migration Order

1. **geekSuite** — Already clean, just needs BroadcastChannel
2. **BabelGeek** — Already well-migrated, swap to shared package
3. **FlockGeek** — Well-migrated, fix refresh + swap to shared package
4. **bookgeek** — Well-migrated, fix channel name + swap to shared package
5. **MusicGeek** — Well-migrated, fix refresh + logout auth requirement + swap
6. **fitnessGeek** — Reference impl, swap to shared package (keep local JWT verify as option)
7. **BuJoGeek** — Remove legacy ssoTokens.js, local auth controller, swap to shared package
8. **photoGeek** — Remove hybrid middleware, fix VALID_APPS, remove local JWT generation, swap
9. **NoteGeek** — Highest risk: remove dual auth, remove local register/login, swap to shared package

### Per-App Migration Checklist

For each app:

- [ ] Add `@geeksuite/auth` as workspace dependency
- [ ] **Frontend**: Replace local `authClient.js` with `@geeksuite/auth/client`
- [ ] **Frontend**: Replace local `AuthContext.jsx` with `@geeksuite/auth/client/AuthProvider`
- [ ] **Frontend**: Add `startRefreshTimer()` to auth hydration flow
- [ ] **Frontend**: Standardize BroadcastChannel to `geeksuite-auth` / `LOGOUT`
- [ ] **Backend**: Replace local auth middleware with `@geeksuite/auth/server/cookieAuth`
- [ ] **Backend**: Replace local auth routes with `createAuthRoutes()`
- [ ] **Backend**: Remove duplicated `forwardSetCookieHeaders`, `getTokenFromRequest`, etc.
- [ ] **Backend**: Ensure service worker (if present) does NOT cache `/api/me` or `/api/auth/*`
- [ ] Delete deprecated files: local `authClient.js`, `ssoTokens.js`, local auth controllers
- [ ] Test: Login via baseGeek → redirected back → authenticated
- [ ] Test: Silent refresh works (wait >50 min or simulate)
- [ ] Test: Logout clears all tabs
- [ ] Test: Opening another GeekSuite app in new tab → auto-authenticated

---

## Step 5: Clean Up Legacy

- [ ] Delete `baseGeek/packages/ui/src/utils/ssoTokens.js`
- [ ] Delete `fitnessGeek/frontend/src/utils/ssoTokens.js`
- [ ] Delete `BuJoGeek/client/src/utils/ssoTokens.js`
- [ ] Remove `baseGeek/packages/ui/src/store/sharedAuthStore.js` (or migrate to cookie-first)
- [ ] Remove `BuJoGeek/server/src/controllers/authController.js` (local auth)
- [ ] Remove `NoteGeek/server/controllers/auth.js` (local auth)
- [ ] Remove `NoteGeek/server/middleware/auth.js` (old Bearer-only middleware)
- [ ] Remove `photoGeek/backend/src/middleware/auth.js` `generateToken()` function
- [ ] Audit all service workers to exclude auth endpoints from caching

---

## Step 6: Verification & Hardening

- [ ] Cross-app SSO test: Login at baseGeek → visit all 9 apps → all authenticated
- [ ] Silent refresh test: Leave app open for 2+ hours → no logout
- [ ] Logout test: Logout from any app → all other open tabs show logged-out
- [ ] Cache clear test: Clear cookies → refresh → clean redirect to login
- [ ] Extension test: Prepare for future browser extension auth flow
- [ ] Load test: Ensure baseGeek `/api/users/me` can handle validation traffic from all apps
- [ ] Consider: Add local JWT verify as **optional optimization** for high-traffic apps (with caveat about revocation)

---

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| Breaking existing sessions during migration | Cookie names don't change; only the code reading them changes |
| baseGeek downtime breaks all apps | Apps using local JWT verify (opt-in) remain functional |
| Shared package has a bug | Each app migrates independently; can revert one app without affecting others |
| Service workers serve stale auth | Add `/api/me` and `/api/auth/*` to SW navigation exclude list |
| Refresh timer creates too much traffic | 50-min interval × ~10 active users = ~12 requests/hour — negligible |

---

## Timeline Estimate

| Phase | Effort | Dependencies |
|-------|--------|-------------|
| Step 0: Security fixes | 1-2 hours | None — do immediately |
| Step 1: Shared package | 4-6 hours | None |
| Step 2: baseGeek TTL alignment | 1-2 hours | Step 1 |
| Step 3: baseGeek middleware update | 30 min | Step 2 |
| Step 4: App migrations (×9) | 1-2 hours each | Steps 1-3 |
| Step 5: Legacy cleanup | 2-3 hours | Step 4 |
| Step 6: Verification | 2-3 hours | Step 5 |

**Total estimated effort: ~25-35 hours**

---

*"Login once, stay logged in everywhere, tokens refresh silently. That's the promise. Let's deliver it."*

— Sage
