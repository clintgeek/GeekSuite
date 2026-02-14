# SSO Steps — Phase 4: Legacy Cleanup & Verification

> **Estimated time**: 3-5 hours  
> **Prerequisites**: Phases 0-3 complete. All apps running on `@geeksuite/auth`.  
> **Goal**: Remove all deprecated files, verify cross-app SSO, confirm no regressions

---

## 4.1 — Delete Deprecated ssoTokens.js Files

These files read `document.cookie` directly and fall back to localStorage. With HttpOnly cookies and the shared package, they are dead code.

**Before deleting each file**, confirm nothing imports it:
```bash
grep -r "ssoTokens" <app-directory>/  --include="*.js" --include="*.jsx" | grep -v node_modules
```

If the grep returns nothing, delete the file.

| File | App |
|------|-----|
| `baseGeek/packages/ui/src/utils/ssoTokens.js` | baseGeek |
| `fitnessGeek/frontend/src/utils/ssoTokens.js` | fitnessGeek |
| `BuJoGeek/client/src/utils/ssoTokens.js` | BuJoGeek |

- [ ] All three files deleted
- [ ] No remaining imports of `ssoTokens` anywhere

---

## 4.2 — Remove or Migrate baseGeek's sharedAuthStore

**File**: `baseGeek/packages/ui/src/store/sharedAuthStore.js`

This is a legacy Zustand store that persists tokens to localStorage under key `geek-shared-auth`. It also uses `window.postMessage` (not BroadcastChannel) for cross-tab sync.

**Options**:
1. **If baseGeek's frontend now uses `GeekAuthProvider`**: Delete `sharedAuthStore.js`, `SharedAuthProvider.jsx`, and `RequireAuth.jsx`. Update all imports.
2. **If baseGeek's frontend still needs its own auth flow** (because it IS the login page): Keep it but remove the `persist` middleware so tokens don't go to localStorage. The cookie is the source of truth.

**Check what imports it**:
```bash
grep -r "sharedAuthStore\|SharedAuthProvider\|RequireAuth" baseGeek/packages/ui/src/ --include="*.js" --include="*.jsx" | grep -v node_modules
```

Update or delete accordingly.

- [ ] `sharedAuthStore.js` either deleted or stripped of localStorage persistence
- [ ] No tokens stored in localStorage under `geek-shared-auth`

---

## 4.3 — Remove Local Auth Controllers

These apps had local login/register controllers that created users in their own databases with their own JWTs. If Phase 3 is complete, these should already be disconnected from routes.

| File | App | Action |
|------|-----|--------|
| `BuJoGeek/server/src/controllers/authController.js` | BuJoGeek | Delete if local auth routes removed |
| `NoteGeek/server/controllers/auth.js` | NoteGeek | Delete — local bcrypt auth |
| `NoteGeek/server/middleware/auth.js` | NoteGeek | Delete — old Bearer-only middleware |

**Before deleting**, confirm no route or other file imports them:
```bash
grep -r "controllers/authController\|controllers/auth" BuJoGeek/server/ --include="*.js" | grep -v node_modules
grep -r "controllers/auth\|middleware/auth" NoteGeek/server/ --include="*.js" | grep -v node_modules
```

- [ ] All listed files deleted
- [ ] No broken imports

---

## 4.4 — Remove photoGeek's Local Token Generation

**File**: `photoGeek/backend/src/middleware/auth.js`

If Phase 3 replaced this with the shared package, this file should already be gone. But if any remnant exists, ensure:

- [ ] The `generateToken(id)` function (creates 30-day local JWTs) is deleted
- [ ] No local `jwt.sign()` calls remain in photoGeek's codebase
- [ ] photoGeek no longer issues its own tokens — all tokens come from baseGeek via cookies

---

## 4.5 — Audit Service Worker Caching

Apps with service workers may cache `/api/me` responses. After logout, a cached 200 response would make the app think the user is still logged in.

**Apps with service workers**: BabelGeek, BuJoGeek, fitnessGeek, FlockGeek, NoteGeek

For each app, find the Workbox/SW configuration:
```bash
find <app-frontend-dir> -name "vite.config.*" -o -name "sw.js" -o -name "workbox-config.*" | grep -v node_modules
```

**In the Vite config** (if using `vite-plugin-pwa`), ensure these patterns are excluded from precaching and runtime caching:

```javascript
// In workbox config or vite-plugin-pwa options:
workbox: {
  navigateFallbackDenylist: [/^\/api\//],
  runtimeCaching: [
    // Do NOT add a rule that matches /api/me or /api/auth/*
  ]
}
```

**In raw `sw.js`** (if hand-written), ensure the fetch handler passes through API requests:
```javascript
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  // Never cache auth-related API calls
  if (url.pathname.startsWith('/api/')) return;
  // ... rest of caching logic
});
```

- [ ] BabelGeek SW reviewed — auth endpoints not cached
- [ ] BuJoGeek SW reviewed — auth endpoints not cached
- [ ] fitnessGeek SW reviewed — auth endpoints not cached
- [ ] FlockGeek SW reviewed — auth endpoints not cached
- [ ] NoteGeek SW reviewed — auth endpoints not cached

---

## 4.6 — Full Cross-App SSO Verification

This is the big test. Do this in a real browser (not curl/Postman) with DevTools open.

### Test 1: Fresh Login
1. Clear all cookies for `*.clintgeek.com`
2. Visit `https://fitnessgeek.clintgeek.com` (or any app)
3. Should see login/landing page (not authenticated)
4. Click login → redirected to `https://basegeek.clintgeek.com/login`
5. Enter credentials → login succeeds
6. Redirected back to fitnessGeek → should be authenticated
7. Check DevTools → Application → Cookies:
   - [ ] `geek_token` present, domain `.clintgeek.com`, expires in ~1 hour
   - [ ] `geek_refresh_token` present, domain `.clintgeek.com`, expires in ~30 days

### Test 2: Cross-App SSO
8. Without logging in again, open new tabs for:
   - [ ] `https://babelgeek.clintgeek.com` → authenticated
   - [ ] `https://bookgeek.clintgeek.com` → authenticated
   - [ ] `https://bujogeek.clintgeek.com` → authenticated
   - [ ] `https://flockgeek.clintgeek.com` → authenticated
   - [ ] `https://musicgeek.clintgeek.com` → authenticated
   - [ ] `https://notegeek.clintgeek.com` → authenticated
   - [ ] `https://photogeek.clintgeek.com` → authenticated
   - [ ] `https://geeksuite.clintgeek.com` → authenticated (shows app cards)

### Test 3: Silent Refresh
9. With an app open, wait 50+ minutes (or manually delete only the `geek_token` cookie in DevTools, keep `geek_refresh_token`)
10. The refresh timer should fire within ~1 minute
11. Check DevTools → Network → look for a POST to `/api/auth/refresh`
12. - [ ] New `geek_token` cookie appears
13. - [ ] User stays logged in — no redirect, no error

### Test 4: Cross-Tab Logout
14. Open 3 different apps in 3 tabs (e.g., fitnessGeek, BabelGeek, NoteGeek)
15. Click logout in one of them
16. - [ ] The tab you clicked logout in shows logged-out state
17. - [ ] The other two tabs also show logged-out state (BroadcastChannel)
18. - [ ] Check cookies: `geek_token` and `geek_refresh_token` are gone

### Test 5: Post-Logout Redirect
19. After logout, try to access a protected page in any app
20. - [ ] You're shown a login/landing page, not a broken error

### Test 6: Cache Clear Recovery
21. While logged in, clear all browser data (cookies, cache, storage)
22. Refresh any app
23. - [ ] You're shown a login/landing page cleanly — no stale cached auth state

### Test 7: App-Specific Data Survives
24. For apps with local user data (MusicGeek, NoteGeek, photoGeek):
25. - [ ] MusicGeek: User profile and practice data still loads
26. - [ ] NoteGeek: Existing notes still load for the user
27. - [ ] photoGeek: User's photos/challenges still load

---

## 4.7 — Final Grep Audit

Run these to catch any stragglers:

```bash
# Any remaining localStorage token usage in source files?
grep -r "localStorage.*token\|localStorage.*auth" --include="*.js" --include="*.jsx" \
  BabelGeek/ bookgeek/ BuJoGeek/ fitnessGeek/ FlockGeek/ MusicGeek/ NoteGeek/ photoGeek/ geekSuite/ \
  | grep -v node_modules | grep -v dist/ | grep -v ".vite/"

# Any remaining local jwt.sign calls (apps should not issue tokens)?
grep -r "jwt\.sign" --include="*.js" \
  BabelGeek/ bookgeek/ BuJoGeek/ fitnessGeek/ FlockGeek/ MusicGeek/ NoteGeek/ photoGeek/ geekSuite/ \
  | grep -v node_modules

# Any remaining old BroadcastChannel names?
grep -r "geek-auth" --include="*.js" --include="*.jsx" \
  BabelGeek/ bookgeek/ BuJoGeek/ fitnessGeek/ FlockGeek/ MusicGeek/ NoteGeek/ photoGeek/ geekSuite/ \
  | grep -v node_modules

# Any remaining GEEK_AUTH_STATE_CHANGE postMessage?
grep -r "GEEK_AUTH_STATE_CHANGE" --include="*.js" --include="*.jsx" \
  baseGeek/ | grep -v node_modules
```

- [ ] No localStorage token usage in app source files
- [ ] No `jwt.sign` calls in client apps (only in baseGeek)
- [ ] No `geek-auth` channel name (should all be `geeksuite-auth`)
- [ ] No `GEEK_AUTH_STATE_CHANGE` postMessage references (unless baseGeek frontend still needs it)

---

## 4.8 — Final Commit

```bash
git add -A
git commit -m "chore: SSO hardening Phase 4 - legacy cleanup and verification complete"
```

---

## Done?

Congratulations. The suite should now:

- **Login once** at baseGeek → authenticated everywhere
- **Silent refresh** every 50 minutes → no surprise logouts
- **Consistent logout** → BroadcastChannel syncs all tabs
- **One shared package** → no more duplicated auth code
- **HttpOnly cookies** → tokens never in JavaScript
- **Aligned TTLs** → cookie expiry matches JWT expiry

If any test in 4.6 failed, refer back to `THE_SSO_OVERVIEW.md` for the detailed architecture, or ask your team lead.

---

*"Clean auth is invisible auth. If the user notices the login system, we've already failed."*
