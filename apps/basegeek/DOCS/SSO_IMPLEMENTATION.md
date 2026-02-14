# GeekSuite SSO Implementation Guide

## Overview

This document describes the Single Sign-On (SSO) implementation for GeekSuite applications. The SSO system uses **cookie-based authentication** on the parent domain (`.clintgeek.com`) to enable cross-subdomain authentication.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    basegeek.clintgeek.com                       │
│                                                                 │
│  ┌─────────────┐    Sets cookies on     ┌──────────────────┐   │
│  │ /api/auth/  │ ──────────────────────▶│ .clintgeek.com   │   │
│  │   login     │    domain              │   geek_token     │   │
│  │   register  │                        │   geek_refresh   │   │
│  │   refresh   │                        └──────────────────┘   │
│  └─────────────┘                                 │              │
└─────────────────────────────────────────────────│──────────────┘
                                                   │
                    Cookies readable by all subdomains
                                                   │
        ┌──────────────────────────────────────────┼───────────────┐
        │                                          │               │
        ▼                                          ▼               ▼
┌───────────────┐                    ┌───────────────┐   ┌───────────────┐
│ fitnessgeek.  │                    │ notegeek.     │   │ flockgeek.    │
│ clintgeek.com │                    │ clintgeek.com │   │ clintgeek.com │
│               │                    │               │   │               │
│ Reads cookie  │                    │ Reads cookie  │   │ Reads cookie  │
│ OR localStorage│                   │ OR localStorage│  │ OR localStorage│
└───────────────┘                    └───────────────┘   └───────────────┘
```

## How It Works

### 1. Login Flow

1. User logs in via any GeekSuite app
2. App calls `POST /api/auth/login` on baseGeek
3. baseGeek returns tokens in JSON response **AND** sets cookies:
   - `geek_token` - Access token (7 days)
   - `geek_refresh_token` - Refresh token (30 days)
4. Cookies are set with `Domain=.clintgeek.com` so all subdomains can read them

### 2. Token Reading (Dual-Source)

Apps can read tokens from **two sources** (in priority order):
1. **Cookie** (SSO) - `geek_token` cookie
2. **localStorage** (Legacy) - `geek_token` key

This enables gradual migration without breaking existing apps.

### 3. Logout Flow

1. App calls `POST /api/auth/logout` on baseGeek
2. baseGeek clears SSO cookies
3. App clears localStorage tokens

## Cookie Configuration

| Property | Value | Notes |
|----------|-------|-------|
| Domain | `.clintgeek.com` | Parent domain for all subdomains |
| Path | `/` | Available on all paths |
| HttpOnly | `false` | Must be readable by JavaScript |
| Secure | `true` (prod) | HTTPS only in production |
| SameSite | `lax` | Allows top-level navigation |
| MaxAge (token) | 7 days | Access token lifetime |
| MaxAge (refresh) | 30 days | Refresh token lifetime |

## Environment Variables

Add to baseGeek's `.env`:

```bash
# SSO Configuration (optional - defaults shown)
SSO_COOKIE_DOMAIN=.clintgeek.com
NODE_ENV=production  # Enables Secure flag
```

## Gradual Rollout Plan

### Phase 1: Backend Ready ✅
- [x] baseGeek sets SSO cookies on login/register/refresh
- [x] baseGeek has logout endpoint to clear cookies
- [x] JSON response unchanged (backward compatible)

### Phase 2: Utility Library ✅
- [x] Created `ssoTokens.js` utility for apps to use
- [x] Supports reading from cookie OR localStorage
- [x] Includes sync function for migration period

### Phase 3: App Migration (Per App)

For each app, update the auth logic to:
1. Import `ssoTokens.js` utility
2. Use `getToken()` instead of `localStorage.getItem('...')`
3. Call `syncSSOToLocalStorage()` on app init (optional, for compatibility)
4. Update logout to call baseGeek's `/api/auth/logout`

**Migration Order (suggested):**
1. FitnessGeek (already uses `geek_token` key)
2. GeekSuite Landing (already uses `geek_token` key)
3. StoryGeek (uses shared auth store)
4. BuJoGeek (needs key change: `token` → `geek_token`)
5. NoteGeek (needs key change: `auth_token` → `geek_token`)
6. FlockGeek (needs key change: `flockgeek_token` → `geek_token`)

## App-Specific Migration

### FitnessGeek

**Current state:** Already uses `geek_token` and `geek_refresh_token` keys.

**Migration steps:**
1. Copy `ssoTokens.js` to `frontend/src/utils/`
2. Update `authService.js` to use `getToken()` from ssoTokens
3. Add `syncSSOToLocalStorage()` call in `AuthContext.jsx` init

### BuJoGeek

**Current state:** Uses `token` key (no refresh token).

**Migration steps:**
1. Copy `ssoTokens.js` to `client/src/utils/`
2. Update `AuthContext.jsx`:
   - Change `localStorage.getItem('token')` → `getToken()`
   - Add refresh token support
3. Test thoroughly

### NoteGeek

**Current state:** Uses `auth_token` and `refresh_token` keys with Zustand.

**Migration steps:**
1. Copy `ssoTokens.js` to `client/src/utils/`
2. Update `authStore.js`:
   - Use `getToken()` in `hydrateUser()`
   - Update localStorage keys to `geek_token`
3. Keep SSO redirect flow as fallback

### FlockGeek

**Current state:** Uses `flockgeek_token` and `flockgeek_refresh_token` keys.

**Migration steps:**
1. Copy `ssoTokens.js` to `frontend/src/utils/`
2. Update `AuthContext.jsx`:
   - Change `TOKEN_STORAGE_KEY` to `geek_token`
   - Change `REFRESH_TOKEN_STORAGE_KEY` to `geek_refresh_token`
   - Use `getToken()` for initial load

## Testing SSO

### Manual Test

1. Open baseGeek and log in
2. Check browser DevTools → Application → Cookies
3. Verify `geek_token` cookie exists with domain `.clintgeek.com`
4. Navigate to another GeekSuite app (e.g., fitnessgeek.clintgeek.com)
5. Check if cookie is visible and user is authenticated

### Automated Test

```javascript
// In browser console on any *.clintgeek.com subdomain
const token = document.cookie.split(';')
  .find(c => c.trim().startsWith('geek_token='))
  ?.split('=')[1];

console.log('SSO Token:', token ? 'Present' : 'Missing');
```

## Troubleshooting

### Cookies Not Being Set

1. Check `NODE_ENV` - cookies need `Secure: true` in production
2. Verify HTTPS is being used
3. Check CORS configuration allows credentials

### Cookies Not Readable on Subdomain

1. Verify cookie domain is `.clintgeek.com` (with leading dot)
2. Check `SameSite` attribute is `lax` or `none`
3. Ensure subdomain is on same parent domain

### Token Expired But Cookie Exists

1. App should check token expiry before using
2. If expired, call `/api/auth/refresh` with refresh token
3. New tokens will update the cookies automatically

## Security Considerations

1. **HttpOnly: false** - Required for JS access, but increases XSS risk
   - Mitigate with CSP headers and input sanitization

2. **Token in Cookie** - Visible to JavaScript
   - Use short-lived access tokens (1 hour recommended)
   - Refresh tokens have longer life but require refresh endpoint

3. **Cross-Site Requests** - `SameSite: lax` prevents CSRF on POST
   - Login/logout are POST requests, protected by default

## Future Improvements

1. **HttpOnly Refresh Token** - Store refresh token as HttpOnly cookie
2. **Token Rotation** - Rotate refresh tokens on each use
3. **Session Revocation** - Add ability to revoke all sessions
4. **Activity Tracking** - Track last activity per app

---

*Last updated: December 2024*
