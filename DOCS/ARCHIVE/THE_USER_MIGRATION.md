# @geeksuite/user — Integration Guide

> How we integrated the `@geeksuite/user` package into NoteGeek.
> Follow this pattern for every GeekSuite app.

---

## Prerequisites

- `@geeksuite/user` published to Verdaccio (`http://172.17.0.1:4873` from Docker, `localhost:4873` from host)
- The app already uses cookie-based SSO via baseGeek
- The app has a Zustand auth store (or equivalent) with `isAuthenticated` / `isLoading` state

---

## Step 0 — Add the dependency

### package.json

```json
"@geeksuite/user": "^0.1.0"
```

### Local dev: point npm at Verdaccio

If your local `.npmrc` doesn't already scope `@geeksuite`, add one in the app's client directory:

```
@geeksuite:registry=http://localhost:4873
```

Then run:

```bash
npm install
```

> **If Verdaccio isn't reachable locally** (e.g., ECONNREFUSED), skip the local install. Push your changes and run the install/build on the prod build server where Verdaccio is reachable. The Dockerfile step below still ensures the container resolves the package via Verdaccio when built on that host.

### Docker: point npm at Verdaccio from inside the container

In the frontend `Dockerfile`, **before** `npm install`.
This must run inside the frontend build stage before `npm install`, because the container does not inherit the host `.npmrc`.

```dockerfile
# Linux host:
RUN npm config set @geeksuite:registry http://172.17.0.1:4873

# macOS Docker Desktop (if applicable):
# RUN npm config set @geeksuite:registry http://host.docker.internal:4873
```

No Vite aliases needed. No `file:` dependencies. The package resolves like any normal npm dependency.

---

## Step 1 — Configure the package at startup

Create **`src/bootstrapUser.js`**:

```js
import axios from 'axios';
import { configure } from '@geeksuite/user';

const BASEGEEK_API_URL =
  import.meta.env.VITE_BASEGEEK_URL ||
  import.meta.env.VITE_BASE_GEEK_URL ||
  'https://basegeek.clintgeek.com';

const baseGeekApi = axios.create({
  baseURL: `${BASEGEEK_API_URL}/api`,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

export function configureUserPlatform() {
  configure(baseGeekApi);
}
```

**Key point:** This creates a *separate* axios instance that talks to baseGeek directly. Don't reuse the app's own API client.

> **Why a dedicated axios instance?**
>
> We intentionally use a dedicated axios instance for baseGeek.
> Do not reuse the app's API client because:
>
> - The app API often points at a different origin (`/api` of the app backend)
> - `@geeksuite/user` must always talk directly to baseGeek
> - Mixing interceptors can create circular auth refresh loops
>
> Think of this as the **"control plane" client** vs the app's **"data plane" client**.
>
> This saves a future debugging rabbit hole.

---

## Step 2 — Call configuration before React renders

In **`src/main.jsx`** (or your entry file), import and call before `createRoot`:

```js
import { configureUserPlatform } from './bootstrapUser';

configureUserPlatform();

createRoot(document.getElementById('root')).render(
  // ...
);
```

This must run before any `@geeksuite/user` hooks are used.

---

## Step 3 — Bootstrap user data when auth is ready

Create **`src/AppBootstrapper.jsx`**:

```jsx
import { useEffect } from 'react';
import { useUser } from '@geeksuite/user';
import useAuthStore from './store/authStore';       // adjust import to your auth store
import { registerReset } from './utils/resetUserStore';

export default function AppBootstrapper({ children }) {
  const { bootstrap, reset } = useUser();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const authReady = !isLoading;

  // Register reset so non-React code (authStore) can clear the user store
  useEffect(() => {
    registerReset(reset);
  }, [reset]);

  useEffect(() => {
    if (authReady && isAuthenticated) {
      bootstrap().catch(() => {
        // bootstrap failed — non-fatal, preferences just won't load
      });
    }
  }, [authReady, isAuthenticated, bootstrap]);

  return children;
}
```

Create **`src/utils/resetUserStore.js`** (bridge for non-React code):

```js
let _reset = null;

export function registerReset(fn) {
  _reset = fn;
}

export function reset() {
  if (_reset) _reset();
}
```

Wrap your root app in **`main.jsx`**:

```jsx
<ThemeModeProvider>
  <AppBootstrapper>
    <App />
  </AppBootstrapper>
</ThemeModeProvider>
```

---

## Runtime Lifecycle (mental model)

On every app load:

1. **App boots** → `configureUserPlatform()` sets up the baseGeek axios instance
2. **Auth store hydrates** session from cookies
3. When auth becomes **ready + authenticated**:
   - `bootstrap()` runs once
   - `GET /api/users/bootstrap` returns:
     - `identity`
     - `profile`
     - `global preferences`
     - `appPreferences`
   - Store becomes globally available via hooks
4. **Components render** with preferences already loaded

On logout:

1. App clears auth session
2. `resetUserStore()` clears cached user platform state
3. Next login → fresh `bootstrap()`

---

## Step 4 — Apply global theme preferences

In your **ThemeProvider / ThemeModeProvider**, import and use `usePreferences`:

```js
import { usePreferences } from '@geeksuite/user';

// Inside the provider component:
const { preferences, loaded } = usePreferences();

useEffect(() => {
  if (loaded && preferences?.theme) {
    const remote = preferences.theme;
    if (remote === 'light' || remote === 'dark') {
      setMode(remote);
    }
  }
}, [loaded, preferences]);
```

This syncs theme from baseGeek. Keep the existing localStorage fallback for the initial render before preferences load.

---

## Step 5 — Read app-specific preferences

In a component or router that wraps your editors/main content:

```js
import { useAppPreferences } from '@geeksuite/user';

const { preferences: appPrefs } = useAppPreferences('your-app-name');
const somePref = appPrefs?.yourPrefKey ?? defaultValue;
```

For NoteGeek, this was `editorFontSize` read in `NoteTypeRouter.jsx` and passed as a prop to editors.

---

## Step 6 — Save app-specific preferences

When the user changes a preference (e.g., in a Settings page):

```js
const { updateAppPreferences } = useAppPreferences('your-app-name');

await updateAppPreferences({ yourPrefKey: newValue });
```

**Do NOT store locally.** Preferences now live in baseGeek.

---

## Step 7 — Reset user store on logout

In your **auth store** (Zustand or otherwise), import the bridge:

```js
import { reset as resetUserStore } from '../utils/resetUserStore';
```

Call it in **every logout path**:
- The explicit logout action
- The BroadcastChannel / cross-tab logout handler

```js
logout: async () => {
    stopRefreshTimer();
    resetUserStore();          // ← clear @geeksuite/user state
    await logoutServer();
    set({ user: null, isAuthenticated: false, error: null });
},
```

If your Settings page also has a logout button and uses `useUser()` directly, call `reset()` there too.

---

## Files touched (NoteGeek reference)

### New files
| File | Purpose |
|------|---------|
| `src/bootstrapUser.js` | Configure `@geeksuite/user` with baseGeek axios instance |
| `src/AppBootstrapper.jsx` | Bootstrap user data on auth, register reset bridge |
| `src/utils/resetUserStore.js` | Non-React bridge for calling `reset()` from auth store |

### Modified files
| File | Change |
|------|--------|
| `package.json` | Added `"@geeksuite/user": "^0.1.0"` |
| `Dockerfile` | Added `npm config set @geeksuite:registry` before `npm install` |
| `src/main.jsx` | Import + call `configureUserPlatform()`, wrap `<App>` in `<AppBootstrapper>` |
| `src/theme/ThemeModeProvider.jsx` | Import `usePreferences`, sync theme mode from baseGeek |
| `src/store/authStore.js` | Import + call `resetUserStore()` on logout |
| `src/pages/Settings.jsx` | Added font size slider via `useAppPreferences`, logout calls `reset()` |
| `src/components/notes/NoteTypeRouter.jsx` | Read `editorFontSize` from `useAppPreferences('notegeek')` |
| `src/components/editors/MarkdownEditor.jsx` | Accept + use `fontSize` prop |
| `src/components/editors/CodeEditor.jsx` | Accept + use `fontSize` prop |
| `src/components/editors/RichTextEditor.jsx` | Accept + use `fontSize` prop |
| `src/components/Sidebar.jsx` | Added Settings nav entry |
| `src/App.jsx` | Added `/settings` route |

---

## Definition of Done

Integration is complete when:

- [ ] App calls `/api/users/bootstrap` after login
- [ ] Theme comes from baseGeek global preferences
- [ ] App-specific preferences load from baseGeek
- [ ] App-specific preferences save to baseGeek (no localStorage)
- [ ] User store resets on logout
- [ ] Docker build resolves `@geeksuite/user` from Verdaccio

### DevTools verification (Network tab)

After logging in, open DevTools → Network and confirm:

| Endpoint | When | Expected |
|----------|------|----------|
| `GET /api/users/bootstrap` | once after login | `200` |
| `PATCH /api/users/preferences/:app` | when saving an app setting | `200` |
| No repeated polling | idle state | quiet network |

> **If you see `bootstrap` firing repeatedly** → `bootstrap()` is running in a render loop.
> Check the `useEffect` dependency array in `AppBootstrapper` — `authReady` or `isAuthenticated` may be toggling.
> This warning will save hours someday.

---

## App-specific preference keys

| App | `appName` | Keys |
|-----|-----------|------|
| NoteGeek | `notegeek` | `editorFontSize` |
| BabelGeek | `babelgeek` | `nativeLanguage` |
| _next app_ | `_appname_` | _(add here)_ |

---

## Common pitfalls

1. **Don't use `file:` dependencies** — they break Docker builds. Use Verdaccio.
2. **Don't add Vite aliases** — the package resolves normally from `node_modules`.
3. **Create a separate axios instance** for baseGeek — don't reuse the app's API client.
4. **`useUser()` is a hook** — you can't call `reset()` from Zustand directly. Use the `resetUserStore` bridge pattern.
5. **Linux Docker uses `172.17.0.1`**, macOS Docker Desktop uses `host.docker.internal` for reaching Verdaccio.

---

## Copy/Paste Checklist for Next App

When integrating `@geeksuite/user` into a new GeekSuite app:

- [ ] Install `@geeksuite/user` (`"^0.1.0"` in `package.json`)
- [ ] Add Verdaccio registry config to `Dockerfile`
- [ ] Add `bootstrapUser.js`
- [ ] Call `configureUserPlatform()` in entry file
- [ ] Add `AppBootstrapper.jsx`
- [ ] Add `resetUserStore.js` bridge
- [ ] Hook theme to `usePreferences()`
- [ ] Move one real setting into `useAppPreferences(appName)`
- [ ] Wire `resetUserStore()` into all logout paths
- [ ] Verify DevTools checklist above

If you follow this list, the integration should take **~30 minutes**.
