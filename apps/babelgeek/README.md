# BabelGeek - Language Learning Platform

BabelGeek is a modern, gamified language learning application built on the Geek Suite architecture. Learn Spanish, French, and more through interactive lessons, AI-powered conversations, and spaced repetition vocabulary drilling.

## Features

- 🌍 **Multiple Languages** - Spanish, French, and more
- 📚 **Structured Lessons** - Bite-sized, template-driven learning sessions
- 🎯 **Learning Paths** - Curated progressions from A1 to C2
- 🗣️ **AI Conversations** - Practice speaking with scenario-based dialogues
- 📖 **Vocabulary Drilling** - Spaced repetition for long-term retention
- 🏆 **Gamification** - XP, streaks, achievements, and leaderboards
- 📱 **PWA Ready** - Works offline, installable on any device

## Stack

- **Frontend**: React 18 + Vite, MUI v5, Framer Motion
- **Backend**: Node.js, Express, MongoDB, Mongoose
- **AI**: OpenAI GPT-4, TTS, Web Speech API
- **Styling**: Cyan theme (#06b6d4), dark/light mode
- **Deployment**: Docker, Docker Compose

## Getting Started

```bash
# One-shot bootstrap from repo root
npm install

# Start both servers in watch mode
npm start

# Docker option
docker compose up --build
```

Frontend: http://localhost:5173
Backend API: http://localhost:4000

## Project Structure

```
BabelGeek/
├── backend/
│   ├── content/           # JSON lesson and path definitions
│   │   ├── lessons/
│   │   │   ├── spanish/
│   │   │   └── french/
│   │   └── paths/
│   ├── src/
│   │   ├── models/        # MongoDB schemas
│   │   ├── routes/        # API endpoints
│   │   ├── controllers/   # Request handlers
│   │   └── services/      # Business logic, TTS, AI
│   └── scripts/           # Content sync, utilities
├── frontend/
│   ├── src/
│   │   ├── components/    # Reusable UI components
│   │   ├── pages/         # Route pages
│   │   ├── templates/     # Lesson template renderers
│   │   ├── contexts/      # React contexts (auth, theme)
│   │   └── services/      # API client
│   └── public/            # Static assets, PWA files
└── DOCS/
    └── THE_PLAN.md        # Development roadmap
```

## Development Roadmap

See [DOCS/THE_PLAN.md](./DOCS/THE_PLAN.md) for the complete phased development plan.

### Current Phase: 1 - Foundation & Project Setup
- [x] Project scaffolding from template
- [x] Branding and theme configuration
- [ ] Core MongoDB models (Language, Lesson, LearningPath)
- [ ] Content sync pipeline
- [ ] Initial Spanish A1 lessons

## Color Theme

BabelGeek uses the FitnessGeek-inspired cyan color palette:

| Color     | Hex       | Usage                |
|-----------|-----------|----------------------|
| Primary   | `#06b6d4` | Buttons, links, accents |
| Primary Light | `#22d3ee` | Hover states, highlights |
| Secondary | `#64748b` | Muted text, borders |
| Background (Dark) | `#0f172a` | Dark mode base |
| Background (Light) | `#f8fafc` | Light mode base |

## License

Private - Geek Suite
