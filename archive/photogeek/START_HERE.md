# PhotoGeek - Quick Start Guide

## What We've Built

✅ **Complete project foundation** with:
- Backend API (Express + MongoDB)
- Frontend app (React + Vite + Material-UI)
- User, Project, and UserProject models
- Photography-themed design (warm amber/gold colors)
- All dependencies installed

## Getting Started

### 1. Start MongoDB

If using local MongoDB:
```bash
mongod
```

Or use MongoDB Atlas (cloud) - update `MONGO_URI` in `backend/.env`

### 2. Configure Environment

The `backend/.env` file is already created with defaults. You'll need to:
- Add your OpenAI API key later (for AI features in Phase 2)
- Update `MONGO_URI` if not using local MongoDB

### 3. Run the Application

**Option A: Run both together (recommended)**
```bash
npm run dev
```

**Option B: Run separately**
```bash
# Terminal 1 - Backend
cd backend
npm run dev

# Terminal 2 - Frontend
cd frontend
npm run dev
```

### 4. Access the App

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:4010
- **Health Check**: http://localhost:4010/api/health

## What's Next?

See `implementation_plan.md` for the complete Phase 1 roadmap. The next steps are:

1. **Authentication** - Register/login system
2. **Projects** - Browse and view photography projects
3. **Dashboard** - User overview and progress
4. **Seed Data** - Initial photography projects

## Project Structure

```
photoGeek/
├── backend/          # Express API
│   ├── src/
│   │   ├── models/   # User, Project, UserProject
│   │   ├── config/   # Database connection
│   │   └── server.js # Entry point
│   └── .env          # Environment variables
├── frontend/         # React app
│   └── src/
│       ├── pages/    # Dashboard, Login, etc.
│       ├── theme/    # Material-UI theme
│       └── App.jsx   # Main component
└── DOCS/
    └── THE_PLAN.md   # Full project vision

```

## Key Files

- **THE_PLAN.md** - Complete project vision and features
- **CONTEXT.md** - Technical architecture and current state
- **implementation_plan.md** - Phase 1 development roadmap
- **task.md** - Detailed task checklist
- **README.md** - Full documentation

## Need Help?

Check the documentation files above or review the MusicGeek/fitnessGeek projects for reference patterns.

---

**You're all set to start building! 📷**
