# GeekSuite

A self-hosted monorepo of interconnected productivity and lifestyle applications, built with a unified SSO authentication system and shared infrastructure.

## Apps

| App | Description | Stack |
|-----|-------------|-------|
| **BaseGeek** | Central hub — shared auth, user management, AI integration, and infrastructure services | Node.js, Express, MongoDB, PostgreSQL, InfluxDB, Redis |
| **NoteGeek** | Note-taking and knowledge management | React, Node.js, MongoDB |
| **BujoGeek** | Bullet journal and task management | React, Node.js, MongoDB |
| **FlockGeek** | Poultry flock management and egg production tracking | React, Node.js, MongoDB |
| **FitnessGeek** | Health and fitness tracking (weight, blood pressure, nutrition, Garmin integration) | React, Node.js, MongoDB, InfluxDB |
| **BookGeek** | Book library and reading tracker | React, Node.js, MongoDB |
| **BabelGeek** | Language learning platform | React, Node.js, MongoDB |
| **MusicGeek** | Guitar lesson and music learning companion | React, Node.js, PostgreSQL |
| **PhotoGeek** | Photography learning and project companion | React, Node.js, MongoDB |
| **StoryGeek** | Creative writing tool | React, Node.js, MongoDB |
| **StartGeek** | Dashboard and app launcher | React |

## Architecture

```
GeekSuite/
├── apps/                  # Individual applications
│   ├── basegeek/          # Central hub (auth, AI, databases)
│   ├── notegeek/          # Notes
│   ├── bujogeek/          # Bullet journal
│   ├── flockgeek/         # Flock management
│   ├── fitnessgeek/       # Fitness tracking
│   ├── bookgeek/          # Book tracking
│   ├── babelgeek/         # Language learning
│   ├── musicgeek/         # Music/guitar lessons
│   ├── photogeek/         # Photography
│   ├── storygeek/         # Creative writing
│   └── startgeek/         # Dashboard
├── packages/              # Shared libraries
│   ├── auth/              # Shared SSO authentication (React)
│   ├── ui/                # Shared UI components
│   └── user/              # Shared user utilities
├── build.sh               # Docker build & deploy script
└── pnpm-workspace.yaml    # pnpm monorepo config
```

### Unified SSO

All apps authenticate through **BaseGeek** as the central authority. A shared `@geeksuite/auth` package provides login UI and token management. SSO cookies (`.clintgeek.com`) enable seamless cross-app authentication.

### Infrastructure

- **MongoDB** — Primary data store for most apps
- **PostgreSQL** — Used by MusicGeek and BaseGeek metrics
- **InfluxDB** — Time-series data (Garmin health metrics)
- **Redis** — Session caching and rate limiting
- **Docker** — Each app builds to a container image via `build.sh`

## Getting Started

### Prerequisites

- **Node.js** 18+
- **pnpm**
- **Docker** and **Docker Compose**

### Setup

1. Clone the repo:
   ```bash
   git clone https://github.com/clintgeek/GeekSuite.git
   cd GeekSuite
   ```

2. Install dependencies:
   ```bash
   pnpm install
   ```

3. Configure environment variables:
   ```bash
   cp apps/basegeek/example.env apps/basegeek/.env
   # Edit .env with your actual credentials
   ```

4. Start infrastructure services:
   ```bash
   cd apps/basegeek
   docker compose up -d
   ```

5. Build and deploy apps:
   ```bash
   ./build.sh          # Interactive app selector
   ./build.sh --all    # Build everything
   ./build.sh notegeek # Build a single app
   ```

## Environment Variables

All credentials are loaded from `.env` files which are **gitignored**. See `apps/basegeek/example.env` for the full template. Never commit real credentials to the repository.

## License

This project is licensed under the [GNU General Public License v3.0](LICENSE).
