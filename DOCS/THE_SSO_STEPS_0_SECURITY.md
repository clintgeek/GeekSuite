# SSO Steps — Phase 0: Critical Security Fixes

> **Do these FIRST. They are production vulnerabilities.**  
> **Estimated time**: 1-2 hours  
> **Prerequisites**: Git branch `sso-hardening`, access to all app repos  
> **Reference**: `DOCS/THE_SSO_OVERVIEW.md` Phase 2 for full context

---

## 0.1 — Remove Hardcoded JWT Secret from fitnessGeek

**Why**: The full production JWT secret is hardcoded as a fallback on line 5. If this file leaks, every token across the entire platform can be forged.

**File**: `fitnessGeek/backend/src/middleware/auth.js` line 5

**Find this**:
```javascript
const JWT_SECRET = process.env.JWT_SECRET || 'REDACTED_JWT_SECRET';
```

**Replace with**:
```javascript
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('FATAL: JWT_SECRET environment variable is not set');
}
```

**Verify**:
- [ ] App starts normally when `JWT_SECRET` is set in `.env`
- [ ] App crashes with a clear error when `JWT_SECRET` is missing from `.env`
- [ ] The hardcoded secret string no longer appears anywhere in the file

---

## 0.2 — Protect the Password Reset Endpoint

**Why**: `POST /api/auth/reset-password` accepts any identifier + newPassword with **zero authentication**. Anyone can reset anyone's password right now.

**File**: `baseGeek/packages/api/src/routes/auth.js` — the `/reset-password` route (~line 350)

**Step A** — Add auth middleware to the route. Change:
```javascript
router.post('/reset-password', async (req, res) => {
```
To:
```javascript
router.post('/reset-password', authenticateToken, async (req, res) => {
```

**Step B** — Inside the handler, replace the identifier-based user lookup with:
```javascript
const user = await User.findById(req.user.id);
```
Remove the `identifier` variable and the `$or` query. A logged-in user should only reset **their own** password.

**Step C** — Remove the `if (!identifier)` check since `identifier` is no longer used. Keep the `if (!newPassword)` check.

**Verify**:
- [ ] `POST /api/auth/reset-password` without a token returns 401
- [ ] With a valid token, it resets the **authenticated user's** password only
- [ ] The `identifier` field in the request body is ignored

---

## 0.3 — Remove or Protect the Debug Endpoint

**Why**: `GET /api/auth/debug/user/:identifier` returns user metadata (ID, email, password existence, password length) for any user with **no authentication required**.

**File**: `baseGeek/packages/api/src/routes/auth.js` — the `/debug/user/:identifier` route (~line 310)

**Recommended**: Delete the entire route block. It's a debug tool that should never exist in production.

Find the block starting with:
```javascript
router.get('/debug/user/:identifier', async (req, res) => {
```
Delete everything from that line through its closing `});`.

**Alternative** (if needed for dev): Gate it:
```javascript
if (process.env.NODE_ENV !== 'production') {
  router.get('/debug/user/:identifier', authenticateToken, async (req, res) => {
    // ... existing handler ...
  });
}
```

**Verify**:
- [ ] `GET /api/auth/debug/user/anyusername` returns 404 (or 401 if gated)
- [ ] No user data is exposed to unauthenticated requests

---

## 0.4 — Add `photogeek` to VALID_APPS

**Why**: photoGeek is not whitelisted. Its frontend sends `app: 'fitnessgeek'` as a workaround, so photoGeek sessions masquerade as fitnessGeek sessions. Any app-specific logic based on the `app` claim will be wrong.

**You must update THREE files in baseGeek**:

### File 1: `baseGeek/packages/api/src/services/authService.js` line 9
Add `'photogeek'` to the array.

### File 2: `baseGeek/packages/api/src/middleware/auth.js` line 3
Add `'photogeek'` to the array.

### File 3: `baseGeek/packages/api/src/routes/auth.js` ~line 95
This is an inline array inside the login handler. Add `'photogeek'` to it.

### Then fix photoGeek's frontend:
**File**: `photoGeek/frontend/src/utils/authClient.js` line 50

Change:
```javascript
url.searchParams.set('app', import.meta.env.VITE_BASEGEEK_APP || 'fitnessgeek');
```
To:
```javascript
url.searchParams.set('app', import.meta.env.VITE_BASEGEEK_APP || 'photogeek');
```

### Then fix photoGeek's backend:
**File**: `photoGeek/backend/src/controllers/authController.js`

In the `register` function (~line 54) and the `login` function (~line 153), change:
```javascript
app: 'basegeek',
```
To:
```javascript
app: 'photogeek',
```

**Verify**:
- [ ] All three VALID_APPS arrays in baseGeek contain `'photogeek'`
- [ ] photoGeek frontend sends `app: 'photogeek'` in login redirect URL
- [ ] photoGeek backend sends `app: 'photogeek'` in login/register to baseGeek
- [ ] Login via photoGeek works end-to-end

---

## 0.5 — Remove Duplicate baseGeek Middleware

**Why**: `baseGeek/src/middleware/auth.js` is an old copy of `baseGeek/packages/api/src/middleware/auth.js` with a different (stale) VALID_APPS list.

**Step A** — Check what imports it:
```bash
grep -r "src/middleware/auth" baseGeek/ --include="*.js" --include="*.jsx" | grep -v node_modules | grep -v packages/api
```

**Step B** — If nothing imports it, delete `baseGeek/src/middleware/auth.js`.

**Step C** — If something imports it, update that import to use `packages/api/src/middleware/auth.js` instead, then delete the old file.

**Verify**:
- [ ] `baseGeek/src/middleware/auth.js` no longer exists
- [ ] baseGeek starts and all auth endpoints still work
- [ ] `grep -r "src/middleware/auth" baseGeek/ --include="*.js" | grep -v node_modules | grep -v packages/api` returns nothing

---

## Done with Phase 0?

Commit your work:
```bash
git add -A
git commit -m "fix(security): SSO hardening Phase 0 - critical security fixes"
```

Proceed to → `THE_SSO_STEPS_1_SHARED_PACKAGE.md`
