# DashGeek — Implementation Steps

> Step-by-step guide to build DashGeek from scratch.
> Written so that someone unfamiliar with the codebase can complete each step with minimal guidance.

**Prerequisites:**
- Node.js 20+ installed
- pnpm installed globally (`npm install -g pnpm`)
- Access to the GeekSuite monorepo at `/mnt/media/Projects/GeekSuite/`
- Access to the Docker directory at `/mnt/media/Docker/`
- Access to nginx configs at `/mnt/media/Docker/nginx/config/sites-available/`
- Familiarity with React, GraphQL, and Docker basics

**Conventions used in this doc:**
- `$GEEKSUITE` = `/mnt/media/Projects/GeekSuite`
- `$DOCKER` = `/mnt/media/Docker`
- All file paths are absolute unless stated otherwise
- Commands assume you are in the GeekSuite monorepo root unless stated otherwise

---

## Phase 1 — Project Scaffolding

### Step 1.1: Create the directory structure

DashGeek is a frontend-only app (no backend of its own). BaseGeek serves all data via GraphQL. However, we still need a minimal backend to serve the built frontend in production (static file server).

Create the following directory tree:

```
$GEEKSUITE/apps/dashgeek/
├── DOCS/                          # Already created (you're reading this)
├── frontend/
│   ├── src/
│   │   ├── components/            # Reusable UI components
│   │   ├── pages/                 # Page-level components (Dashboard, Search, Digest, etc.)
│   │   ├── graphql/               # GraphQL queries and mutations
│   │   ├── store/                 # Zustand stores (auth)
│   │   ├── theme/                 # MUI theme configuration
│   │   ├── utils/                 # Utility functions
│   │   ├── main.jsx               # Entry point
│   │   ├── App.jsx                # Root component with routing
│   │   ├── apolloClient.js        # Apollo Client setup
│   │   ├── bootstrapUser.js       # SSO/auth bootstrap
│   │   └── AppBootstrapper.jsx    # User session hydration wrapper
│   ├── public/                    # PWA icons, favicon
│   ├── .env                       # Default env vars
│   ├── .env.development           # Dev env vars
│   ├── .env.production            # Production env vars
│   ├── index.html                 # HTML entry point
│   ├── package.json               # Dependencies
│   └── vite.config.js             # Vite + PWA config
├── backend/
│   ├── server.js                  # Minimal Express static server
│   ├── package.json               # Backend dependencies
│   └── Dockerfile                 # Backend container build
├── Dockerfile                     # Multi-stage build (root level)
└── docker-compose.yml             # Local orchestration
```

Run these commands from `$GEEKSUITE/apps/dashgeek/`:

```bash
mkdir -p frontend/src/{components,pages,graphql,store,theme,utils}
mkdir -p frontend/public
mkdir -p backend
```

### Step 1.2: Create the frontend package.json

Create `$GEEKSUITE/apps/dashgeek/frontend/package.json`:

```json
{
  "name": "dashgeek-frontend",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "lint": "eslint ."
  },
  "dependencies": {
    "@apollo/client": "^3.14.0",
    "@emotion/react": "^11.14.0",
    "@emotion/styled": "^11.14.0",
    "@geeksuite/api-client": "workspace:*",
    "@geeksuite/auth": "workspace:*",
    "@geeksuite/ui": "workspace:*",
    "@geeksuite/user": "workspace:*",
    "@mui/icons-material": "^7.0.1",
    "@mui/material": "^7.0.1",
    "axios": "^1.8.4",
    "graphql": "^16.13.0",
    "jwt-decode": "^4.0.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.22.3",
    "zustand": "^5.0.3"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.4",
    "eslint": "^9.21.0",
    "vite": "^6.2.6",
    "vite-plugin-pwa": "^1.0.0"
  }
}
```

**Why these deps:**
- `@geeksuite/api-client` — shared Apollo Client factory with SSO auth link. Creates the client that talks to BaseGeek's `/graphql`.
- `@geeksuite/auth` — SSO helpers: `getMe()`, `loginRedirect()`, `logout()`, `startRefreshTimer()`.
- `@geeksuite/ui` — shared components like `LoginSplash`.
- `@geeksuite/user` — user context provider.
- `zustand` — lightweight state management for auth state.
- `@mui/material` + `@mui/icons-material` — UI framework (same as all GeekSuite apps).
- `vite-plugin-pwa` — service worker generation for offline/PWA support.

### Step 1.3: Create the Vite config

Create `$GEEKSUITE/apps/dashgeek/frontend/vite.config.js`:

```javascript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      injectRegister: false,
      registerType: 'autoUpdate',
      manifest: {
        name: 'DashGeek',
        short_name: 'DashGeek',
        description: 'Your unified dashboard for the GeekSuite ecosystem',
        start_url: '/',
        display: 'standalone',
        background_color: '#1a1a2e',
        theme_color: '#16213e',
        scope: '/',
        icons: [
          {
            src: '/icons/icon-192x192.svg',
            sizes: '192x192',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          },
          {
            src: '/icons/icon-512x512.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        cleanupOutdatedCaches: true,
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            // Auth endpoints must NEVER be cached
            urlPattern: ({ url }) =>
              url.pathname === '/api/me' ||
              url.pathname.startsWith('/api/auth/') ||
              url.pathname.startsWith('/api/users/me'),
            handler: 'NetworkOnly',
            options: { cacheName: 'auth-bypass' }
          },
          {
            // GraphQL requests — network first with short cache
            urlPattern: ({ url }) => url.pathname.startsWith('/graphql'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'dashgeek-graphql',
              networkTimeoutSeconds: 5,
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 5
              }
            }
          },
          {
            urlPattern: ({ request }) => request.destination === 'image',
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'dashgeek-images',
              expiration: {
                maxEntries: 60,
                maxAgeSeconds: 60 * 60 * 24 * 30
              }
            }
          },
          {
            urlPattern: ({ request }) => ['script', 'style', 'font'].includes(request.destination),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'dashgeek-assets',
              expiration: {
                maxEntries: 120,
                maxAgeSeconds: 60 * 60 * 24 * 7
              }
            }
          }
        ]
      }
    })
  ],
  resolve: {
    dedupe: ['react', 'react-dom', '@emotion/react', '@emotion/styled'],
    alias: {
      '@geeksuite/ui': path.resolve(__dirname, '../../../packages/ui/src/index.js'),
      'react': path.resolve(__dirname, './node_modules/react'),
      'react-dom': path.resolve(__dirname, './node_modules/react-dom'),
      '@emotion/react': path.resolve(__dirname, './node_modules/@emotion/react'),
      '@emotion/styled': path.resolve(__dirname, './node_modules/@emotion/styled')
    }
  },
  server: {
    port: 5174,
    proxy: {
      '/api': {
        target: 'http://localhost:4090',
        changeOrigin: true,
        secure: false,
      },
      '/graphql': {
        target: 'http://localhost:3002',
        changeOrigin: true,
        secure: false,
      }
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          mui: ['@mui/material', '@mui/icons-material'],
        }
      }
    }
  },
  publicDir: 'public',
})
```

**Key things to understand:**
- `server.port: 5174` — the Vite dev server port. Other apps use 5173, so we pick a different port to avoid conflicts if running multiple apps locally.
- `proxy /graphql → localhost:3002` — in development, Vite proxies GraphQL requests to BaseGeek's dev server (port 3002). In production, nginx handles this.
- `proxy /api → localhost:4090` — DashGeek's own minimal backend for serving the SPA. Port 4090 is unused by other apps.
- `resolve.alias` — the `@geeksuite/ui` alias points to the source code of the shared UI package so Vite can bundle it directly. The react/emotion aliases prevent duplicate React instances.
- `dedupe` — ensures only one copy of React and Emotion in the bundle (critical for hooks to work).

### Step 1.4: Create the environment files

**`$GEEKSUITE/apps/dashgeek/frontend/.env`** (default, used as fallback):
```
# GraphQL — proxied through nginx to BaseGeek in production
VITE_GRAPHQL_API_URL=/graphql

# BaseGeek SSO
VITE_BASE_GEEK_URL=https://basegeek.clintgeek.com
VITE_APP_NAME=dashgeek
```

**`$GEEKSUITE/apps/dashgeek/frontend/.env.development`**:
```
# Local dev — Vite proxy handles routing to BaseGeek dev server
VITE_GRAPHQL_API_URL=/graphql
```

**`$GEEKSUITE/apps/dashgeek/frontend/.env.production`**:
```
# Production — same-origin, nginx proxies /graphql to BaseGeek
VITE_GRAPHQL_API_URL=/graphql
VITE_BASE_GEEK_URL=https://basegeek.clintgeek.com
VITE_APP_NAME=dashgeek
```

**Why `/graphql` and not a full URL:**
All GeekSuite apps use relative URLs for GraphQL. In production, each app's nginx config has a `/graphql` location block that proxies requests to BaseGeek at `192.168.1.17:8987`. This avoids CORS issues because the browser sees the request going to the same origin (e.g., `dash.clintgeek.com/graphql`). The `VITE_GRAPHQL_API_URL` value gets baked into the JavaScript bundle at build time by Vite, so it cannot be changed after building.

### Step 1.5: Create index.html

Create `$GEEKSUITE/apps/dashgeek/frontend/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#16213e" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <title>DashGeek</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

### Step 1.6: Create the Apollo Client

Create `$GEEKSUITE/apps/dashgeek/frontend/src/apolloClient.js`:

```javascript
import { createApolloClient } from '@geeksuite/api-client';

export const apolloClient = createApolloClient('dashgeek');
```

**What this does:** `createApolloClient('dashgeek')` builds an Apollo Client instance with:
- An HTTP link pointing to `VITE_GRAPHQL_API_URL` (which is `/graphql`)
- An auth link that attaches `geek_token` from localStorage as a Bearer token
- An error link that catches 401/Unauthorized responses and redirects to BaseGeek login with `appName='dashgeek'` so BaseGeek knows where to redirect back after login
- An in-memory cache for query results

### Step 1.7: Create the auth bootstrap

Create `$GEEKSUITE/apps/dashgeek/frontend/src/bootstrapUser.js`:

```javascript
import axios from 'axios';
import { configure } from '@geeksuite/user';
import { setupAxiosInterceptors, loginRedirect } from '@geeksuite/auth';

const BASEGEEK_API_URL =
  import.meta.env.VITE_BASEGEEK_URL ||
  import.meta.env.VITE_BASE_GEEK_URL ||
  'https://basegeek.clintgeek.com';

const baseGeekApi = axios.create({
  baseURL: `${BASEGEEK_API_URL}/api`,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

setupAxiosInterceptors(baseGeekApi, () => {
  loginRedirect('dashgeek', window.location.href);
});

export function configureUserPlatform() {
  configure(baseGeekApi);
}
```

**What this does:** Creates an axios instance pointed at BaseGeek's REST API. The interceptors automatically handle token refresh and 401 redirects. `configure()` registers this axios instance with the `@geeksuite/user` package so it can fetch user preferences. This function must be called once at app startup, before React renders.

### Step 1.8: Create the AppBootstrapper

Create `$GEEKSUITE/apps/dashgeek/frontend/src/AppBootstrapper.jsx`:

```jsx
import { useEffect } from 'react';
import { useUser } from '@geeksuite/user';
import useAuthStore from './store/authStore';

export default function AppBootstrapper({ children }) {
  const { bootstrap } = useUser();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const authReady = !isLoading;

  useEffect(() => {
    if (authReady && isAuthenticated) {
      bootstrap().catch(() => {});
    }
  }, [authReady, isAuthenticated, bootstrap]);

  return children;
}
```

**What this does:** After auth is resolved, it calls `bootstrap()` to load user preferences from BaseGeek. This is a wrapper component that sits between the ApolloProvider and the App component in the React tree.

### Step 1.9: Create the auth store

Create `$GEEKSUITE/apps/dashgeek/frontend/src/store/authStore.js`:

```javascript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  getMe,
  loginRedirect,
  logout as logoutServer,
  onLogout as onLogoutBroadcast,
  startRefreshTimer,
  stopRefreshTimer
} from '@geeksuite/auth';

const useAuthStore = create(
  persist(
    (set, get) => {
      const syncUserFromSession = async () => {
        const currentUser = await getMe();
        if (currentUser) {
          set({ user: currentUser, isAuthenticated: true });
          return true;
        }
        set({ user: null, isAuthenticated: false });
        return false;
      };

      return {
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
        _logoutUnsubscribe: null,

        clearError: () => set({ error: null }),

        login: async () => {
          set({ error: null, isLoading: true });
          try {
            const restored = await syncUserFromSession();
            if (restored) return { authenticated: true };
          } catch (error) {
            console.warn('Cookie-first login attempt failed', error);
          } finally {
            set({ isLoading: false });
          }
          loginRedirect('dashgeek', window.location.href, 'login');
          return { redirected: true };
        },

        register: async () => {
          loginRedirect('dashgeek', window.location.href, 'register');
          return { redirected: true };
        },

        logout: async () => {
          stopRefreshTimer();
          await logoutServer();
          set({ user: null, isAuthenticated: false, error: null });
        },

        hydrateUser: async () => {
          let unsubscribe = get()._logoutUnsubscribe;
          if (!unsubscribe) {
            unsubscribe = onLogoutBroadcast(() => {
              stopRefreshTimer();
              set({ user: null, isAuthenticated: false, error: null });
            });
            set({ _logoutUnsubscribe: unsubscribe });
          }

          set({ isLoading: true, error: null });
          try {
            const success = await syncUserFromSession();
            if (success) {
              startRefreshTimer(() => {
                set({ user: null, isAuthenticated: false, error: null });
              });
            }
            return success;
          } catch (e) {
            set({
              user: null,
              isAuthenticated: false,
              error: e?.message || 'Failed to fetch session'
            });
            return false;
          } finally {
            set({ isLoading: false });
          }
        },
      };
    },
    {
      name: 'dashgeek-auth-storage',
      version: 1,
      partialize: () => ({}),
      migrate: () => ({}),
      merge: (_persistedState, currentState) => currentState,
    }
  )
);

export default useAuthStore;
```

**What this does:**
- `hydrateUser()` — Called once at app startup. Calls `getMe()` which hits BaseGeek's `/api/me` endpoint with the `geek_token` cookie. If the cookie is valid, the user is authenticated. Also starts a refresh timer that keeps the JWT alive.
- `login()` — Tries cookie-first auth, and if that fails, redirects to `basegeek.clintgeek.com/login?app=dashgeek&redirect=<current_url>`. After the user logs in on BaseGeek, they are redirected back.
- `logout()` — Clears the session cookie via BaseGeek's logout endpoint and resets local state.
- `onLogoutBroadcast()` — Listens for logout events from other GeekSuite tabs (BroadcastChannel API). If you log out of NoteGeek, DashGeek logs out too.
- The `persist` middleware with empty `partialize` means nothing is actually persisted to localStorage — auth state is always re-hydrated from the server. This prevents stale auth state.

### Step 1.10: Create the Login page

Create `$GEEKSUITE/apps/dashgeek/frontend/src/pages/Login.jsx`:

```jsx
import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../store/authStore';
import { LoginSplash } from '@geeksuite/ui';

function Login() {
  const navigate = useNavigate();
  const { login, isAuthenticated, isLoading } = useAuthStore();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      navigate('/', { replace: true });
    }
  }, [isLoading, isAuthenticated, navigate]);

  return (
    <LoginSplash
      appName="dash"
      appSuffix="geek"
      taglineLine1="See everything."
      taglineLine2="Control everything."
      description="Your unified command center for the GeekSuite ecosystem."
      features={['Cross-App Dashboard', 'Universal Search', 'AI Assistant', 'Weekly Digest']}
      onLogin={login}
      loading={isLoading}
    />
  );
}

export default Login;
```

**What this does:** Shows a branded login splash screen using the shared `LoginSplash` component. Clicking "Login" triggers SSO redirect to BaseGeek. If already authenticated, redirects to the dashboard.

### Step 1.11: Create the main entry point

Create `$GEEKSUITE/apps/dashgeek/frontend/src/main.jsx`:

```jsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ApolloProvider } from '@apollo/client'
import { apolloClient } from './apolloClient'
import { configureUserPlatform } from './bootstrapUser'
import App from './App.jsx'
import AppBootstrapper from './AppBootstrapper.jsx'

// Initialize SSO/auth platform (must happen before React renders)
configureUserPlatform();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ApolloProvider client={apolloClient}>
      <AppBootstrapper>
        <App />
      </AppBootstrapper>
    </ApolloProvider>
  </StrictMode>,
)
```

**Order matters:**
1. `configureUserPlatform()` runs first (sets up axios interceptors)
2. `ApolloProvider` wraps everything (provides GraphQL client)
3. `AppBootstrapper` loads user preferences after auth resolves
4. `App` renders the actual UI

### Step 1.12: Create the App component with routing

Create `$GEEKSUITE/apps/dashgeek/frontend/src/App.jsx`:

```jsx
import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { CircularProgress, Box, CssBaseline } from '@mui/material';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import useAuthStore from './store/authStore';
import Login from './pages/Login';

// Placeholder pages — replace with real implementations in Phase 2-5
const Dashboard = () => <Box p={3}>Dashboard — coming soon</Box>;
const Search = () => <Box p={3}>Search — coming soon</Box>;
const AIChat = () => <Box p={3}>AI Assistant — coming soon</Box>;
const Digest = () => <Box p={3}>Weekly Digest — coming soon</Box>;

const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: '#e94560' },
    background: {
      default: '#1a1a2e',
      paper: '#16213e',
    },
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
  },
});

function App() {
  const { hydrateUser, isAuthenticated, isLoading } = useAuthStore();
  const [isHydrating, setIsHydrating] = useState(true);

  useEffect(() => {
    const init = async () => {
      try {
        await hydrateUser();
      } catch {
        // Auth hydration failed — user will see login
      } finally {
        setIsHydrating(false);
      }
    };
    init();
  }, [hydrateUser]);

  const loading = isHydrating || isLoading;

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Router>
        {loading ? (
          <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
            <CircularProgress />
          </Box>
        ) : (
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={isAuthenticated ? <Dashboard /> : <Navigate to="/login" replace />} />
            <Route path="/search" element={isAuthenticated ? <Search /> : <Navigate to="/login" replace />} />
            <Route path="/ai" element={isAuthenticated ? <AIChat /> : <Navigate to="/login" replace />} />
            <Route path="/digest" element={isAuthenticated ? <Digest /> : <Navigate to="/login" replace />} />
            <Route path="*" element={<Navigate to={isAuthenticated ? "/" : "/login"} replace />} />
          </Routes>
        )}
      </Router>
    </ThemeProvider>
  );
}

export default App;
```

**Routes:**
| Path | Component | Description |
|------|-----------|-------------|
| `/` | Dashboard | Main dashboard with widgets (Phase 2) |
| `/search` | Search | Universal search (Phase 3) |
| `/ai` | AIChat | AI assistant chat panel (Phase 4) |
| `/digest` | Digest | Weekly digest view (Phase 5) |
| `/login` | Login | SSO login splash |

All routes except `/login` require authentication. Unauthenticated users are redirected to `/login`.

### Step 1.13: Create the minimal backend

DashGeek's backend is a minimal Express server. Its only job is to serve the built frontend files in production and proxy `/api/me` to BaseGeek for SSO.

Create `$GEEKSUITE/apps/dashgeek/backend/package.json`:

```json
{
  "name": "dashgeek-server",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js"
  },
  "dependencies": {
    "express": "^5.1.0",
    "cors": "^2.8.5",
    "helmet": "^7.1.0",
    "http-proxy-middleware": "^3.0.0",
    "morgan": "^1.10.0"
  },
  "devDependencies": {
    "nodemon": "^3.1.9"
  }
}
```

Create `$GEEKSUITE/apps/dashgeek/backend/server.js`:

```javascript
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import { fileURLToPath } from 'url';
import { createProxyMiddleware } from 'http-proxy-middleware';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 4090;
const BASEGEEK_URL = process.env.BASEGEEK_URL || 'https://basegeek.clintgeek.com';

app.use(morgan('combined'));
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));
app.use(cors({
  origin: [
    'https://dash.clintgeek.com',
    'https://dashgeek.clintgeek.com',
    'http://localhost:5174',
  ],
  credentials: true,
}));

// Proxy auth requests to BaseGeek
app.use('/api/auth', createProxyMiddleware({
  target: BASEGEEK_URL,
  changeOrigin: true,
  cookieDomainRewrite: { '*': '' },
}));

app.use('/api/me', createProxyMiddleware({
  target: BASEGEEK_URL,
  changeOrigin: true,
}));

app.use('/api/users/me', createProxyMiddleware({
  target: BASEGEEK_URL,
  changeOrigin: true,
}));

// Serve static frontend (built by Vite, copied into ./public by Dockerfile)
const publicPath = path.join(__dirname, 'public');
app.use(express.static(publicPath));

// SPA fallback — all unmatched routes serve index.html
app.get('*', (req, res) => {
  return res.sendFile(path.join(publicPath, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`DashGeek server running on port ${PORT}`);
});
```

**Why a backend at all?**
In production, the Docker container needs something to serve the static files and handle SPA routing (returning `index.html` for all non-file routes). The backend also proxies `/api/me` and `/api/auth/*` to BaseGeek so the SSO cookie check works from the same origin.

### Step 1.14: Create the Dockerfile

Create `$GEEKSUITE/apps/dashgeek/Dockerfile`:

```dockerfile
# ---------- BUILD STAGE ----------
FROM node:20-alpine AS build

WORKDIR /app
RUN apk add --no-cache python3 make g++

# Copy workspace files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages ./packages
COPY apps/dashgeek ./apps/dashgeek

# Use local Verdaccio registry for @geeksuite packages
RUN echo "@geeksuite:registry=http://192.168.1.17:4873" > .npmrc

# Install ALL workspace deps
RUN npm install -g pnpm
RUN pnpm install

# Build frontend
WORKDIR /app/apps/dashgeek/frontend
RUN pnpm run build

# ---------- PRODUCTION STAGE ----------
FROM node:20-alpine AS prod

WORKDIR /app
RUN npm install -g pnpm

# Copy workspace manifests + shared packages + backend
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages ./packages
COPY apps/dashgeek/backend ./apps/dashgeek/backend

# Use local Verdaccio registry for @geeksuite packages
RUN echo "@geeksuite:registry=http://192.168.1.17:4873" > .npmrc

# Install production deps
WORKDIR /app/apps/dashgeek/backend
RUN pnpm install --prod

# Copy built frontend into backend public folder
COPY --from=build /app/apps/dashgeek/frontend/dist ./public

EXPOSE 4090
CMD ["node", "server.js"]
```

**How this works:**
1. Build stage: Installs all deps (including devDeps for Vite), builds the React frontend into `frontend/dist/`.
2. Production stage: Copies only the backend code and installs production deps. Then copies the built frontend into `backend/public/`. The final image has no source code, no devDeps — just the Express server and the static build.

### Step 1.15: Create the Docker deployment config

Create `$DOCKER/dashgeek/docker-compose.yml`:

```yaml
services:
  dashgeek:
    image: geeksuite/dashgeek:latest
    container_name: dashgeek
    restart: unless-stopped
    env_file:
      - .env
    ports:
      - "4090:4090"
```

Create `$DOCKER/dashgeek/.env`:

```
PORT=4090
NODE_ENV=production
BASEGEEK_URL=https://basegeek.clintgeek.com
```

**Port 4090** is unused by other GeekSuite apps and services.

### Step 1.16: Create the nginx config

Create `$DOCKER/nginx/config/sites-available/dashGeek.conf`:

```nginx
map $http_upgrade $connection_upgrade {
	default upgrade;
	''	close;
}

server {
	listen 80;
	server_name dash.clintgeek.com dashgeek.clintgeek.com;

	location / {
	  return 301 https://$host$request_uri;
	}
}

server {
	listen 443 ssl;
	server_name dash.clintgeek.com dashgeek.clintgeek.com;

	ssl_protocols TLSv1.2;
	ssl_prefer_server_ciphers on;
	ssl_ciphers "EECDH+AESGCM:EDH+AESGCM:AES256+EECDH:AES256+EDH";
	ssl_ecdh_curve secp384r1;
	ssl_session_cache shared:SSL:10m;
	ssl_session_tickets off;
	ssl_stapling on;
	ssl_stapling_verify on;
	resolver 8.8.8.8 valid=300s;
	resolver_timeout 5s;
	add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload";
	add_header X-Frame-Options DENY;
	add_header X-Content-Type-Options nosniff;
	ssl_certificate /etc/nginx/certs/_.clintgeek.com_ssl_cert_combined.cer;
	ssl_certificate_key /etc/nginx/certs/_.clintgeek.com_private_key.key;
	ssl_dhparam /etc/nginx/certs/dhparams.pem;

	# Proxy GraphQL requests to BaseGeek's unified Apollo Server
	location /graphql {
		proxy_pass http://192.168.1.17:8987/graphql;
		proxy_set_header Host $host;
		proxy_set_header X-Real-IP $remote_addr;
		proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
		proxy_pass_header Authorization;
		proxy_set_header Authorization $http_authorization;
	}

	# Everything else goes to DashGeek's container
	location / {
		proxy_pass http://192.168.1.17:4090;
		proxy_http_version 1.1;

		proxy_set_header Upgrade $http_upgrade;
		proxy_set_header Connection $connection_upgrade;

		proxy_set_header Host $host;
		proxy_set_header X-Real-IP $remote_addr;
		proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
		proxy_set_header X-Forwarded-Proto $scheme;

		proxy_cache_bypass $http_upgrade;

		proxy_connect_timeout 60s;
		proxy_send_timeout 60s;
		proxy_read_timeout 60s;
	}
}
```

**Two server_names:** `dash.clintgeek.com` (the short pretty URL) and `dashgeek.clintgeek.com` (consistent with other apps). Both work.

**DNS:** You will need to create DNS A records for both `dash.clintgeek.com` and `dashgeek.clintgeek.com` pointing to `192.168.1.17` (or wherever your nginx lives). Without this, the domain won't resolve and nothing will work.

### Step 1.17: Register DashGeek in BaseGeek's CORS whitelist

Open `$GEEKSUITE/apps/basegeek/packages/api/src/server.js` and find the CORS origins array (around line 57). Add `'https://dash.clintgeek.com'` and `'https://dashgeek.clintgeek.com'` to the list.

**How to find it:** Search for `cors` or `origin` in server.js. You'll see an array of allowed origins like:
```javascript
origin: [
  'https://basegeek.clintgeek.com',
  'https://notegeek.clintgeek.com',
  'https://fitnessgeek.clintgeek.com',
  // ... other apps
]
```

Add the two new origins to this array.

### Step 1.18: Install dependencies and verify the app runs

From the monorepo root (`$GEEKSUITE`):

```bash
pnpm install
```

Then start the dev server:

```bash
cd apps/dashgeek/frontend
pnpm dev
```

Open `http://localhost:5174` in a browser. You should see a loading spinner, then either:
- The login splash (if not authenticated) — clicking Login redirects to BaseGeek
- A placeholder dashboard page (if you have a valid `geek_token` cookie from another GeekSuite app)

**Troubleshooting:**
- If you get module resolution errors for `@geeksuite/*` packages, make sure `pnpm install` was run from the monorepo root, not from the dashgeek directory.
- If the Apollo Client can't reach `/graphql`, make sure BaseGeek's dev server is running on port 3002: `cd apps/basegeek/packages/api && pnpm dev`
- If login redirect doesn't work, check that `VITE_BASE_GEEK_URL` is set in `.env`.

---

## Phase 2 — Dashboard Widgets & BaseGeek Resolvers

This phase builds the actual dashboard with live data from all apps. Each widget is a self-contained React component with its own GraphQL query.

### Step 2.1: Create the DashGeek GraphQL module in BaseGeek

This is where the cross-app resolvers live. These resolvers query each app's MongoDB database using the existing `getAppConnection()` function.

Create the directory:
```bash
mkdir -p $GEEKSUITE/apps/basegeek/packages/api/src/graphql/dashboard
```

Create `$GEEKSUITE/apps/basegeek/packages/api/src/graphql/dashboard/typeDefs.js`:

```javascript
import { gql } from 'graphql-tag';

export const typeDefs = gql`
  # ── Bujo Widget ──
  type DashBujoSummary {
    date: String!
    openTasks: Int!
    completedToday: Int!
    totalTasks: Int!
    upcomingEvents: [DashBujoEntry]
  }

  type DashBujoEntry {
    id: ID!
    content: String!
    type: String
    status: String
    date: String
  }

  # ── Notes Widget ──
  type DashRecentNote {
    id: ID!
    title: String!
    updatedAt: Date
    tags: [String]
    snippet: String
  }

  # ── Books Widget ──
  type DashBookProgress {
    id: ID!
    title: String!
    authors: [String]
    status: String
    currentPage: Int
    totalPages: Int
    percentComplete: Float
    coverUrl: String
  }

  # ── Fitness Widget ──
  type DashNutritionSummary {
    date: String!
    calories: Float
    protein: Float
    carbs: Float
    fat: Float
    calorieGoal: Float
    mealsLogged: Int
  }

  type DashWeightTrend {
    entries: [DashWeightEntry]
    direction: String
    changeFromFirst: Float
  }

  type DashWeightEntry {
    date: String!
    weight: Float!
  }

  # ── Flock Widget ──
  type DashFlockStatus {
    activeBirds: Int!
    totalBirds: Int!
    todayEggs: Int
    weekEggs: Int
    activePairings: Int
    activeHatches: Int
  }

  # ── Universal Search ──
  type DashSearchResult {
    id: ID!
    app: String!
    type: String!
    title: String!
    snippet: String
    url: String!
    updatedAt: Date
    score: Float
  }

  # ── Weekly Digest ──
  type DashWeeklyDigest {
    weekStart: String!
    weekEnd: String!
    bujo: DashBujoDigest
    books: DashBookDigest
    fitness: DashFitnessDigest
    flock: DashFlockDigest
    notes: DashNoteDigest
    aiSummary: String
  }

  type DashBujoDigest {
    tasksCompleted: Int
    tasksCreated: Int
    completionRate: Float
  }

  type DashBookDigest {
    booksFinished: Int
    pagesRead: Int
    currentlyReading: [String]
  }

  type DashFitnessDigest {
    avgCalories: Float
    avgProtein: Float
    weightChange: Float
    daysLogged: Int
  }

  type DashFlockDigest {
    totalEggs: Int
    avgEggsPerDay: Float
    hatchEvents: Int
    chicksHatched: Int
  }

  type DashNoteDigest {
    notesCreated: Int
    notesUpdated: Int
    topTags: [String]
  }

  # ── Queries ──
  extend type Query {
    dashBujoSummary(date: String): DashBujoSummary
    dashRecentNotes(limit: Int): [DashRecentNote]
    dashBookProgress: [DashBookProgress]
    dashNutritionSummary(date: String): DashNutritionSummary
    dashWeightTrend(days: Int): DashWeightTrend
    dashFlockStatus: DashFlockStatus
    dashSearch(query: String!, apps: [String], limit: Int): [DashSearchResult]
    dashWeeklyDigest(weekStart: String): DashWeeklyDigest
  }
`;
```

**Important:** We use `extend type Query` (not `type Query`) because the Query type is already defined by other app modules. The `mergeTypeDefs` function in BaseGeek's `graphql/index.js` merges all extensions together.

Create `$GEEKSUITE/apps/basegeek/packages/api/src/graphql/dashboard/resolvers.js`:

```javascript
import { getAppConnection } from '../shared/appConnections.js';

// Lazy-load models to avoid circular dependency issues.
// Each function gets the mongoose connection for the target app's database,
// then returns (or creates) the model on that connection.

// ── Model Accessors ──

function getBujoModels() {
  const conn = getAppConnection('bujogeek');
  // Match the schema from bujogeek's models
  if (!conn.models.Entry) {
    const mongoose = conn.base;
    const entrySchema = new mongoose.Schema({}, { strict: false, collection: 'entries' });
    conn.model('Entry', entrySchema);
  }
  return { Entry: conn.models.Entry };
}

function getNoteModels() {
  const conn = getAppConnection('notegeek');
  if (!conn.models.Note) {
    const mongoose = conn.base;
    const noteSchema = new mongoose.Schema({}, { strict: false, collection: 'notes' });
    conn.model('Note', noteSchema);
  }
  return { Note: conn.models.Note };
}

function getBookModels() {
  const conn = getAppConnection('bookgeek');
  if (!conn.models.Book) {
    const mongoose = conn.base;
    const bookSchema = new mongoose.Schema({}, { strict: false, collection: 'books' });
    conn.model('Book', bookSchema);
  }
  return { Book: conn.models.Book };
}

function getFitnessModels() {
  const conn = getAppConnection('fitnessgeek');
  if (!conn.models.FoodLog) {
    const mongoose = conn.base;
    const foodLogSchema = new mongoose.Schema({}, { strict: false, collection: 'foodlogs' });
    const weightSchema = new mongoose.Schema({}, { strict: false, collection: 'weights' });
    const userSettingsSchema = new mongoose.Schema({}, { strict: false, collection: 'usersettings' });
    conn.model('FoodLog', foodLogSchema);
    conn.model('Weight', weightSchema);
    conn.model('UserSettings', userSettingsSchema);
  }
  return {
    FoodLog: conn.models.FoodLog,
    Weight: conn.models.Weight,
    UserSettings: conn.models.UserSettings
  };
}

function getFlockModels() {
  const conn = getAppConnection('flockgeek');
  if (!conn.models.Bird) {
    const mongoose = conn.base;
    const birdSchema = new mongoose.Schema({}, { strict: false, collection: 'birds' });
    const eggSchema = new mongoose.Schema({}, { strict: false, collection: 'eggproductions' });
    const pairingSchema = new mongoose.Schema({}, { strict: false, collection: 'pairings' });
    const hatchSchema = new mongoose.Schema({}, { strict: false, collection: 'hatchevents' });
    conn.model('Bird', birdSchema);
    conn.model('EggProduction', eggSchema);
    conn.model('Pairing', pairingSchema);
    conn.model('HatchEvent', hatchSchema);
  }
  return {
    Bird: conn.models.Bird,
    EggProduction: conn.models.EggProduction,
    Pairing: conn.models.Pairing,
    HatchEvent: conn.models.HatchEvent
  };
}

// ── Helper ──

function startOfDay(dateStr) {
  const d = dateStr ? new Date(dateStr) : new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(dateStr) {
  const d = dateStr ? new Date(dateStr) : new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

// ── Resolvers ──

export const resolvers = {
  Query: {
    // ── Bujo Widget ──
    dashBujoSummary: async (_, { date }, context) => {
      if (!context.user) throw new Error('Unauthorized');
      const { Entry } = getBujoModels();
      const userId = context.user.id || context.user._id;
      const targetDate = date || new Date().toISOString().split('T')[0];
      const dayStart = startOfDay(targetDate);
      const dayEnd = endOfDay(targetDate);

      const entries = await Entry.find({
        userId,
        date: { $gte: dayStart, $lte: dayEnd }
      }).lean();

      const tasks = entries.filter(e => e.type === 'task');
      const completed = tasks.filter(t => t.status === 'done' || t.status === 'completed');

      return {
        date: targetDate,
        openTasks: tasks.length - completed.length,
        completedToday: completed.length,
        totalTasks: tasks.length,
        upcomingEvents: entries
          .filter(e => e.type === 'event')
          .slice(0, 5)
          .map(e => ({
            id: e._id.toString(),
            content: e.content,
            type: e.type,
            status: e.status,
            date: e.date?.toISOString()
          }))
      };
    },

    // ── Notes Widget ──
    dashRecentNotes: async (_, { limit = 5 }, context) => {
      if (!context.user) throw new Error('Unauthorized');
      const { Note } = getNoteModels();
      const userId = context.user.id || context.user._id;

      const notes = await Note.find({ userId })
        .sort({ updatedAt: -1 })
        .limit(limit)
        .lean();

      return notes.map(n => ({
        id: n._id.toString(),
        title: n.title || 'Untitled',
        updatedAt: n.updatedAt,
        tags: n.tags || [],
        snippet: n.content ? n.content.substring(0, 120) : null
      }));
    },

    // ── Books Widget ──
    dashBookProgress: async (_, __, context) => {
      if (!context.user) throw new Error('Unauthorized');
      const { Book } = getBookModels();
      const userId = context.user.id || context.user._id;

      const books = await Book.find({
        userId,
        status: { $in: ['reading', 'currently-reading', 'in-progress'] }
      }).lean();

      return books.map(b => ({
        id: b._id.toString(),
        title: b.title,
        authors: b.authors || [],
        status: b.status,
        currentPage: b.currentPage || 0,
        totalPages: b.totalPages || 0,
        percentComplete: b.totalPages ? Math.round((b.currentPage / b.totalPages) * 100) : 0,
        coverUrl: b.coverUrl || b.coverImage || null
      }));
    },

    // ── Fitness Nutrition Widget ──
    dashNutritionSummary: async (_, { date }, context) => {
      if (!context.user) throw new Error('Unauthorized');
      const { FoodLog, UserSettings } = getFitnessModels();
      const userId = context.user.id || context.user._id;
      const targetDate = date || new Date().toISOString().split('T')[0];
      const dayStart = startOfDay(targetDate);
      const dayEnd = endOfDay(targetDate);

      const logs = await FoodLog.find({
        user_id: userId,
        log_date: { $gte: dayStart, $lte: dayEnd }
      }).lean();

      let calories = 0, protein = 0, carbs = 0, fat = 0;
      for (const log of logs) {
        const n = log.nutrition || log.calculatedNutrition || {};
        const servings = log.servings || 1;
        calories += (n.calories_per_serving || n.calories || 0) * servings;
        protein += (n.protein_grams || n.protein || 0) * servings;
        carbs += (n.carbs_grams || n.carbs || 0) * servings;
        fat += (n.fat_grams || n.fat || 0) * servings;
      }

      // Try to get calorie goal from user settings
      let calorieGoal = null;
      try {
        const settings = await UserSettings.findOne({ user_id: userId }).lean();
        calorieGoal = settings?.nutrition_goal?.daily_calories || null;
      } catch { /* settings not found — fine */ }

      return {
        date: targetDate,
        calories: Math.round(calories),
        protein: Math.round(protein),
        carbs: Math.round(carbs),
        fat: Math.round(fat),
        calorieGoal,
        mealsLogged: logs.length
      };
    },

    // ── Fitness Weight Widget ──
    dashWeightTrend: async (_, { days = 7 }, context) => {
      if (!context.user) throw new Error('Unauthorized');
      const { Weight } = getFitnessModels();
      const userId = context.user.id || context.user._id;
      const since = new Date();
      since.setDate(since.getDate() - days);

      const weights = await Weight.find({
        userId,
        log_date: { $gte: since }
      }).sort({ log_date: 1 }).lean();

      const entries = weights.map(w => ({
        date: w.log_date?.toISOString()?.split('T')[0] || '',
        weight: w.weight_value
      }));

      let direction = 'stable';
      let changeFromFirst = 0;
      if (entries.length >= 2) {
        const first = entries[0].weight;
        const last = entries[entries.length - 1].weight;
        changeFromFirst = Math.round((last - first) * 10) / 10;
        if (changeFromFirst > 0.5) direction = 'up';
        else if (changeFromFirst < -0.5) direction = 'down';
      }

      return { entries, direction, changeFromFirst };
    },

    // ── Flock Widget ──
    dashFlockStatus: async (_, __, context) => {
      if (!context.user) throw new Error('Unauthorized');
      const { Bird, EggProduction, Pairing, HatchEvent } = getFlockModels();
      const userId = context.user.id || context.user._id;

      const todayStart = startOfDay();
      const todayEnd = endOfDay();
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);

      const [activeBirds, totalBirds, todayEggs, weekEggs, activePairings, activeHatches] =
        await Promise.all([
          Bird.countDocuments({ ownerId: userId, status: { $in: ['active', 'alive', null] } }),
          Bird.countDocuments({ ownerId: userId }),
          EggProduction.aggregate([
            { $match: { ownerId: userId, date: { $gte: todayStart, $lte: todayEnd } } },
            { $group: { _id: null, total: { $sum: '$eggsCount' } } }
          ]).then(r => r[0]?.total || 0),
          EggProduction.aggregate([
            { $match: { ownerId: userId, date: { $gte: weekAgo } } },
            { $group: { _id: null, total: { $sum: '$eggsCount' } } }
          ]).then(r => r[0]?.total || 0),
          Pairing.countDocuments({ ownerId: userId, active: true }),
          HatchEvent.countDocuments({ ownerId: userId, hatchDate: { $gte: new Date() } })
        ]);

      return { activeBirds, totalBirds, todayEggs, weekEggs, activePairings, activeHatches };
    },

    // ── Universal Search (Phase 3) ──
    dashSearch: async (_, { query, apps, limit = 20 }, context) => {
      if (!context.user) throw new Error('Unauthorized');
      // Implementation in Phase 3 — Step 3.2
      return [];
    },

    // ── Weekly Digest (Phase 5) ──
    dashWeeklyDigest: async (_, { weekStart }, context) => {
      if (!context.user) throw new Error('Unauthorized');
      // Implementation in Phase 5 — Step 5.2
      return {
        weekStart: weekStart || '',
        weekEnd: '',
        bujo: null,
        books: null,
        fitness: null,
        flock: null,
        notes: null,
        aiSummary: null
      };
    },
  }
};
```

**Important notes for the intern:**
- `getAppConnection('appname')` returns a mongoose connection to that app's MongoDB database. It's defined in `$GEEKSUITE/apps/basegeek/packages/api/src/graphql/shared/appConnections.js`. The function handles connection pooling automatically — you don't need to manage connections yourself.
- We use `{ strict: false }` on schemas because we're reading from databases owned by other apps. Their schemas may evolve, and we don't want strict mode to silently drop fields we didn't define.
- `context.user` is populated by BaseGeek's auth middleware. It contains `{ id, email, name }` from the JWT. Every resolver must check for it.
- The `collection` option in each schema tells mongoose which MongoDB collection to query. Without it, mongoose pluralizes the model name, which may not match the actual collection name.

### Step 2.2: Register the dashboard module in BaseGeek's GraphQL index

Open `$GEEKSUITE/apps/basegeek/packages/api/src/graphql/index.js`.

Add the import at the top, alongside the other app imports:
```javascript
import { typeDefs as dashTypeDefs } from './dashboard/typeDefs.js';
import { resolvers as dashResolvers } from './dashboard/resolvers.js';
```

Add `dashTypeDefs` to the `mergeTypeDefs` array and `dashResolvers` to the `mergeResolvers` array:
```javascript
export const typeDefs = mergeTypeDefs([
  sharedTypeDefs,
  basegeekTypeDefs,
  noteTypeDefs,
  bujoTypeDefs,
  flockTypeDefs,
  fitnessTypeDefs,
  bookTypeDefs,
  dashTypeDefs,        // ← add this
]);

export const resolvers = mergeResolvers([
  dateScalarResolver,
  basegeekResolvers,
  noteResolvers,
  bujoResolvers,
  flockResolvers,
  fitnessResolvers,
  bookResolvers,
  dashResolvers,       // ← add this
]);
```

**Verify it works:** Restart BaseGeek's dev server and run a test query:
```bash
curl -s http://localhost:3002/graphql \
  -H 'Content-Type: application/json' \
  -d '{"query":"{ dashFlockStatus { activeBirds totalBirds } }"}'
```

If you get `"Unauthorized"`, the schema is wired correctly (auth is required). If you get `"Cannot query field"`, the module is not registered — check the import paths.

### Step 2.3: Create the frontend GraphQL queries

Create `$GEEKSUITE/apps/dashgeek/frontend/src/graphql/queries.js`:

```javascript
import { gql } from '@apollo/client';

export const DASH_BUJO_SUMMARY = gql`
  query DashBujoSummary($date: String) {
    dashBujoSummary(date: $date) {
      date
      openTasks
      completedToday
      totalTasks
      upcomingEvents {
        id
        content
        type
        status
        date
      }
    }
  }
`;

export const DASH_RECENT_NOTES = gql`
  query DashRecentNotes($limit: Int) {
    dashRecentNotes(limit: $limit) {
      id
      title
      updatedAt
      tags
      snippet
    }
  }
`;

export const DASH_BOOK_PROGRESS = gql`
  query DashBookProgress {
    dashBookProgress {
      id
      title
      authors
      status
      currentPage
      totalPages
      percentComplete
      coverUrl
    }
  }
`;

export const DASH_NUTRITION_SUMMARY = gql`
  query DashNutritionSummary($date: String) {
    dashNutritionSummary(date: $date) {
      date
      calories
      protein
      carbs
      fat
      calorieGoal
      mealsLogged
    }
  }
`;

export const DASH_WEIGHT_TREND = gql`
  query DashWeightTrend($days: Int) {
    dashWeightTrend(days: $days) {
      entries {
        date
        weight
      }
      direction
      changeFromFirst
    }
  }
`;

export const DASH_FLOCK_STATUS = gql`
  query DashFlockStatus {
    dashFlockStatus {
      activeBirds
      totalBirds
      todayEggs
      weekEggs
      activePairings
      activeHatches
    }
  }
`;

export const DASH_SEARCH = gql`
  query DashSearch($query: String!, $apps: [String], $limit: Int) {
    dashSearch(query: $query, apps: $apps, limit: $limit) {
      id
      app
      type
      title
      snippet
      url
      updatedAt
      score
    }
  }
`;

export const DASH_WEEKLY_DIGEST = gql`
  query DashWeeklyDigest($weekStart: String) {
    dashWeeklyDigest(weekStart: $weekStart) {
      weekStart
      weekEnd
      bujo { tasksCompleted tasksCreated completionRate }
      books { booksFinished pagesRead currentlyReading }
      fitness { avgCalories avgProtein weightChange daysLogged }
      flock { totalEggs avgEggsPerDay hatchEvents chicksHatched }
      notes { notesCreated notesUpdated topTags }
      aiSummary
    }
  }
`;
```

### Step 2.4: Build the widget components

Each widget follows the same pattern. Here's the template — repeat for each widget.

Create `$GEEKSUITE/apps/dashgeek/frontend/src/components/widgets/` directory.

**Widget template** (example: `BujoWidget.jsx`):

```jsx
import React from 'react';
import { useQuery } from '@apollo/client';
import { Card, CardContent, Typography, Box, Skeleton, Chip } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { DASH_BUJO_SUMMARY } from '../../graphql/queries';

export default function BujoWidget() {
  const today = new Date().toISOString().split('T')[0];
  const { data, loading, error } = useQuery(DASH_BUJO_SUMMARY, {
    variables: { date: today },
    fetchPolicy: 'cache-and-network',
  });

  if (loading && !data) {
    return (
      <Card>
        <CardContent>
          <Skeleton variant="text" width="60%" />
          <Skeleton variant="rectangular" height={80} sx={{ mt: 1 }} />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent>
          <Typography color="error">BujoGeek unavailable</Typography>
        </CardContent>
      </Card>
    );
  }

  const summary = data?.dashBujoSummary;

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Today's Tasks
        </Typography>
        <Box display="flex" gap={2} alignItems="center">
          <Chip
            icon={<CheckCircleIcon />}
            label={`${summary?.completedToday || 0} done`}
            color="success"
            size="small"
          />
          <Chip
            label={`${summary?.openTasks || 0} open`}
            color="warning"
            size="small"
          />
        </Box>
      </CardContent>
    </Card>
  );
}
```

Create one widget file for each data source:

| File | Query | What it shows |
|------|-------|---------------|
| `BujoWidget.jsx` | `DASH_BUJO_SUMMARY` | Open/completed tasks, upcoming events |
| `NotesWidget.jsx` | `DASH_RECENT_NOTES` | Last 5 updated notes with tags |
| `BooksWidget.jsx` | `DASH_BOOK_PROGRESS` | Currently reading books with progress bars |
| `NutritionWidget.jsx` | `DASH_NUTRITION_SUMMARY` | Today's calories/macros vs goals |
| `WeightWidget.jsx` | `DASH_WEIGHT_TREND` | Weight trend chart (last 7 days) |
| `FlockWidget.jsx` | `DASH_FLOCK_STATUS` | Active birds, egg count, pairings |

**Key patterns every widget must follow:**
1. Use `fetchPolicy: 'cache-and-network'` so the widget shows cached data instantly while refreshing in the background.
2. Show a `<Skeleton>` during initial load (not a spinner — skeletons feel faster).
3. Show a graceful error state — "AppName unavailable" — not a crash. One broken app must not break the whole dashboard.
4. Each widget makes its own query. Do not combine all widgets into one giant query — independent queries load and fail independently.

### Step 2.5: Build the Dashboard page

Replace the placeholder `Dashboard` in `App.jsx` with a real component.

Create `$GEEKSUITE/apps/dashgeek/frontend/src/pages/Dashboard.jsx`:

```jsx
import React from 'react';
import { Box, Grid, Typography, AppBar, Toolbar, IconButton } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import LogoutIcon from '@mui/icons-material/Logout';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../store/authStore';

import BujoWidget from '../components/widgets/BujoWidget';
import NotesWidget from '../components/widgets/NotesWidget';
import BooksWidget from '../components/widgets/BooksWidget';
import NutritionWidget from '../components/widgets/NutritionWidget';
import WeightWidget from '../components/widgets/WeightWidget';
import FlockWidget from '../components/widgets/FlockWidget';

export default function Dashboard() {
  const navigate = useNavigate();
  const { logout, user } = useAuthStore();

  return (
    <Box sx={{ flexGrow: 1 }}>
      <AppBar position="static" color="transparent" elevation={0}>
        <Toolbar>
          <Typography variant="h5" sx={{ flexGrow: 1, fontWeight: 700 }}>
            DashGeek
          </Typography>
          <IconButton onClick={() => navigate('/search')} color="inherit">
            <SearchIcon />
          </IconButton>
          <IconButton onClick={() => navigate('/ai')} color="inherit">
            <SmartToyIcon />
          </IconButton>
          <IconButton onClick={logout} color="inherit">
            <LogoutIcon />
          </IconButton>
        </Toolbar>
      </AppBar>

      <Box sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom sx={{ opacity: 0.7 }}>
          Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, {user?.name?.split(' ')[0] || 'there'}
        </Typography>

        <Grid container spacing={3}>
          <Grid item xs={12} md={6} lg={4}>
            <BujoWidget />
          </Grid>
          <Grid item xs={12} md={6} lg={4}>
            <NutritionWidget />
          </Grid>
          <Grid item xs={12} md={6} lg={4}>
            <FlockWidget />
          </Grid>
          <Grid item xs={12} md={6} lg={4}>
            <NotesWidget />
          </Grid>
          <Grid item xs={12} md={6} lg={4}>
            <BooksWidget />
          </Grid>
          <Grid item xs={12} md={6} lg={4}>
            <WeightWidget />
          </Grid>
        </Grid>
      </Box>
    </Box>
  );
}
```

### Step 2.6: Verify Phase 2

1. Start BaseGeek dev server: `cd $GEEKSUITE/apps/basegeek/packages/api && pnpm dev`
2. Start DashGeek frontend: `cd $GEEKSUITE/apps/dashgeek/frontend && pnpm dev`
3. Open `http://localhost:5174`
4. Log in via BaseGeek SSO
5. Verify each widget loads data (or shows "unavailable" gracefully if the app has no data)

**Common issues:**
- Widget shows "Unauthorized" — check that the `geek_token` cookie is being sent with GraphQL requests. Open browser DevTools → Network → find the `/graphql` request → check the Authorization header.
- Widget shows "unavailable" for all apps — BaseGeek may not be running, or the `/graphql` proxy isn't working. Check the Vite dev server console for proxy errors.
- Collection names don't match — if a resolver returns empty data when you know data exists, the `collection` name in the model schema might be wrong. Check the actual collection names in MongoDB using `mongosh` or Compass.

---

## Phase 3 — Universal Search

### Step 3.1: Build the search UI

Create `$GEEKSUITE/apps/dashgeek/frontend/src/pages/Search.jsx`:

Build a page with:
- A text input at the top (auto-focused on mount)
- Optional filter chips for each app (NoteGeek, BujoGeek, BookGeek, etc.)
- Results list grouped by app, each result showing: app icon, type badge, title, snippet, and a link
- Debounce the search input (300ms) so we don't fire a query on every keystroke

Use the `DASH_SEARCH` query from `queries.js`. Pass the input value as `query`, selected app filters as `apps`, and 20 as `limit`.

Each result's `url` field should be a full URL to the item in its native app (e.g., `https://notegeek.clintgeek.com/notes/abc123`). Clicking a result opens the URL in a new tab.

### Step 3.2: Implement the search resolver

Open `$GEEKSUITE/apps/basegeek/packages/api/src/graphql/dashboard/resolvers.js`.

Replace the placeholder `dashSearch` resolver with a real implementation. The resolver should:

1. Check which apps to search (use `apps` argument, or search all if not specified)
2. For each app, run a text search query against the app's database:
   - **NoteGeek:** Search `notes` collection — match `title` or `content` fields using case-insensitive regex
   - **BujoGeek:** Search `entries` collection — match `content` field
   - **BookGeek:** Search `books` collection — match `title` or `authors` fields
   - **FitnessGeek:** Search `foods` collection — match `name` field
   - **FlockGeek:** Search `birds` collection — match `name` or `tagId` fields; also search `groups` for `name`
3. For each match, create a `DashSearchResult` object with:
   - `id`: the document's `_id`
   - `app`: which app it came from (e.g., `"notegeek"`)
   - `type`: what kind of item (e.g., `"note"`, `"task"`, `"book"`, `"bird"`)
   - `title`: the item's display name
   - `snippet`: a preview of the content (first 120 characters)
   - `url`: deep link to the item in its native app
   - `score`: relevance score (exact title match = 100, content match = 50, etc.)
4. Merge results from all apps, sort by score descending, and return up to `limit` results

**URL format for deep links:**

| App | URL Pattern |
|-----|-------------|
| NoteGeek | `https://notegeek.clintgeek.com/notes/{id}` |
| BujoGeek | `https://bujogeek.clintgeek.com/` |
| BookGeek | `https://bookgeek.clintgeek.com/books/{id}` |
| FitnessGeek | `https://fitnessgeek.clintgeek.com/` |
| FlockGeek | `https://flockgeek.clintgeek.com/birds/{id}` |

Verify by URL pattern by checking the actual routing in each app's `App.jsx` — the patterns above are approximations and may differ.

### Step 3.3: Verify Phase 3

1. Navigate to `/search` in DashGeek
2. Type a search term that exists in at least one app (e.g., a note title, a bird name, a book title)
3. Verify results appear grouped by app
4. Click a result — it should open in the correct app in a new tab

---

## Phase 4 — AI Assistant

### Step 4.1: Build the chat UI

Create `$GEEKSUITE/apps/dashgeek/frontend/src/pages/AIChat.jsx`:

Build a chat interface with:
- A scrollable message list showing user and assistant messages
- A text input at the bottom with a send button
- Messages stored in React state (and optionally `localStorage` for persistence across page loads)
- Loading indicator while waiting for AI response

The chat sends the full conversation history (last 10 messages) with each request.

### Step 4.2: Create the AI chat resolver

Add a new query to the dashboard typeDefs:

```graphql
input DashAIChatInput {
  role: String!
  content: String!
}

extend type Query {
  dashAIChat(messages: [DashAIChatInput!]!, gatherContext: Boolean): DashAIChatResponse
}

type DashAIChatResponse {
  content: String!
  sources: [DashAISource]
}

type DashAISource {
  app: String!
  type: String!
  title: String!
}
```

The resolver should:

1. Parse the user's latest message to determine which apps are relevant (simple keyword matching is fine for v1):
   - "weight", "calories", "food", "meal", "protein" → FitnessGeek
   - "task", "todo", "journal", "bujo" → BujoGeek
   - "note", "notes" → NoteGeek
   - "book", "reading" → BookGeek
   - "chicken", "egg", "bird", "flock", "hatch" → FlockGeek
   - If no keywords match, or the question is general ("how's my week"), gather context from all apps

2. For each relevant app, pull a lightweight summary using the existing dashboard resolvers (e.g., call `dashNutritionSummary`, `dashBujoSummary`, etc. internally)

3. Build a system prompt that includes the gathered context:
   ```
   You are a helpful assistant for the GeekSuite ecosystem. Here is the user's current data:

   [BujoGeek] 3 tasks open, 5 completed today
   [FitnessGeek] 1,450 calories logged (goal: 2,000), 120g protein
   [FlockGeek] 12 active birds, 8 eggs today
   ...

   Answer the user's question using this context. Be concise and specific.
   ```

4. Send the system prompt + conversation history to BaseGeek's AI proxy:
   ```javascript
   const response = await axios.post(
     `${BASEGEEK_URL}/openai/v1/chat/completions`,
     {
       model: 'basegeek-rotation',
       messages: [systemMessage, ...userMessages],
       max_tokens: 2000,
       temperature: 0.7
     },
     {
       headers: {
         'Authorization': `Bearer ${process.env.AI_GEEK_API_KEY}`,
         'Content-Type': 'application/json'
       }
     }
   );
   ```

5. Return the AI's response along with `sources` listing which apps provided context

**Important:** The AI proxy uses an API key (`AI_GEEK_API_KEY`), not the user's JWT. This key must be added to BaseGeek's `.env.production` if not already present. Check `$DOCKER/basegeek/.env.production` for an existing key, or generate a new one via BaseGeek's API key management.

### Step 4.3: Add the AI chat query to frontend

Add to `queries.js`:

```javascript
export const DASH_AI_CHAT = gql`
  query DashAIChat($messages: [DashAIChatInput!]!, $gatherContext: Boolean) {
    dashAIChat(messages: $messages, gatherContext: $gatherContext) {
      content
      sources {
        app
        type
        title
      }
    }
  }
`;
```

Use `useLazyQuery` (not `useQuery`) in the chat component, since the query should only fire when the user sends a message, not on page load.

### Step 4.4: Verify Phase 4

1. Navigate to `/ai` in DashGeek
2. Ask "How's my day going?"
3. Verify the AI responds with data from multiple apps
4. Ask a specific question like "How many eggs did my flock produce this week?"
5. Verify it uses FlockGeek data in the response

---

## Phase 5 — Weekly Digest

### Step 5.1: Build the digest page

Create `$GEEKSUITE/apps/dashgeek/frontend/src/pages/Digest.jsx`:

Build a page that:
- Shows the current week by default (Monday–Sunday)
- Has prev/next week navigation arrows
- Displays sections for each app's weekly summary
- Shows an AI-generated narrative summary at the top
- Each section uses a card layout similar to the dashboard widgets

### Step 5.2: Implement the digest resolver

Replace the placeholder `dashWeeklyDigest` resolver. For each app:

**BujoGeek digest:**
- Count entries with `type: 'task'` created in the date range → `tasksCreated`
- Count entries with `status: 'done'` or `'completed'` in the date range → `tasksCompleted`
- Calculate `completionRate` = `tasksCompleted / tasksCreated * 100`

**BookGeek digest:**
- Count books whose `status` changed to `'read'` or `'finished'` during the week → `booksFinished`
- Sum page progress changes during the week → `pagesRead` (this requires tracking, may need to approximate from reading log entries)
- List books with `status: 'reading'` → `currentlyReading`

**FitnessGeek digest:**
- Average daily calories across logged days → `avgCalories`
- Average daily protein → `avgProtein`
- Weight change from start to end of week → `weightChange`
- Count of days with at least one food log → `daysLogged`

**FlockGeek digest:**
- Sum all `eggsCount` in the date range → `totalEggs`
- `totalEggs / 7` → `avgEggsPerDay`
- Count hatch events completed in the week → `hatchEvents`
- Sum `chicksHatched` from completed hatch events → `chicksHatched`

**NoteGeek digest:**
- Count notes with `createdAt` in the date range → `notesCreated`
- Count notes with `updatedAt` in the date range (excluding newly created) → `notesUpdated`
- Aggregate tags from all created/updated notes, count occurrences, return top 5 → `topTags`

**AI summary:**
After gathering all digest data, send it to the AI proxy with a prompt like:
```
Summarize this person's week in 2-3 sentences. Be encouraging and specific.

Productivity: 23/30 tasks completed (77%)
Reading: Finished "Dune", currently reading "Project Hail Mary" (page 145/320)
Health: Averaged 1,850 cal/day (goal 2,000), weight down 0.5 lbs
Flock: 42 eggs collected, 2 hatch events, 6 chicks hatched
Notes: 3 new notes, most active tags: #garden, #recipes
```

### Step 5.3: Verify Phase 5

1. Navigate to `/digest` in DashGeek
2. Verify each section shows data for the current week
3. Navigate to a previous week and verify the data changes
4. Verify the AI summary accurately reflects the week's data

---

## Deployment Checklist

When all phases are complete and tested locally, follow these steps to deploy:

### DNS
- [ ] Create DNS A record for `dash.clintgeek.com` → `192.168.1.17`
- [ ] Create DNS A record for `dashgeek.clintgeek.com` → `192.168.1.17`

### Nginx
- [ ] Copy `dashGeek.conf` to nginx's sites-enabled (or create symlink)
- [ ] Reload nginx: `docker exec nginx nginx -s reload`
- [ ] Test: `curl -I https://dash.clintgeek.com` should return 502 (until the container is running)

### BaseGeek
- [ ] Add `'https://dash.clintgeek.com'` and `'https://dashgeek.clintgeek.com'` to CORS origins in `server.js`
- [ ] Rebuild and restart BaseGeek container to pick up the new dashboard resolvers

### DashGeek Docker
- [ ] Build the Docker image from the monorepo root:
  ```bash
  cd $GEEKSUITE
  docker build -t geeksuite/dashgeek:latest -f apps/dashgeek/Dockerfile .
  ```
- [ ] Start the container:
  ```bash
  cd $DOCKER/dashgeek
  docker compose up -d
  ```
- [ ] Verify: `curl -I http://192.168.1.17:4090` should return 200

### Final verification
- [ ] Open `https://dash.clintgeek.com` in a browser
- [ ] Verify SSO login redirects to BaseGeek and back
- [ ] Verify dashboard widgets load data
- [ ] Verify search returns results
- [ ] Verify AI chat responds with context
- [ ] Verify weekly digest generates

---

## File Reference

Quick reference of every file created or modified in this guide:

**New files (DashGeek app):**
| File | Purpose |
|------|---------|
| `apps/dashgeek/frontend/package.json` | Frontend dependencies |
| `apps/dashgeek/frontend/vite.config.js` | Vite + PWA configuration |
| `apps/dashgeek/frontend/index.html` | HTML entry point |
| `apps/dashgeek/frontend/.env` | Default env vars |
| `apps/dashgeek/frontend/.env.development` | Dev env vars |
| `apps/dashgeek/frontend/.env.production` | Production env vars |
| `apps/dashgeek/frontend/src/main.jsx` | React entry point |
| `apps/dashgeek/frontend/src/App.jsx` | Root component with routing |
| `apps/dashgeek/frontend/src/apolloClient.js` | Apollo Client setup |
| `apps/dashgeek/frontend/src/bootstrapUser.js` | SSO bootstrap |
| `apps/dashgeek/frontend/src/AppBootstrapper.jsx` | User hydration wrapper |
| `apps/dashgeek/frontend/src/store/authStore.js` | Auth state management |
| `apps/dashgeek/frontend/src/pages/Login.jsx` | Login splash page |
| `apps/dashgeek/frontend/src/pages/Dashboard.jsx` | Main dashboard page |
| `apps/dashgeek/frontend/src/pages/Search.jsx` | Universal search page |
| `apps/dashgeek/frontend/src/pages/AIChat.jsx` | AI assistant page |
| `apps/dashgeek/frontend/src/pages/Digest.jsx` | Weekly digest page |
| `apps/dashgeek/frontend/src/graphql/queries.js` | All GraphQL queries |
| `apps/dashgeek/frontend/src/components/widgets/BujoWidget.jsx` | BujoGeek widget |
| `apps/dashgeek/frontend/src/components/widgets/NotesWidget.jsx` | NoteGeek widget |
| `apps/dashgeek/frontend/src/components/widgets/BooksWidget.jsx` | BookGeek widget |
| `apps/dashgeek/frontend/src/components/widgets/NutritionWidget.jsx` | FitnessGeek widget |
| `apps/dashgeek/frontend/src/components/widgets/WeightWidget.jsx` | Weight trend widget |
| `apps/dashgeek/frontend/src/components/widgets/FlockWidget.jsx` | FlockGeek widget |
| `apps/dashgeek/backend/package.json` | Backend dependencies |
| `apps/dashgeek/backend/server.js` | Static file server |
| `apps/dashgeek/Dockerfile` | Multi-stage Docker build |

**New files (BaseGeek GraphQL module):**
| File | Purpose |
|------|---------|
| `apps/basegeek/packages/api/src/graphql/dashboard/typeDefs.js` | Cross-app query types |
| `apps/basegeek/packages/api/src/graphql/dashboard/resolvers.js` | Cross-app resolvers |

**New files (Infrastructure):**
| File | Purpose |
|------|---------|
| `$DOCKER/dashgeek/docker-compose.yml` | Container orchestration |
| `$DOCKER/dashgeek/.env` | Container env vars |
| `$DOCKER/nginx/config/sites-available/dashGeek.conf` | Nginx reverse proxy |

**Modified files:**
| File | Change |
|------|--------|
| `apps/basegeek/packages/api/src/graphql/index.js` | Import and register dashboard module |
| `apps/basegeek/packages/api/src/server.js` | Add dash.clintgeek.com to CORS origins |
