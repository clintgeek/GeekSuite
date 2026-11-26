# NoteGeek

GeekSuite's note-taking app. A note is **Typed** (Markdown) or **Handwritten** (a tldraw
canvas, optionally read into searchable text). Notes can be tagged, linked with `[[Title]]`,
searched by words and by meaning, and printed.

- **Frontend:** React + Vite PWA in `frontend/` (`pnpm run dev` serves it on :5173).
- **Backend:** a small Express server in `backend/` (:9988). It handles sign-in and
  `/api/me`, and serves the built frontend as static files; it holds no notes.
- **Data:** every note read and write goes through the basegeek gateway's GraphQL
  (`/graphql`, `apps/basegeek/packages/api/src/graphql/notegeek`).
- **Docs:** `DOCS/CONTEXT.md` is the architecture and the place to start; specs and
  finished plans sit beside it in `DOCS/` and `DOCS/ARCHIVE/`.
- **Tests:** `cd apps/notegeek/frontend && pnpm exec vitest run`.
- **Deploy:** push to `main`; CI builds the image and Watchtower pulls it
  (`DOCS/CICD.md`, `DOCS/RUNBOOK.md` at the repo root).
