# GeekSuite App Migration Agent Instructions

## Role

You are a coding agent working inside the GeekSuite monorepo.

Your job is to migrate apps from **runtime Docker builds** to the **prebuilt image architecture**.

You are allowed to read and modify files in the repository.

Start making changes immediately. Do not ask for permission unless the task is ambiguous.

---

## Mission

Migrate **one app at a time** to the new Docker architecture.

BaseGeek and BabelGeek are already migrated and serve as reference implementations.

The target app and port will be provided in the task.

---

## Definition of Done

An app is considered migrated only when all of the following are true:

1. `apps/<app>/Dockerfile` exists and follows the standard template.
2. Backend serves the built frontend from `/public`.
3. Docker image builds successfully from monorepo root.
4. Runtime `docker-compose` uses `image:` instead of `build:`.
5. Runtime folder no longer requires source code.

You implement **items 1–3** in this repository.
You provide instructions for **items 4–5**.

Do **not** modify server runtime folders.

---

## Allowed Directories

You may edit freely inside:

```text
apps/<app>/**
packages/**
```

Do **not** modify:

```text
/mnt/Media/Docker/*
CI
infra
unrelated apps
```

---

## Standard App Structure

When migrating an app, **normalize it to this standard structure**:

```text
apps/<app>/
  backend/
  frontend/
  Dockerfile
```

Backend must serve the built frontend output.

---

## Critical Migration Rules

### 1) Frontend API Rule (Most Important)

Frontend must use **same-origin API calls**.

During migration, remove any of the following if found:

- `VITE_API_URL`
- `REACT_APP_API_URL`
- `http://localhost:*`
- hardcoded `https://<domain>/api`

Frontend API clients must use:

```js
baseURL: "/api";
```

Do **not** update these variables to the new port.
They must be removed.

---

### 2) Never Delete Application Code

Never delete existing source code or directories.

If multiple folders exist (`server`, `backend`, `api`):

- Determine which one is the real backend.
- You may rename or move files.
- You may **not** delete code.

---

### 3) Runtime vs Build-Time Variables

Runtime `.env` files must **not** contain build-time variables such as:

```text
VITE_*
GEEKSUITE_REGISTRY
npm registry settings
```

These belong only in Docker builds.

---

### 4) Single-Container Runtime Rule

After migration, there is **no separate frontend service**.

Nginx will proxy all traffic to a single container port.

Do not assume multiple services exist at runtime.

---

### 5) Docker Base Image Rule

Use the current standard Dockerfile template.
Do not invent or choose base images independently.

Before creating the Dockerfile, verify runtime:

| App Type  | Base Image | Start Command    |
| --------- | ---------- | ---------------- |
| Node apps | `node:20`  | `npm start`      |
| Bun apps  | `oven/bun` | `bun run start`  |

#### Standard Dockerfile Template (Node Apps)

Use this template and replace `<app>` with the target app name.

```dockerfile
# ---------- BUILD STAGE ----------
FROM node:20-alpine AS build

WORKDIR /app
RUN apk add --no-cache python3 make g++

# Copy workspace files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages ./packages
COPY apps/<app> ./apps/<app>

# Install workspace deps
RUN npm install -g pnpm
RUN pnpm install

# ---------- Build frontend ----------
WORKDIR /app/apps/<app>/frontend

# Use private Verdaccio registry inside Docker
RUN echo "@geeksuite:registry=http://192.168.1.17:4873" > .npmrc

RUN npm install
RUN npm run build

# ---------- PRODUCTION STAGE ----------
FROM node:20-alpine AS prod

WORKDIR /app
RUN apk add --no-cache vips

# Install backend production deps
COPY apps/<app>/backend/package*.json ./apps/<app>/backend/
WORKDIR /app/apps/<app>/backend

# Use private Verdaccio registry inside Docker
RUN echo "@geeksuite:registry=http://192.168.1.17:4873" > .npmrc

RUN npm install --production

# Copy backend source
COPY apps/<app>/backend .

# Copy built frontend into backend public folder
COPY --from=build /app/apps/<app>/frontend/dist ./public

EXPOSE <port>
CMD ["npm", "start"]
```

Do **not** delete configuration files (`docker-compose.yml`, nginx configs, etc.) unless explicitly instructed.

---

### 6) Dry-Run Behavior Rule

When asked for a dry run, provide the plan only.
Do **not** ask for permission to continue.

### 7) Monorepo Source of Truth Rule

The monorepo always remains the permanent source of truth.

Never remove application source folders (`backend/`, `frontend/`, `server/`, `client/`).
These are required to build Docker images.

Migration removes source code from runtime folders, **not** from the monorepo.

---

## Required Backend Change

Ensure Express serves static frontend files.

```js
app.use(express.static(publicPath));

app.get("*", (req, res) => {
  res.sendFile(path.join(publicPath, "index.html"));
});
```

All API routes must live under `/api`.

When adding Express static serving, ensure the SPA fallback route is placed **after all API routes** and **before the 404 handler**.

---

## Execution Plan

Follow this EXACT sequence:

1. Locate the app in the monorepo
2. Inspect backend and frontend structure
3. Confirm runtime (Node vs Bun)
4. Create the Dockerfile
5. Modify backend to serve static frontend if missing, ensuring SPA fallback is after all API routes and before the 404 handler
6. Attempt to build the Docker image from monorepo root
7. Fix any build errors and repeat until build succeeds
8. Summarize the changes made
9. Provide runtime docker-compose and nginx update instructions

Do NOT migrate any other apps.

---

## Environment Awareness Rules

These rules reflect the real GeekSuite deployment environment.

### 1) Nginx Host Rule

When providing nginx examples, use the server LAN IP:

```text
192.168.1.17
```

Do **not** use:

```text
localhost
127.0.0.1
```

Containers run on a remote server. Nginx must proxy to the server LAN IP.

### 2) Backend Public Path Rule

Backend servers live in:

```text
apps/<app>/backend/src/server.js
```

The built frontend is copied to:

```text
apps/<app>/backend/public
```

Therefore, the correct static path is:

```js
const publicPath = path.join(__dirname, "..", "public");
```

Do **not** use:

```text
../public
public
./public
```

The path must work from the `src` directory.

### 3) Runtime Compose Review Rule

When giving runtime instructions:

- Do **not** generate a full `docker-compose` from scratch.
- Assume a runtime compose already exists.
- Instruct the user how to **modify** it to match the standard template.
- Focus on diff-style instructions, not full file generation.

### 4) Docker Build Verification Rule

When building the Docker image:

- You **must** attempt the build.
- If Docker is unavailable, clearly state the build could not be verified.
- Do **not** claim the build succeeded when it was not verified.
- Continue with manual validation guidance.

### 5) Fix-Loop Rule

The Docker build step is iterative:

```text
Attempt build -> fix errors -> rebuild -> repeat until successful
```

Do not stop after the first attempt.

---

## Begin Now

