---
description: Repository Information Overview
alwaysApply: true
---

# Repository Information Overview

## Repository Summary
FlockGeek is a specialized flock management application for small to mid-sized poultry keepers. It tracks individual birds, genetics, breeding plans, infrastructure usage, and performance metrics to guide data-driven decisions while preventing inbreeding and optimizing hatch outcomes.

## Repository Structure
- **backend/**: Node.js Express API server with MongoDB integration
- **frontend/**: React-based web application using Vite
- **DOCS/**: Project documentation and planning materials

### Main Repository Components
- **Backend API**: RESTful service for data management with MongoDB
- **Frontend UI**: React-based responsive web interface with Material UI
- **Documentation**: Planning documents and API specifications

## Projects

### Backend (Node.js API)
**Configuration File**: package.json

#### Language & Runtime
**Language**: JavaScript (ES Modules)
**Version**: Node.js
**Package Manager**: npm

#### Dependencies
**Main Dependencies**:
- express: ^4.19.2
- mongoose: ^8.5.1
- cors: ^2.8.5
- dotenv: ^16.4.5
- morgan: ^1.10.0

#### Build & Installation
```bash
cd backend
npm install
npm run dev
```

#### Main Files
- **Entry Point**: src/server.js
- **Routes**: src/routes/*.js
- **Models**: src/models/*.js
- **Configuration**: src/config/*.js
- **Middleware**: src/middleware/auth.js

### Frontend (React Application)
**Configuration File**: package.json

#### Language & Runtime
**Language**: JavaScript/JSX (ES Modules)
**Version**: React 18.3.1
**Build System**: Vite 7.1.2
**Package Manager**: npm

#### Dependencies
**Main Dependencies**:
- react: ^18.3.1
- react-dom: ^18.3.1
- react-router-dom: ^6.26.2
- @mui/material: ^5.15.20
- @emotion/react: ^11.13.0
- @emotion/styled: ^11.13.0

**Development Dependencies**:
- @vitejs/plugin-react: ^4.3.1
- vite: ^7.1.2

#### Build & Installation
```bash
cd frontend
npm install
npm run dev
```

#### Main Files
- **Entry Point**: src/main.jsx
- **Components**: src/components/*.jsx
- **Pages**: src/pages/*.jsx
- **Theme**: src/theme.js

## Data Model
The application uses MongoDB with collections for:
- birds: Individual bird profiles with breed, lineage, and status
- groups: Collections of birds for management purposes
- egg_production: Tracking of egg production metrics
- pairings: Breeding pairs/groups configuration
- hatch_events: Records of hatching activities and outcomes
- infrastructure_spaces: Physical spaces for birds (coops, tractors, etc.)

## API Endpoints
The backend exposes RESTful endpoints under `/api/flockgeek/v1/`:
- `/birds`: Bird management
- `/groups`: Group management
- `/egg-production`: Egg production tracking
- `/pairings`: Breeding pair management
- `/hatch-events`: Hatch event tracking
- `/metrics`: Performance metrics
- `/events`: General event logging