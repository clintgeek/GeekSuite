# SSO Steps — Phase 3: Per-App Migrations

> **Estimated time**: 1-2 hours per app (9 apps total)  
> **Prerequisites**: Phases 0, 1, and 2 complete. `@geeksuite/auth` package exists and is importable.  
> **Goal**: Replace each app's local auth code with the shared package

---

## Migration Order

Apps are ordered from lowest risk to highest risk. Do them in this order.

1. **geekSuite** — Already clean, just needs BroadcastChannel
2. **BabelGeek** — Well-migrated, swap to shared package
3. **FlockGeek** — Well-migrated, fix refresh route
4. **bookgeek** — Well-migrated, fix BroadcastChannel name
5. **MusicGeek** — Well-migrated, fix refresh + logout auth
6. **fitnessGeek** — Reference impl, swap to shared package
7. **BuJoGeek** — Remove legacy files + local auth controller
8. **photoGeek** — Remove hybrid middleware + local JWT generation
9. **NoteGeek** — Highest risk: remove dual auth system

---

## Universal Checklist (apply to EVERY app)

For each app, you will do the same steps. The app-specific notes below tell you what's **different** or **extra** for that app.

### Frontend Changes

- [ ] **A.** Add `@geeksuite/auth` as a dependency
- [ ] **B.** Replace local `authClient.js` imports with `import { getMe, loginRedirect, logout, onLogout } from '@geeksuite/auth/client'`
- [ ] **C.** Replace local `AuthContext.jsx` / `AuthProvider` with `GeekAuthProvider` and `useGeekAuth` from `@geeksuite/auth/client`
- [ ] **D.** Wrap the app root with `<GeekAuthProvider app="appname" baseGeekUrl="https://basegeek.clintgeek.com" apiBase="">`
- [ ] **E.** Replace all `useAuth()` calls with `useGeekAuth()` — check property names match (`user`, `loading`, `login`, `register`, `logout`, `isAuthenticated`)
- [ ] **F.** Delete the local `authClient.js`, `AuthContext.jsx`, and `authService.js` files

### Backend Changes

- [ ] **G.** Add `@geeksuite/auth` as a dependency
- [ ] **H.** Replace local auth middleware with `import { geekProxyAuth } from '@geeksuite/auth/server'` (or `geekLocalAuth` if the app wants local JWT verification)
- [ ] **I.** Replace local auth routes with `import { createAuthRoutes } from '@geeksuite/auth/server'`
- [ ] **J.** Mount the routes: `app.use('/api/auth', createAuthRoutes({ baseGeekUrl, app: 'appname' }))`
- [ ] **K.** Mount `/api/me` separately if needed (some apps have it at `/api/me`, others at `/api/auth/me`)
- [ ] **L.** Delete the local auth middleware, controller, and route files

### Service Worker (if present)

- [ ] **M.** Ensure `/api/me` and `/api/auth/*` are excluded from service worker caching. In Workbox configs, add to `navigateFallbackDenylist` or `runtimeCaching` exclusions.

### Verify

- [ ] **V1.** Login: Visit app → not logged in → click login → redirected to baseGeek → login → redirected back → authenticated
- [ ] **V2.** Refresh: Wait 50+ minutes (or manually clear the `geek_token` cookie and keep `geek_refresh_token`) → refresh timer fires → new access token cookie appears → user stays logged in
- [ ] **V3.** Logout: Click logout → user state clears → BroadcastChannel fires → other tabs of same app also show logged out
- [ ] **V4.** Cross-app SSO: While logged in, open a different GeekSuite app in a new tab → should be auto-authenticated
- [ ] **V5.** Cold start: Close all tabs, reopen app → if `geek_token` cookie is valid → auto-authenticated

---

## App-Specific Notes

### 1. geekSuite (Gateway)

**What's different**: This app runs on **Bun**, not Express. It has no local auth middleware or routes — the server is a single `index.js` file.

**Frontend** (steps A-F):
- The auth state is in `src/client/state/auth.jsx` — a simple inline context with `apiMe()`.
- Replace with `GeekAuthProvider`. The `apiBase` prop should be empty string `""` (same-origin).
- geekSuite currently has **no BroadcastChannel logout** — adding the shared package fixes this automatically.

**Backend** (steps G-L):
- The Bun server at `src/server/index.js` handles routes manually with `if/else` on `url.pathname`.
- You **cannot** use Express middleware here. Instead, extract the relevant logic from `@geeksuite/auth/server/cookieAuth.js` and use it as a plain function.
- Alternatively, keep the existing server code but ensure the `/api/auth/logout` route forwards cookies to baseGeek (it currently doesn't — check line 178, it sends an empty POST without the cookie header).

**Extra fix**: In the logout handler (~line 177), forward the cookie:
```javascript
if (url.pathname === "/api/auth/logout" && req.method === "POST") {
  const upstream = await fetch(`${BASEGEEK_URL}/api/auth/logout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: req.headers.get("cookie") || "",
    },
  });
  return relayUpstreamJson(upstream);
}
```

**Commit**: `feat(geekSuite): migrate to @geeksuite/auth`

---

### 2. BabelGeek

**What's different**: Already well-migrated. This is mostly a file swap.

**Frontend**:
- Replace `frontend/src/utils/authClient.js` with shared package import
- Replace `frontend/src/contexts/AuthContext.jsx` with `GeekAuthProvider`
- `frontend/src/services/authService.js` wraps authClient — delete it and update any imports

**Backend**:
- Replace `backend/src/middleware/authMiddleware.js` with `geekProxyAuth`
- Replace `backend/src/controllers/authController.js` + `backend/src/routes/auth.js` with `createAuthRoutes`
- The `/validate-sso` endpoint is app-specific — keep it if still needed, or remove if nothing calls it

**Commit**: `refactor(BabelGeek): migrate to @geeksuite/auth`

---

### 3. FlockGeek

**What's different**: The refresh route requires `refreshToken` in the request body — it doesn't read from cookies. The shared package route factory fixes this.

**Frontend**: Standard swap.

**Backend**:
- Replace `backend/src/middleware/authMiddleware.js` with `geekProxyAuth`
- Replace `backend/src/controllers/authController.js` + `backend/src/routes/auth.js` with `createAuthRoutes`
- FlockGeek has a `requireOwner` middleware — **keep this**. It's app-specific logic that sits on top of auth. Update it to work with the normalized `req.user` from the shared middleware.

**Commit**: `refactor(FlockGeek): migrate to @geeksuite/auth`

---

### 4. bookgeek

**What's different**: Uses a different BroadcastChannel name (`geek-auth`) and event type (`logout` lowercase). The shared package standardizes this.

**Frontend**:
- Replace `web/src/utils/authClient.js` with shared package import
- bookgeek has no separate AuthContext — it uses authClient directly in `App.jsx`. Wrap `App.jsx` with `GeekAuthProvider` and use `useGeekAuth()` inside.

**Backend**:
- Replace `api/src/middleware/auth.js` with `geekProxyAuth`
- Replace `api/src/routes/authRoutes.js` with `createAuthRoutes`
- bookgeek has its own manual cookie parser (`parseCookies`) — delete it, the shared package handles this

**Commit**: `refactor(bookgeek): migrate to @geeksuite/auth`

---

### 5. MusicGeek

**What's different**:
- Refresh route requires body token (shared package fixes this)
- `/auth/logout` requires authentication — it shouldn't. Remove `authenticate` middleware from the logout route.
- BroadcastChannel uses lowercase `logout` — shared package standardizes
- Has a local `UserProfile` model for music-specific data

**Frontend**: Standard swap. Note: AuthContext is in `frontend/src/context/` (singular), not `contexts/` (plural).

**Backend**:
- Replace `backend/src/middleware/auth.js` with `geekProxyAuth`
- Replace `backend/src/routes/auth.js` with `createAuthRoutes`
- **Keep** the UserProfile creation logic from `authController.js`. You'll need to add a hook or wrapper around the shared `/me` route that also fetches/creates the UserProfile. One approach:
  ```javascript
  // Mount shared auth routes
  app.use('/api/auth', createAuthRoutes({ baseGeekUrl, app: 'musicgeek' }));
  
  // Override /api/me to include UserProfile
  app.get('/api/me', geekProxyAuth({ baseGeekUrl }), async (req, res) => {
    const userId = req.user.id;
    let profile = await UserProfile.findOne({ userId });
    if (!profile) {
      profile = await UserProfile.create({
        userId,
        email: req.user.email,
        displayName: req.user.username || 'User',
      });
    }
    res.setHeader('Cache-Control', 'no-store');
    res.json({ success: true, data: { user: { ...req.user, profile } } });
  });
  ```

**Commit**: `refactor(MusicGeek): migrate to @geeksuite/auth`

---

### 6. fitnessGeek

**What's different**: This was the reference implementation for silent refresh. Now the shared package has that built in, so it's a swap.

**Frontend**:
- Replace `frontend/src/utils/authClient.js` (including `startSessionKeepAlive` / `stopSessionKeepAlive`) with shared package
- Replace `frontend/src/contexts/AuthContext.jsx` with `GeekAuthProvider`
- Delete `frontend/src/services/authService.js`
- Delete `frontend/src/hooks/useAuth.js` if it exists
- Check `frontend/src/contexts/AuthContextDef.jsx` — this may be the context definition; delete if replaced

**Backend**:
- fitnessGeek uses **local JWT verification** (shared `JWT_SECRET`, no network call to baseGeek). If you want to keep this (it's faster and works when baseGeek is down), use `geekLocalAuth(process.env.JWT_SECRET)` instead of `geekProxyAuth`. This is a valid choice.
- Replace `backend/src/routes/authRoutes.js` with `createAuthRoutes`
- fitnessGeek has special dev-mode cookie domain rewriting in its auth routes. The shared `createAuthRoutes` should handle this, or you can wrap it.

**Service Worker**: `frontend/public/sw.js` exists. Ensure `/api/me` and `/api/auth/*` are not cached.

**Commit**: `refactor(fitnessGeek): migrate to @geeksuite/auth`

---

### 7. BuJoGeek ⚠️ Medium Risk

**What's different**: Has legacy remnants that need cleanup.

**Frontend**:
- Standard swap of `client/src/utils/authClient.js` and `client/src/context/AuthContext.jsx`
- **Delete** `client/src/utils/ssoTokens.js` — this is a legacy file that reads `document.cookie` and falls back to localStorage. Check if anything imports it first:
  ```bash
  grep -r "ssoTokens" BuJoGeek/client/src/ --include="*.js" --include="*.jsx"
  ```
  If something imports it, update that import to use the shared package instead, then delete.

**Backend**:
- Replace `server/src/middleware/authMiddleware.js` with `geekProxyAuth`
- Replace `server/src/routes/authRoutes.js` with `createAuthRoutes`
- **Critical**: `server/src/controllers/authController.js` has a **local register/login** that creates users in BuJoGeek's own MongoDB with its own JWTs. This is **separate from the SSO proxy routes**. You need to determine:
  - Is the local User model still used for anything? Check what `server/src/models/userModel.js` looks like and what references it.
  - If nothing needs local users, delete the controller and model.
  - If BuJoGeek stores app-specific data per user (like MusicGeek does), keep the model but remove the local auth (register/login) functions.

**Verify extra**: Ensure no BuJoGeek features break that might depend on the local User model.

**Commit**: `refactor(BuJoGeek): migrate to @geeksuite/auth, remove legacy auth`

---

### 8. photoGeek ⚠️ Medium-High Risk

**What's different**: Hybrid auth middleware that tries local JWT first, then falls back to baseGeek. Local user creation on every login.

**Frontend**: Standard swap.

**Backend**:
- Replace `backend/src/middleware/auth.js` entirely with `geekProxyAuth`. **Remove** the local `jwt.verify` path and the `generateToken` function. photoGeek should not issue its own JWTs.
- Replace `backend/src/controllers/authController.js` + `backend/src/routes/auth.js` with `createAuthRoutes`
- **Keep** the local User model if photoGeek needs app-specific data (skill level, XP, etc.). Add a custom `/api/me` handler (like MusicGeek above) that enriches the SSO user with local profile data.
- The `password: 'sso_managed_password'` in local user records is a problem. After migration, no local password field should be needed. Update the User model to make `password` optional if possible.

**Commit**: `refactor(photoGeek): migrate to @geeksuite/auth, remove hybrid auth`

---

### 9. NoteGeek ⚠️ Highest Risk

**What's different**: NoteGeek has a **full dual auth system** — local bcrypt auth with 30-day tokens AND SSO cookie auth. Two separate middlewares. This needs careful surgery.

**Frontend**:
- Replace `client/src/utils/authClient.js` with shared package
- Replace `client/src/store/authStore.js` (Zustand) with `GeekAuthProvider`. NoteGeek uses Zustand instead of React Context — you'll need to update all components that call `useAuthStore()` to use `useGeekAuth()` instead. Search for all usages:
  ```bash
  grep -r "useAuthStore" NoteGeek/client/src/ --include="*.js" --include="*.jsx"
  ```

**Backend**:
- **Delete** `server/middleware/auth.js` (the old Bearer-only middleware). Check what uses it:
  ```bash
  grep -r "middleware/auth" NoteGeek/server/ --include="*.js" | grep -v node_modules | grep -v authMiddleware
  ```
  Update those imports to use the new middleware from `authMiddleware.js` or the shared package.

- **Delete** `server/controllers/auth.js` (the local login/register controller). The `/login` and `/register` routes should proxy to baseGeek, not create local users with bcrypt.

- **Replace** `server/middleware/authMiddleware.js` with `geekProxyAuth`.

- **Update** `server/routes/auth.js`:
  - Remove `import { registerUser, loginUser } from '../controllers/auth.js'`
  - Replace local `/login` and `/register` routes with proxy routes from `createAuthRoutes`
  - Keep the `/me` and `/logout` proxy routes (or replace with shared package versions)
  - The `/validate-sso` route does local JWT verify + local user creation. Replace with shared package or remove if nothing calls it.

- **Local User mapping**: NoteGeek maps BaseGeek users to local MongoDB users (the `protect` middleware in `authMiddleware.js` does a `User.findOne({ userId: ssoUserId })` lookup). This is needed because NoteGeek stores notes per local user `_id`. You'll need to keep this mapping as a **wrapper around** the shared auth middleware:
  ```javascript
  import { geekProxyAuth } from '@geeksuite/auth/server';
  
  const ssoAuth = geekProxyAuth({ baseGeekUrl });
  
  export const protect = (req, res, next) => {
    ssoAuth(req, res, async (err) => {
      if (err) return next(err);
      // Map SSO user to local NoteGeek user
      const ssoUserId = req.user.id;
      let localUser = await User.findOne({ userId: ssoUserId });
      if (!localUser) {
        localUser = await User.create({
          userId: ssoUserId,
          email: req.user.email,
        });
      }
      req.localUser = localUser;
      req.user = localUser; // NoteGeek routes expect req.user to be local
      next();
    });
  };
  ```

**Test extra carefully**: Notes must still load for existing users after migration. The local user `_id` used for note ownership must not change.

**Commit**: `refactor(NoteGeek): migrate to @geeksuite/auth, remove dual auth system`

---

## Done with Phase 3?

```bash
git add -A
git commit -m "refactor(all-apps): SSO hardening Phase 3 complete - all apps on @geeksuite/auth"
```

Proceed to → `THE_SSO_STEPS_4_CLEANUP_AND_VERIFY.md`
