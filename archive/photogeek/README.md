# PhotoGeek 📷

A photography learning and project companion app designed to help photography novices learn camera techniques through AI-guided projects and challenges.

## Features

- 🎯 **AI-Powered Photography Projects** - Creative challenges that teach specific techniques
- 📚 **Photography Knowledge Base** - Comprehensive guides on camera settings, composition, and techniques
- 📸 **EXIF Data Extraction** - Automatic camera settings verification from uploaded photos
- 🏆 **Gamification** - XP, achievements, skill trees, and streak tracking
- 🎓 **Progressive Learning** - From beginner to advanced photography skills
- 📱 **Mobile-First** - Optimized for on-the-go use with your camera

## Tech Stack

**Backend:**
- Node.js + Express
- MongoDB + Mongoose
- JWT Authentication
- OpenAI API (for AI features)
- EXIF extraction (exifr)

**Frontend:**
- React + Vite
- Material-UI (GeekSuite design system)
- React Router
- Axios

## Getting Started

### Prerequisites
- Node.js 18+
- MongoDB (local or Atlas)
- npm or yarn

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd photoGeek
   ```

2. **Install dependencies**
   ```bash
   npm run install:all
   ```

3. **Set up environment variables**
   ```bash
   cd backend
   cp .env.example .env
   # Edit .env with your MongoDB URI, JWT secret, and OpenAI API key
   ```

4. **Start MongoDB**
   ```bash
   # If using local MongoDB
   mongod
   ```

5. **Run the application**
   ```bash
   # From the root directory
   npm run dev
   ```

   This will start:
   - Backend API on http://localhost:4010
   - Frontend on http://localhost:5173

## Project Structure

```
photoGeek/
├── backend/
│   ├── src/
│   │   ├── config/         # Database and app configuration
│   │   ├── models/         # Mongoose models
│   │   ├── routes/         # Express routes
│   │   ├── controllers/    # Route controllers
│   │   ├── services/       # Business logic
│   │   ├── middleware/     # Custom middleware
│   │   └── server.js       # Express app entry point
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/     # Reusable UI components
│   │   ├── pages/          # Page components
│   │   ├── services/       # API services
│   │   ├── contexts/       # React contexts
│   │   ├── hooks/          # Custom hooks
│   │   ├── theme/          # Material-UI theme
│   │   ├── utils/          # Utility functions
│   │   ├── App.jsx         # Main app component
│   │   └── main.jsx        # React entry point
│   └── package.json
├── DOCS/
│   └── THE_PLAN.md         # Comprehensive project plan
└── package.json            # Root workspace configuration
```

## Development

- **Backend**: `npm run dev:backend`
- **Frontend**: `npm run dev:frontend`
- **Both**: `npm run dev`

## Documentation

See [DOCS/THE_PLAN.md](DOCS/THE_PLAN.md) for the comprehensive project plan, features roadmap, and technical architecture.

## License

MIT

---

**Built with ❤️ for photography learners everywhere**
