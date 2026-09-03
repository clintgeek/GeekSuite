# StartGeek v2

A calm, minimal browser start page for the GeekSuite ecosystem.

## Development

```bash
cd apps/startgeek
npm install
npm run dev
```

Open `http://localhost:5173`.

## Build & lint

```bash
npm run lint
npm run build
```

## Production (Docker)

```bash
docker build -f apps/startgeek/Dockerfile -t geeksuite/startgeek:test .
```

Run with the provided `docker-compose.yml` on port `3000`.
