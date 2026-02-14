# BuJoGeek - Project Context

## 🚨 **LIVING DOCUMENT: KEEP UPDATED!** 🚨

This document provides comprehensive context for BuJoGeek development. It captures the current state, architecture, and critical information needed for any development work.

---

## Project Overview

**BuJoGeek** is a digital Bullet Journal application, part of the GeekSuite ecosystem. It aims to combine the simplicity of analog bullet journaling with modern digital convenience.

### Current State Assessment

| Area | Status | Grade |
|------|--------|-------|
| Core Functionality | Working | B- |
| UI/UX Design | Dated/Basic | C |
| Code Quality | Needs Refactoring | C+ |
| Mobile Experience | Functional but Clunky | C |
| Performance | Acceptable | B |
| Feature Completeness | ~40% of vision | D+ |

---

## Architecture

### Tech Stack

**Frontend:**
- Vite + React 18
- Material-UI (MUI) v7
- Zustand (state management - unused, using Context instead)
- React Router v6
- date-fns for date handling
- Axios for API calls

**Backend:**
- Express.js
- MongoDB with Mongoose v6
- JWT authentication
- bcrypt/bcryptjs for password hashing

**Infrastructure:**
- Docker/Docker Compose
- Nginx for frontend serving
- Shared MongoDB instance with GeekSuite apps

### Directory Structure

```
BuJoGeek/
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/     # UI components
│   │   │   ├── auth/       # Login/Register forms
│   │   │   ├── layout/     # AppLayout
│   │   │   ├── navigation/ # BottomNav
│   │   │   ├── tasks/      # Task-related components
│   │   │   ├── templates/  # Template components
│   │   │   ├── monthly/    # Monthly view
│   │   │   └── yearly/     # Yearly view
│   │   ├── context/        # React contexts (Auth, Task)
│   │   ├── pages/          # Page components
│   │   ├── services/       # API services
│   │   ├── theme/          # MUI theme
│   │   └── hooks/          # Custom hooks
│   └── public/
├── server/                 # Express backend
│   └── src/
│       ├── controllers/    # Route handlers
│       ├── middleware/     # Auth middleware
│       ├── models/         # Mongoose models
│       ├── routes/         # Express routes
│       └── utils/          # Utilities
└── DOCS/                   # Documentation
```

---

## Current Features

### ✅ Implemented
- **Task CRUD** - Create, read, update, delete tasks
- **Signifier System** - *, @, x, <, >, -, !, ?, #
- **Priority Levels** - High (1), Medium (2), Low (3)
- **Tags** - Hashtag-based tagging
- **Due Dates** - Date/time scheduling
- **Views** - Daily, Weekly, Monthly, Yearly, All
- **Quick Entry** - Cmd+K natural language task creation
- **Task Filtering** - Search, status, priority, tags
- **Drag & Drop** - Reorder tasks in daily view
- **Templates** - Basic template system (backend complete)
- **Authentication** - JWT-based login/register

### ❌ Not Implemented / Incomplete
- **Offline Support** - No service worker/PWA
- **Cloud Sync** - No real-time sync
- **Dark Mode** - Theme exists but no toggle
- **Habit Tracking** - Not started
- **Export/Import** - Not implemented
- **Recurring Tasks** - Model supports it, no UI
- **Subtasks UI** - Backend ready, no frontend
- **Calendar Integration** - Not started
- **Statistics/Analytics** - Not started
- **User Preferences** - Not implemented

---

## Database Models

### Task Schema
```javascript
{
  content: String,           // Task text
  signifier: String,         // *, @, x, <, >, -, !, ?, #
  status: String,            // pending, completed, migrated_back, migrated_future
  dueDate: Date,
  priority: Number,          // 1=High, 2=Medium, 3=Low
  note: String,
  tags: [String],
  originalDate: Date,
  migratedFrom: Date,
  migratedTo: Date,
  isBacklog: Boolean,
  parentTask: ObjectId,
  subtasks: [ObjectId],
  createdAt: Date,
  updatedAt: Date,
  createdBy: ObjectId        // User reference
}
```

### User Schema
```javascript
{
  email: String,
  password: String,          // bcrypt hashed
  name: String,
  createdAt: Date
}
```

---

## API Endpoints

### Authentication
- `POST /api/auth/login` - Login
- `POST /api/auth/register` - Register
- `GET /api/auth/me` - Get current user

### Tasks
- `GET /api/tasks` - Get all tasks
- `GET /api/tasks/all` - Get all tasks (unfiltered)
- `GET /api/tasks/daily` - Get daily tasks
- `GET /api/tasks/weekly` - Get weekly tasks
- `GET /api/tasks/monthly` - Get monthly tasks
- `POST /api/tasks` - Create task
- `PUT /api/tasks/:id` - Update task
- `DELETE /api/tasks/:id` - Delete task
- `PATCH /api/tasks/:id/status` - Update status
- `POST /api/tasks/:id/migrate-future` - Migrate task
- `POST /api/tasks/daily/order` - Save task order

### Templates
- `GET /api/templates` - List templates
- `POST /api/templates` - Create template
- `PUT /api/templates/:id` - Update template
- `DELETE /api/templates/:id` - Delete template

---

## Environment Configuration

### Development
- Frontend: `http://localhost:5173` (Vite default)
- Backend: `http://localhost:5001`
- MongoDB: `192.168.1.17:27017` (production DB)

### Production
- Frontend: Port 9989 (Nginx)
- Backend: Port 5001 (Docker)
- MongoDB: `192.168.1.17:27017`

### Key Environment Variables
```bash
# Server
PORT=5001
DB_URI=mongodb://user:pass@192.168.1.17:27017/bujogeek
JWT_SECRET=<secret>

# Client
VITE_API_URL=http://localhost:5001/api
```

---

## Known Issues & Technical Debt

### Critical
1. **Duplicate model files** - `User.js` and `userModel.js`, `Template.js` and `templateModel.js`
2. **Zustand imported but unused** - Using Context API instead
3. **No error boundaries** - App crashes on errors
4. **No loading skeletons** - Jarring UX during loads

### High Priority
1. **Inconsistent state management** - Mix of Context and local state
2. **No form validation library** - Manual validation everywhere
3. **Hardcoded magic numbers** - Heights, timeouts scattered
4. **No TypeScript** - Type safety would prevent bugs
5. **Console.log statements** - Debug code in production

### Medium Priority
1. **No tests** - Zero test coverage
2. **No API error handling UI** - Errors logged but not shown
3. **Duplicate sorting logic** - Same sort in multiple places
4. **No memoization** - Unnecessary re-renders
5. **CSS-in-JS inconsistency** - Mix of sx prop and styled

### Low Priority
1. **No accessibility audit** - ARIA labels missing
2. **No i18n** - English only
3. **No analytics** - No usage tracking
4. **Inconsistent naming** - camelCase vs snake_case

---

## Development Rules

### Build & Deployment
- **Sage NEVER performs builds** - Chef handles all builds
- **Sage NEVER restarts servers** - Chef handles restarts
- **Sage NEVER commits to git** - Chef handles version control
- **Docker containers require rebuild** - No hot-reload in production

### Node.js
- **Always use Node.js LTS** (v18+)
- Run `nvm use --lts` before any commands
- System Node v14 will NOT work

### Server Access
- SSH: `ssh server`
- Project path: `/mnt/Media/Docker/BuJoGeek/`
- Server IP: `192.168.1.17`

---

## GeekSuite Design Language

### Colors
- Primary: `#6098CC`
- Primary Light: `#7BB3F0`
- Primary Dark: `#2E5C8A`
- Background: `#F5F5F5`
- Paper: `#FFFFFF`
- Text Primary: `#333333`
- Text Secondary: `#666666`

### Typography
- Primary Font: Roboto
- Monospace: Roboto Mono
- Base size: 14px (0.875rem)

### Layout
- Header height: 60px
- Bottom nav height: 64px
- Border radius: 8px
- Base spacing: 8px

---

## Related Documentation

- `CURSOR-CONTEXT.md` - Operational rules (legacy, being replaced)
- `DOCS/PLAN.md` - Original development plan
- `DOCS/FEATURES.md` - Feature specifications
- `DOCS/GEEK_SUITE_DESIGN_LANGUAGE.md` - Design system
- `DOCS/THE_PLAN.md` - Strategic improvement roadmap
- `DOCS/THE_STEPS.md` - Tactical implementation steps
