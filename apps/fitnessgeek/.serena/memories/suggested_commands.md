# FitnessGeek Development Commands

## Prerequisites
- Node.js 18+ LTS (use `nvm use --lts`)
- npm or yarn package manager
- MongoDB running (via Docker or local)

## Frontend Commands

### Development
```bash
cd frontend
npm install           # Install dependencies
npm run dev          # Start Vite dev server (default: http://localhost:5174)
```

### Build & Preview
```bash
npm run build        # Build for production
npm run preview      # Preview production build
```

### Code Quality
```bash
npm run lint         # Run ESLint
```

## Backend Commands

### Development
```bash
cd backend
npm install          # Install dependencies
npm run dev          # Start with nodemon (auto-reload)
npm start            # Start production server
```

### Testing
```bash
npm test             # Run Jest tests
node test-*.js       # Run specific test files
```

### Utilities
```bash
node scripts/importWeight.js           # Import weight data
node scripts/importBloodPressureSimple.js  # Import BP data
node scripts/migrateUserIds.js        # Migrate user IDs
```

## Docker Commands (on server)

### Container Management
```bash
cd /mnt/Media/Docker/fitnessGeek
docker compose up -d              # Start all services
docker compose down               # Stop all services
docker compose restart frontend   # Restart specific service
docker compose restart backend
docker compose logs -f            # View logs
docker compose ps                 # View running containers
```

### Rebuilding (after code changes)
```bash
docker compose down
docker compose build
docker compose up -d
```

## Important Notes
- **Node Version**: Always use Node.js LTS (v18+). Run `nvm use --lts` before starting servers
- **Dev Port**: Frontend dev server runs on port 5174 (NOT 5000)
- **Hot Reload**: Docker containers DO NOT support hot-reload - rebuilds required
- **Build Responsibility**: Chef (user) handles ALL builds, never Sage (AI)
- **Server Operations**: Chef manages ALL server start/stop/restart operations
- **Git**: Chef handles ALL version control operations

## System Utilities (macOS)
```bash
ls -la               # List files with details
find . -name "*.js"  # Find files
grep -r "pattern" .  # Search in files
cat file.txt         # View file contents
tail -f logs/app.log # Follow log file
```