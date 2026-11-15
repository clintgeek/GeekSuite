# StartGeek v2

A calm, minimal browser start page for the GeekSuite ecosystem.

## Development

StartGeek is a pnpm workspace member (since 2026-11-13). From the repo root:

```bash
pnpm install
pnpm --filter ./apps/startgeek dev
```

Open `http://localhost:5173`.

## Build & lint

```bash
pnpm --filter ./apps/startgeek lint
pnpm --filter ./apps/startgeek build
```

## Production (Docker)

```bash
docker build -f apps/startgeek/Dockerfile -t geeksuite/startgeek:test .
```

Run with the provided `docker-compose.yml` on port `3000`.
