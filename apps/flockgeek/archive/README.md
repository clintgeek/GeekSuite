# FlockGeek 🐔

A specialized flock management application for small to mid-sized poultry keepers. FlockGeek helps you track individual birds, genetics, breeding plans, infrastructure usage, and performance metrics to guide data-driven decisions while preventing inbreeding and optimizing hatch outcomes.

## Features

### Core Functionality
- **Individual Bird Profiles**: Track detailed information about each bird including breed, lineage, health history, and performance
- **Genetics & Lineage Tracking**: Automatic family tree generation with inbreeding alerts and genetic diversity monitoring
- **Breeding Management**: Plan optimal pairings, track breeding outcomes, and manage genetic diversity
- **Hatch & Grow-out Statistics**: Monitor hatch rates, cockerel/pullet ratios, and survivability rates
- **Infrastructure Tracking**: Manage coops, tractors, pens, and brooders with occupancy and cleaning schedules
- **Performance Metrics**: Track egg production, growth rates, and temperament scores
- **Reports & Visualizations**: View yearly performance, hatch trends, production charts, and family tree graphs

### Data Management
- **Bird Management**: Create, edit, and track individual birds with detailed profiles
- **Group Management**: Organize birds into groups for easier management
- **Egg Production Tracking**: Log and analyze egg production at both individual and group levels
- **Breeding Pairs**: Configure and track breeding pairs and their outcomes
- **Hatch Events**: Record hatching activities and outcomes
- **Health Records**: Track illnesses, injuries, treatments, and vaccinations

## Tech Stack

### Backend
- **Runtime**: Node.js with Express.js
- **Database**: MongoDB
- **Key Dependencies**:
  - Express ^4.19.2
  - Mongoose ^8.5.1
  - CORS ^2.8.5
  - Morgan ^1.10.0

### Frontend
- **Framework**: React 18.3.1
- **Build Tool**: Vite 7.1.2
- **UI Library**: Material-UI (@mui/material ^5.15.20)
- **Routing**: React Router DOM ^6.26.2
- **Styling**: Emotion (@emotion/react, @emotion/styled)

## Repository Structure

```
FlockGeek/
├── backend/          # Node.js Express API server
│   ├── src/
│   │   ├── server.js      # Entry point
│   │   ├── routes/        # API routes
│   │   ├── models/        # MongoDB models
│   │   ├── config/        # Configuration
│   │   └── middleware/    # Middleware (auth, etc.)
│   └── package.json
├── frontend/         # React web application
│   ├── src/
│   │   ├── main.jsx       # Entry point
│   │   ├── components/    # React components
│   │   ├── pages/         # Page components
│   │   └── theme.js       # MUI theme configuration
│   └── package.json
├── DOCS/             # Documentation and planning
└── docker-compose.yml # Docker deployment configuration
```

## Getting Started

### Prerequisites
- Node.js (latest LTS version recommended)
- MongoDB instance
- npm or yarn package manager

### Quick Start (Development)

1. **Clone the repository**:
   ```bash
   git clone https://github.com/clintgeek/FlockGeek.git
   cd FlockGeek
   ```

2. **Install dependencies** (installs both backend and frontend):
   ```bash
   npm install
   ```

3. **Configure the backend**:
   Create a `.env` file in the `backend/` directory:
   ```env
   PORT=5001
   MONGODB_URI=your_mongodb_connection_string
   CORS_ORIGINS=http://localhost:5173
   ```

4. **Start the development servers**:
   ```bash
   npm start
   ```
   
   This will start both the backend API (on port 5001) and frontend dev server (on port 5173).

### Running Backend and Frontend Separately

#### Backend Only
```bash
cd backend
npm install
npm run dev
```
The backend API will be available at `http://localhost:5001`

#### Frontend Only
```bash
cd frontend
npm install
npm run dev
```
The frontend will be available at `http://localhost:5173`

### API Health Check
```bash
curl http://localhost:5001/api/health
```

## API Endpoints

The backend exposes RESTful endpoints under `/api/flockgeek/v1/`:

- `/birds` - Bird management (CRUD operations)
- `/groups` - Group management
- `/egg-production` - Egg production tracking
- `/pairings` - Breeding pair management
- `/hatch-events` - Hatch event tracking
- `/metrics` - Performance metrics
- `/events` - General event logging

### Authentication (Development)
Include the `X-Owner-Id` header in your requests:
```
X-Owner-Id: demo-owner
```

## Docker Deployment

For production deployment using Docker:

1. **Set up environment variables**:
   ```bash
   cp env.example .env
   # Edit .env with your production values
   ```

2. **Deploy using the deployment script**:
   ```bash
   ./deploy.sh
   ```

For detailed Docker deployment instructions, see [DOCKER_DEPLOYMENT.md](DOCKER_DEPLOYMENT.md).

## Data Model

The application uses MongoDB with the following main collections:

- **birds**: Individual bird profiles with breed, lineage, and status
- **groups**: Collections of birds for management purposes
- **egg_production**: Tracking of egg production metrics
- **pairings**: Breeding pairs/groups configuration
- **hatch_events**: Records of hatching activities and outcomes
- **infrastructure_spaces**: Physical spaces for birds (coops, tractors, etc.)

## Development Roadmap

### Phase 1: Backend Scaffolding ✅
- Collections, validation, seeds, lineage cache, statistics aggregates

### Phase 2: Frontend MVP (In Progress)
- Bird CRUD, logs, simple charts, QR deep links

### Phase 3: Breeding Planner
- Pairing suggestions, eggs-needed calculator, reservations

### Phase 4: Infrastructure & Feed
- Spaces, assignments, cleaning cycles, feed logs and comparisons

### Phase 5: Advanced Reports & Family Tree
- Graph visualization, leaderboards, seasonal insights

## Documentation

- [PLANNING.md](DOCS/PLANNING.md) - Detailed project planning, features, and vision
- [Backend README](backend/README.md) - Backend-specific setup and API documentation
- [Frontend README](frontend/README.md) - Frontend-specific setup and configuration
- [Docker Deployment Guide](DOCKER_DEPLOYMENT.md) - Production deployment instructions

## Contributing

This project is in active development. For questions or contributions, please open an issue or pull request.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Author

Created by Clint Crocker

---

**Note**: FlockGeek is designed to be mobile-first and will support offline-friendly features in future releases.
