# Phase 1: Discovery & Environment Alignment – FINDINGS

## 1. Environment Variables Inventory

### Archive Backend (`.env`)
```
PORT=5001
MONGODB_URI=mongodb://localhost:27017/flockgeek?authSource=admin
CORS_ORIGINS=http://localhost:5173,http://localhost:5174,https://flockgeek.clintgeek.com
SEED_OWNER_ID=demo-owner
```

### Archive Frontend (`.env`)
```
VITE_API_BASE=http://localhost:5001/api/flockgeek/v1
```

### Template Backend Current Config (`config/env.js`)
```javascript
nodeEnv: process.env.NODE_ENV || "development",
port: Number(process.env.PORT) || 4000,
corsOrigin: process.env.CORS_ORIGIN || "http://localhost:5173",
jwtSecret: process.env.JWT_SECRET || "change-me"
```

### Archive-Specific Variables (inferred from code)
```
BASEGEEK_URL=https://basegeek.clintgeek.com
APP_NAME=flockgeek
NODE_ENV=development
```

## 2. Unified `.env.example` Template (to create at root)

```properties
# FlockGeek Application Configuration

# Server
NODE_ENV=development
PORT=5001

# Database
MONGODB_URI=mongodb://user:password@host:port/flockgeek?authSource=admin

# CORS
CORS_ORIGIN=http://localhost:5173,http://localhost:5174,https://flockgeek.clintgeek.com

# JWT Authentication
JWT_SECRET=your-jwt-secret-key-change-in-production

# BaseGeek Integration (Central Auth Service)
BASEGEEK_URL=https://basegeek.clintgeek.com
APP_NAME=flockgeek

# Seed Data
SEED_OWNER_ID=demo-owner

# Frontend API
VITE_API_BASE=http://localhost:5001/api/flockgeek/v1
```

## 3. Authentication Flow Analysis

### Current Archive Approach
- **Auth Service**: BaseGeek (external, centralized)
- **Routes**: Login, register, refresh, profile all forward to BaseGeek
- **Token Format**: JWT from BaseGeek
- **Token Storage**:
  - Frontend: `localStorage.geek_token` & `localStorage.geek_refresh_token`
  - Sent as: `Authorization: Bearer <token>` header
- **ownerId Handling**:
  - Extracted from JWT payload after BaseGeek login
  - Stored in: `localStorage.ownerId`
  - Sent as: `X-Owner-Id` header on API requests
  - Required for all data operations (birds, groups, etc.)

### Archive Middleware Pattern
```javascript
// authenticateToken(): Verifies JWT, extracts user info
req.user = { id, email, username }

// requireOwner(): Extracts ownerId from:
//   1. X-Owner-Id header (preferred)
//   2. req.body.ownerId
//   3. req.query.ownerId
// Sets req.ownerId for use in handlers
```

### Template Current Approach
- **tokenService**: Basic JWT issue/verify helpers
- **requireAuth**: Only validates Bearer token, sets `req.user`
- **Missing**: No ownerId extraction logic yet

## 4. Data Model Overview

### 12 Core Collections (from archive/backend/src/models/)
1. **Bird** – Individual bird profiles with lineage (sireId, damId, ownerId)
2. **BirdTrait** – Time-series physical trait logs (weight, feather color, etc.)
3. **HealthRecord** – Medical events (illness, treatment, vaccination)
4. **EggProduction** – Daily egg counts per bird or group
5. **Pairing** – Breeding pairs/triads with goals
6. **HatchEvent** – Incubation logs (set date, hatch date, results)
7. **Group** – Collections of birds (layer flock, breeding group, etc.)
8. **GroupMembership** – Tracks bird membership in groups over time
9. **Location** – Infrastructure spaces (tractors, coops, pens, brooders)
10. **Event** – Generic event log (not detailed in code yet)
11. **BirdNote** – Text notes attached to birds
12. **LineageCache** – Precomputed ancestry for fast inbreeding checks

### Key Design Constraints
- **All models include `ownerId`** (multi-tenant filtering)
- **Soft-delete pattern**: `deletedAt` field (don't hard-delete)
- **Indexes for fast queries**: e.g., `{ ownerId: 1, tagId: 1, unique }`
- **Timestamps**: `createdAt`, `updatedAt` (ISO UTC)
- **Relationships**: ObjectId references between birds (sireId → Bird, damId → Bird, etc.)

## 5. Request Flow Pattern

### Frontend → Backend
```
1. Frontend calls `/api/flockgeek/v1/birds` with:
   - Authorization: Bearer <token>
   - X-Owner-Id: demo-owner
   - Body/Query params

2. Backend middleware:
   - authenticateToken() → req.user
   - requireOwner() → req.ownerId

3. Handler:
   - Uses req.ownerId to filter data
   - { ownerId, deletedAt: { $exists: false }, ... }
```

## 6. API Route Structure (Archive)

### Current Routes (13 route files)
```
POST   /api/auth/login
POST   /api/auth/register
POST   /api/auth/refresh
GET    /api/auth/me

GET    /api/birds
POST   /api/birds
GET    /api/birds/:id
PUT    /api/birds/:id
DELETE /api/birds/:id

GET    /api/groups
POST   /api/groups
GET    /api/groups/:id
... (similar CRUD for each collection)
```

### Template Current Structure
```
GET    /api/health (healthcheck)
POST   /api/auth/login (stub in authRoutes)
```

## 7. Dependency Deltas

### Archive Backend `package.json`
```json
{
  "axios": "^1.12.2",
  "cors": "^2.8.5",
  "dotenv": "^16.4.5",
  "express": "^4.19.2",
  "jsonwebtoken": "^9.0.0",
  "mongoose": "^8.5.1",
  "morgan": "^1.10.0"
}
```

### Template Backend `package.json`
```json
{
  "bcryptjs": "^2.4.3",
  "cookie-parser": "^1.4.6",
  "cors": "^2.8.5",
  "dotenv": "^16.4.5",
  "express": "^4.19.2",
  "helmet": "^7.1.0",
  "jsonwebtoken": "^9.0.2",
  "morgan": "^1.10.0"
}
```

### Delta Analysis
- **Add**: `axios` (for BaseGeek API calls), `mongoose` (database ORM)
- **Keep**: `cors`, `dotenv`, `express`, `jsonwebtoken`, `morgan`
- **Remove**: `bcryptjs` (not needed—auth via BaseGeek), `cookie-parser` (not used), `helmet` (nice-to-have, keep)

### Archive Frontend `package.json` (sample)
- React, Vite, React Router, charting library (if any)
- Template likely has similar; verify during Phase 3

## 8. Build Scripts

### Archive Backend
```json
"dev": "node --env-file=.env src/server.js",
"start": "node src/server.js",
"seed": "node --env-file=.env src/scripts/seed.js"
```

### Template Backend
```json
"dev": "nodemon src/server.js",
"start": "node src/server.js"
```

### Action Items
- Add `mongoose` to template `package.json`
- Add `axios` for BaseGeek calls
- Update `dev` script to use nodemon or `--env-file=.env`
- Add `seed` script

## 9. Database Connection

### Archive Pattern
```javascript
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://...';
mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
```

### To Migrate
- Move MongoDB connection to `backend/src/server.js` (or separate connection file)
- Use `env.mongodbUri` from centralized config
- Add error handling & logging

## 10. Existing Data Considerations

### ⚠️ Important
- **Existing flockgeek database contains important data** on MongoDB instance at `192.168.1.17:27018`
- **Action**: Must preserve or back up before schema changes
- **Strategy**:
  1. Migrate code to new template structure first
  2. Test with seed data
  3. Perform data migration separately (schema validation, export/import if needed)

## 11. Local Dev Workflow Decision

### Recommended Approach
**Plain Node (no Docker for dev)**
- Faster iteration (no container build time)
- Direct access to MongoDB and BaseGeek
- `npm run dev` in `backend/` and `frontend/` separately
- Docker for deployment/testing only

### Alternative: Docker Compose for Full Stack
- Use `docker-compose.yml` for coordinated local dev
- Trade-off: slower but more production-like

**Recommendation**: Start with plain Node, Docker for production validation

## 12. Documentation Review

### Archive PLANNING.md
- ✅ Comprehensive data model definitions (13 collections documented)
- ✅ Domain terminology clear (bird breeding, genetics, hatch rate, etc.)
- ✅ Feature scope well-defined (genetic tracking, breeding planner, infrastructure)
- ✅ No breaking changes anticipated; model schema is stable

## Summary of Action Items

1. **Update `backend/package.json`**:
   - Add `mongoose` and `axios`
   - Update dev script to `nodemon src/server.js` or plain `node --env-file=.env src/server.js`
   - Add `seed` script

2. **Update `backend/config/env.js`**:
   - Add `mongodbUri`, `basegeekUrl`, `appName`
   - Keep `jwtSecret` (though BaseGeek provides tokens)

3. **Create `.env.example` at root** with all variables (see template above)

4. **Create MongoDB connection** in `backend/src/server.js` or separate module

5. **Backup existing MongoDB data** before any migration

6. **Create all 12 model files** in `backend/src/models/`

7. **Create auth routes** forwarding to BaseGeek

8. **Create requireOwner middleware** to extract & inject ownerId

9. **Consolidate 13 route files** into `/api/*` hierarchy

10. **Port seed script** with proper paths & env handling

---

**Phase 1 Status**: ✅ Complete. Ready for Phase 2 Backend Migration.
