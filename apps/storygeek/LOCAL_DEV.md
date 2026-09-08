# StoryGeek Local Development

## Quick Start

### 1. Install Dependencies

```bash
# Backend dependencies
cd StoryGeek/backend
npm install

# Frontend dependencies
cd ../frontend
npm install
```

### 2. Set Up Environment Variables

Create `.env` files in both backend and frontend directories:

**Backend (.env):**
```bash
cd StoryGeek/backend
```

Create `backend/.env`:
```env
NODE_ENV=development
PORT=5000
DB_URI=mongodb://localhost:27017/storygeek?authSource=admin
JWT_SECRET=your_jwt_secret_here
BASEGEEK_URL=http://localhost:9988
AI_GEEK_API_KEY=bg_...
```

**StoryGeek holds no provider keys and names no models.** Every AI call goes
to aiGeek's feature door (`POST /api/ai/feature` on baseGeek) with StoryGeek's
own service key, and aiGeek decides which model answers. So there is no
`GROQ_API_KEY`, no `GEMINI_API_KEY`, and — since Phase 2 — no
`STORYGEEK_GM_PROVIDER`, `STORYGEEK_GM_MODEL`, `STORYGEEK_FREE_ONLY`,
`STORYGEEK_AUX_PROVIDER` or `STORYGEEK_AUX_MODEL` either. Those five were
removed because a hand-typed model id is a promise that expires the next time
a vendor retires a slug (`DOCS/AIGEEK_ELEVATION_PLAN.md`, Chef's decision D4).

`AI_GEEK_API_KEY` is minted on the baseGeek host and needs two permissions,
`ai:call` and `ai:models`:

```sh
cd apps/basegeek/packages/api
node scripts/mint-api-key.js \
  --app storygeek --name "storygeek backend" \
  --permissions ai:call,ai:models \
  --write-env ../../../storygeek/.env --var AI_GEEK_API_KEY
```

`ai:director` is no longer needed — StoryGeek stopped asking the model steward
anything when the GM pin retired. Without a key at all, the backend forwards
the player's own JWT instead, which still works but files every call under
whoever is playing.

**Frontend (.env):**
```bash
cd StoryGeek/frontend
```

Create `frontend/.env`:
```env
VITE_API_URL=http://localhost:5000
```

### 3. Start Development Servers

**Terminal 1 - Backend:**
```bash
cd StoryGeek/backend
npm run dev
```
Backend will run on: http://localhost:5000

**Terminal 2 - Frontend:**
```bash
cd StoryGeek/frontend
npm run dev
```
Frontend will run on: http://localhost:3000

### 4. Access the App

Open your browser to: **http://localhost:3000**

## Development Workflow

- **Frontend**: Hot reloads on file changes
- **Backend**: Nodemon restarts on file changes
- **API Calls**: Automatically proxied from frontend to backend
- **Database**: Uses your existing DataGeek MongoDB instance

## Troubleshooting

### Port Conflicts
If you get port conflicts:
- Backend: Change `PORT` in backend `.env`
- Frontend: Change `port` in `frontend/vite.config.js`

### Database Connection
Make sure your DataGeek MongoDB is running and accessible at `192.168.1.17:27018`

### AI calls
StoryGeek needs exactly one credential: `AI_GEEK_API_KEY`, a baseGeek service
key for app `storygeek` with `ai:call` and `ai:models` (see above). Provider
keys (Groq, Gemini, OpenRouter, …) live in aiGeek and nowhere else.

If turns come back with *"The narrator is not answering right now"*, that is
aiGeek declining rather than StoryGeek failing — the response carries a
`reason` (`cap`, `unavailable`, `timeout`, `paid_budget`), and the backend log
line names the feature and status. Check aiGeek's status page before looking
here.

**Which model is answering** is aiGeek's choice, remembered per story (its
*sticky pick*), and reported back on every turn: `GET /api/stories/test-ai`
returns `modelUsed`, and a turn sent with `debug: true` puts `gmModel` and
`extractionModel` in `payload.debug`. To hear a different one, pick it in
Settings — that sends a pin for that player's stories, and if the pin stops
answering the turn still lands on the automatic pick with a one-line notice.

## Benefits of Local Development

✅ **Faster feedback loops** - No Docker build time
✅ **Hot reloading** - See changes instantly
✅ **Better debugging** - Direct console access
✅ **Faster iteration** - No container restarts
✅ **Easier testing** - Direct file access

## Switching Back to Docker

When ready to test in Docker:
```bash
cd StoryGeek
docker-compose up --build
```

Access at: http://localhost:9977