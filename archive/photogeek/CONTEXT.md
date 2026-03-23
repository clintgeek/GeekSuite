# PhotoGeek - Context

## High-Level Overview

**PhotoGeek** is a photography learning and project companion app that helps novice photographers (especially those with new DSLRs) learn camera techniques through AI-guided projects and challenges.

## Stack

**Backend:**
- Node.js + Express
- MongoDB via Mongoose
- JWT authentication
- OpenAI API for AI-powered features
- EXIF extraction via `exifr` library
- Multer for file uploads

**Frontend:**
- React 18 with Vite
- Material-UI (MUI) v5
- React Router v6
- Axios for API calls
- GeekSuite design system with photography-themed colors

## Project Structure

```
photoGeek/
├── backend/
│   ├── src/
│   │   ├── config/         # Database connection, app config
│   │   ├── models/         # Mongoose models (User, Project, UserProject, etc.)
│   │   ├── routes/         # Express route definitions
│   │   ├── controllers/    # Route handler logic
│   │   ├── services/       # Business logic (AI, EXIF, etc.)
│   │   ├── middleware/     # Auth, error handling, etc.
│   │   └── server.js       # Express app entry point
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/     # Reusable UI components
│   │   ├── pages/          # Page components (Dashboard, Projects, etc.)
│   │   ├── services/       # API service layer
│   │   ├── contexts/       # React contexts (Auth, etc.)
│   │   ├── hooks/          # Custom React hooks
│   │   ├── theme/          # Material-UI theme configuration
│   │   ├── utils/          # Utility functions
│   │   ├── App.jsx         # Main app component with routing
│   │   └── main.jsx        # React entry point
│   └── package.json
└── DOCS/
    └── THE_PLAN.md         # Comprehensive project plan
```

## Key Models

### User
- Authentication (email, password with bcrypt)
- Profile (name, avatar, bio)
- Equipment (cameras and lenses)
- Skill level (beginner/intermediate/advanced)
- Preferences (favorite subjects, locations)
- Gamification (XP, level, streak tracking)

### Project
- Photography project definition
- Technique focus, difficulty level
- Subject, location, lighting requirements
- Recommended camera settings
- Learning objectives and tips
- XP reward

### UserProject
- User's progress on a specific project
- Status (assigned/in-progress/completed)
- Uploaded photos with EXIF data
- AI analysis and feedback
- Completion tracking and ratings

## Core Features (Phase 1 MVP)

1. **Authentication**: JWT-based user registration and login
2. **Projects**: Browse and view photography projects
3. **Dashboard**: Overview of current project and progress
4. **Knowledge Base**: Articles on photography concepts
5. **Progress Tracking**: Track completed projects and XP

## Key Technical Decisions

### Canon Camera Integration
- Users transfer photos from Canon DSLR to phone via Canon Camera Connect app (WiFi/Bluetooth)
- PhotoGeek extracts EXIF metadata from uploaded photos using `exifr` library
- EXIF data includes: camera model, lens, shooting mode, aperture, shutter speed, ISO, focal length, etc.
- AI feedback references actual camera settings used
- Enables automatic verification of technique application

### AI Integration (OpenAI)
- Project generation based on skill level and preferences
- Photo analysis and feedback on composition, exposure, technique
- Personalized recommendations for next projects
- Beginner-friendly explanations of concepts

### Photo Storage
- TBD: AWS S3, Cloudinary, or MongoDB GridFS
- Need to handle image optimization/resizing
- Store EXIF metadata separately in database

### Design System
- GeekSuite design language (consistent with MusicGeek and fitnessGeek)
- Primary color: Warm amber/gold (#D4A574) for golden hour photography vibes
- Secondary color: Professional blue (#6098CC)
- Mobile-first, responsive design
- Material-UI components with custom theme

## Development Workflow

### Running Locally
```bash
# Install all dependencies
npm run install:all

# Run both backend and frontend
npm run dev

# Or run separately
npm run dev:backend  # Backend on :4010
npm run dev:frontend # Frontend on :5173
```

### Environment Variables
Backend requires `.env` file:
- `MONGO_URI` - MongoDB connection string
- `JWT_SECRET` - Secret for JWT token signing
- `PORT` - Server port (default: 4010)
- `OPENAI_API_KEY` - OpenAI API key for AI features
- `MAX_FILE_SIZE` - Max upload size
- `UPLOAD_DIR` - Upload directory path

## Current State

**Completed:**
- ✅ Project structure initialized
- ✅ Git repository initialized
- ✅ Backend foundation (Express server, MongoDB config)
- ✅ Core models (User, Project, UserProject)
- ✅ Frontend foundation (React + Vite + Material-UI)
- ✅ GeekSuite theme with photography colors
- ✅ Basic routing setup

**Next Steps:**
- [ ] Install dependencies
- [ ] Implement authentication (JWT)
- [ ] Create auth routes and controllers
- [ ] Build login/register UI
- [ ] Seed initial projects
- [ ] Create project browsing UI
- [ ] Build dashboard

## Important Notes

- **EXIF extraction** works with standard JPEG files (no special Canon API needed)
- Works with **any camera brand**, not just Canon
- Mobile-first design since users will have camera with them
- Gamification inspired by MusicGeek (XP, achievements, streaks)
- Progressive learning from beginner to advanced

## References

- MusicGeek: `/Users/ccrocker/projects/MusicGeek`
- fitnessGeek: `/Users/ccrocker/projects/fitnessGeek`
- THE_PLAN.md: `/Users/ccrocker/projects/photoGeek/DOCS/THE_PLAN.md`
