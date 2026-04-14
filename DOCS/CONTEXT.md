# GeekSuite Unified SSO - Technical Context

> ⚠️ **SENSITIVE FILE** - Contains secrets. Delete or gitignore before committing.

## Overview

This document contains technical context, secrets, and implementation notes for the unified SSO system across all GeekSuite applications.

---

## 🔐 Secrets & Credentials

### JWT Configuration (baseGeek)
```bash
JWT_SECRET=CHANGE_ME_SET_JWT_SECRET
JWT_REFRESH_SECRET=CHANGE_ME_SET_JWT_REFRESH_SECRET
JWT_EXPIRES_IN=1h
REFRESH_TOKEN_EXPIRES_IN=7d
```

### User Database (userGeek)
```bash
USERGEEK_MONGODB_URI=mongodb://localhost:27017/userGeek?authSource=admin
```

### SSO Cookie Configuration
```bash
SSO_COOKIE_DOMAIN=.clintgeek.com
# Cookies: geek_token (7 days), geek_refresh_token (30 days)
# HttpOnly: false (required for JS access during migration)
# Secure: true in production
# SameSite: lax
```

---

## 🏗️ Architecture Summary

### Central Auth Authority: **baseGeek**
- **URL**: `https://basegeek.clintgeek.com`
- **User DB**: MongoDB `userGeek` database on `192.168.1.17:27018`
- **Auth Endpoints**:
  - `POST /api/auth/login` - Login (sets SSO cookies)
  - `POST /api/auth/register` - Register (sets SSO cookies)
  - `POST /api/auth/refresh` - Refresh tokens (sets SSO cookies)
  - `POST /api/auth/validate` - Validate token
  - `POST /api/auth/logout` - Logout (clears SSO cookies)
  - `GET /api/auth/profile` - Get user profile (requires auth)

### Token Structure (JWT Payload)
```json
{
  "id": "user._id",
  "username": "user.username",
  "email": "user.email",
  "app": "appname"  // e.g., "basegeek", "fitnessgeek", etc.
}
```

### Valid Apps (hardcoded in baseGeek)
```javascript
const VALID_APPS = [
  'basegeek', 'notegeek', 'bujogeek', 'fitnessgeek',
  'storygeek', 'startgeek', 'flockgeek', 'musicgeek',
  'babelgeek', 'bookgeek'
];
```

---

## 🍪 SSO Cookie Mechanism

### ⚠️ Critical: HttpOnly Cookies

**Current state**: `httpOnly: false` (insecure, allows JS reading)
**Target state**: `httpOnly: true` (secure, JS cannot read)

When cookies are HttpOnly:
- ❌ `document.cookie` cannot see them
- ❌ `getCookie('geek_token')` in JS will NOT work
- ✅ Browser still sends them with every request automatically
- ✅ Server can read them from `req.cookies`

### How It Should Work
1. User logs in via baseGeek
2. baseGeek sets HttpOnly cookies on `.clintgeek.com`
3. Browser automatically sends cookies with every request to `*.clintgeek.com`
4. Each app's backend reads cookie, verifies JWT, returns user
5. **Frontend never reads tokens** — just calls `/api/me`

### Cookie Configuration
| Cookie | Purpose | Max Age | HttpOnly |
|--------|---------|---------|----------|
| `geek_token` | Access token | 7 days | **true** (target) |
| `geek_refresh_token` | Refresh token | 30 days | **true** (target) |

### The Pattern (every app)
```javascript
// Frontend: ask server who am I
const res = await fetch('/api/me', { credentials: 'include' });
const user = res.ok ? (await res.json()).user : null;

// Backend: read cookie, verify JWT
const token = req.cookies?.geek_token;
const user = jwt.verify(token, JWT_SECRET);
res.json({ user });
```

---

## 📱 App Migration Status & File Locations

| App | Status | Frontend Auth File | Backend Auth Route |
|-----|--------|-------------------|-------------------|
| **baseGeek** | 🔧 Update cookies | `packages/ui/src/utils/ssoTokens.js` (DELETE) | `packages/api/src/routes/auth.js` |
| **geekSuite** | 🔄 Remove fallback | `src/client/state/auth.jsx` | `src/server/index.js` |
| **FitnessGeek** | 🔄 Reference impl | `frontend/src/contexts/AuthContext.jsx` | `backend/src/routes/authRoutes.js` |
| **BuJoGeek** | 🔄 Needs migration | `client/src/context/AuthContext.jsx` | `server/src/routes/authRoutes.js` |
| **NoteGeek** | ❌ Uses `auth_token` | `client/src/store/authStore.js` | `server/routes/auth.js` |
| **FlockGeek** | ✅ Verify HttpOnly | `frontend/src/contexts/AuthContext.jsx` | `backend/src/routes/auth.js` |
| **BabelGeek** | ✅ Verify HttpOnly | `frontend/src/contexts/AuthContext.jsx` | `backend/src/routes/auth.js` |
| **BookGeek** | 🔄 Needs migration | `web/src/App.jsx` | `api/src/routes/authRoutes.js` |
| **MusicGeek** | ❌ Needs migration | `frontend/src/context/AuthContext.jsx` | `backend/src/routes/auth.js` |
| **PhotoGeek** | ❌ Needs migration | `frontend/src/contexts/AuthContext.jsx` | `backend/src/routes/auth.js` |
| **StoryGeek** | ❌ Needs migration | `frontend/src/store/sharedAuthStore.js` | `backend/src/routes/auth.js` |

### ssoTokens.js Files (TO BE DELETED)
```
baseGeek/packages/ui/src/utils/ssoTokens.js
BuJoGeek/client/src/utils/ssoTokens.js
fitnessGeek/frontend/src/utils/ssoTokens.js
```

---

## 🔑 Key Files

### baseGeek (Auth Server)
- `packages/api/src/routes/auth.js` - Auth endpoints + SSO cookie logic
- `packages/api/src/services/authService.js` - Token generation/validation
- `packages/api/src/middleware/auth.js` - JWT middleware
- `packages/api/src/models/user.js` - User model (userGeek DB)
- `packages/ui/src/store/sharedAuthStore.js` - Zustand auth store (legacy, being replaced)

### geekSuite (Gateway/Landing)
- `src/server/index.js` - Bun server, proxies to baseGeek
- `src/client/state/auth.jsx` - React auth context
- `src/client/views/Login.jsx` - Login form

### Standard Auth Utilities (NEW - for all apps)

#### Frontend: `authClient.js` (NO token reading)
```javascript
// frontend/src/utils/authClient.js
const BASEGEEK_URL = 'https://basegeek.clintgeek.com';

// Get current user - server reads cookie, returns user or 401
export async function getMe() {
  const res = await fetch('/api/me', { credentials: 'include' });
  if (!res.ok) return null;
  const data = await res.json();
  return data.user || null;
}

// Redirect to baseGeek login
export function loginRedirect(returnTo = window.location.href) {
  const url = new URL(`${BASEGEEK_URL}/login`);
  url.searchParams.set('returnTo', returnTo);
  window.location.href = url.toString();
}

// Logout - clears cookie on server
export async function logout() {
  try {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
  } catch {}
  // BroadcastChannel for other tabs
  try {
    const channel = new BroadcastChannel('geeksuite-auth');
    channel.postMessage({ type: 'LOGOUT' });
    channel.close();
  } catch {}
}
```

#### Backend: `requireGeekAuth` middleware
```javascript
// Read cookie server-side, verify JWT
import jwt from 'jsonwebtoken';

export function requireGeekAuth(req, res, next) {
  const token = req.cookies?.geek_token;
  if (!token) return res.status(401).json({ error: 'Not authenticated' });

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}
```

### ❌ DEPRECATED: ssoTokens.js
The old `ssoTokens.js` with `getCookie()` and `getToken()` is being removed.
**Reason**: HttpOnly cookies cannot be read by JavaScript. Frontend should never read tokens.

---

## ⚠️ Known Issues & Gotchas

### 1. Local Development
- `.clintgeek.com` cookies won't work on `localhost`
- For true SSO testing, use real subdomains or `/etc/hosts` hack
- Each app may need `credentials: "include"` for cross-origin requests

### 2. Proxy Apps Must Forward Set-Cookie
If an app proxies baseGeek (like geekSuite does), it MUST forward `Set-Cookie` headers:
```javascript
const setCookies = upstream.headers.getSetCookie?.() || [];
for (const cookie of setCookies) {
  headers.append("Set-Cookie", cookie);
}
```

### 3. CORS + Credentials
- `credentials: "include"` requires CORS to explicitly allow credentials
- Prefer same-origin API proxying for production SSO

### 4. Token Key Inconsistencies (Legacy)
Some apps still use old keys:
- NoteGeek: `auth_token`, `refresh_token`
- FlockGeek (old): `flockgeek_token`, `flockgeek_refresh_token`
- BuJoGeek (old): `token`

---

## 🧪 Testing SSO

### Manual Test
1. Log in at `basegeek.clintgeek.com`
2. Open DevTools → Application → Cookies
3. Verify `geek_token` exists with domain `.clintgeek.com`
4. Open another app (e.g., `fitnessgeek.clintgeek.com`) in new tab
5. Should be auto-logged-in (if app supports cookie-first)

### Console Test
```javascript
// Run on any *.clintgeek.com subdomain
const token = document.cookie.split(';')
  .find(c => c.trim().startsWith('geek_token='))
  ?.split('=')[1];
console.log('SSO Token:', token ? 'Present' : 'Missing');
```

---

## 🏚️ Architecture Debt

### Duplicated `UserSettings` schema (fitnessgeek)
The Mongoose `UserSettings` schema for fitnessgeek lives in **two parallel places** and the two copies have drifted:

- `apps/fitnessgeek/backend/src/models/UserSettings.js` — used by fitnessgeek's own REST routes
- `apps/basegeek/packages/api/src/graphql/fitnessgeek/models/UserSettings.js` — used by basegeek's GraphQL resolvers

Most of the frontend's "REST" calls actually get rewritten to GraphQL by `apps/fitnessgeek/frontend/src/services/apiService.js` and hit the **basegeek** copy. So if you add a field to the fitnessgeek-backend copy and forget the basegeek copy, Mongoose will silently strip it on `$set` (default strict mode) and the field never persists.

This bit us once already — keto fields (`nutrition_goal.mode`, `nutrition_goal.keto`) were added to fitnessgeek's copy but not basegeek's, so the keto wizard appeared to save but nothing stuck. Fix: keep the two schemas in sync, or consolidate to one source of truth (preferred).

---

## 📚 Reference Documentation

- `baseGeek/DOCS/SSO_IMPLEMENTATION.md` - Full SSO architecture
- `baseGeek/DOCS/AUTH_SYSTEM.md` - Auth system overview
- `baseGeek/DOCS/SSO_CLIENT_MIGRATION_PLAYBOOK.md` - Migration steps per app

---

*Last updated: December 2024*
