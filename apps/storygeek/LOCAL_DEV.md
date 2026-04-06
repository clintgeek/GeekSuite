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
CLAUDE_API_KEY=your_claude_api_key_here
GROQ_API_KEY=your_groq_api_key_here
GEMINI_API_KEY=your_gemini_api_key_here
JWT_SECRET=your_jwt_secret_here
BASEGEEK_URL=http://localhost:9988
```

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

### API Keys
You'll need valid API keys for:
- Claude (Anthropic)
- Groq
- Gemini (Google)

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