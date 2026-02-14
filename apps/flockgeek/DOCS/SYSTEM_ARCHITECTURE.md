# 🗺️ FlockGeek System Architecture & Data Flow

## Complete System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        USER'S BROWSER                               │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
        ┌────────────────────────────────────┐
        │  Frontend (Vite React App)          │
        │  http://localhost:5173              │
        ├────────────────────────────────────┤
        │                                    │
        │  App.jsx                           │
        │  ├─ /login → LoginPage             │
        │  └─ / (Protected)                  │
        │     ├─ /birds → BirdsPage ✅       │
        │     ├─ /groups → GroupsPage ✅     │
        │     ├─ /locations → Locations ✅   │
        │     ├─ /pairings → Pairings ✅     │
        │     ├─ /egg-log → EggLogPage ✅    │
        │     ├─ /hatch-log → HatchLog ✅    │
        │     └─ /dashboard → Dashboard      │
        │                                    │
        │  AuthContext.jsx                   │
        │  ├─ geek_token (localStorage)      │
        │  ├─ geek_refresh_token             │
        │  └─ ownerId                        │
        │                                    │
        │  apiClient.js (Axios)              │
        │  ├─ Request Interceptor            │
        │  │  ├─ Authorization header        │
        │  │  └─ X-Owner-Id header           │
        │  └─ Response Interceptor           │
        │     └─ Handle 401 + Token Refresh  │
        │                                    │
        └────────┬─────────────────────────┘
                 │ HTTP Requests
                 │ (with Authorization + X-Owner-Id)
                 ▼
        ┌────────────────────────────────────┐
        │  Backend (Express Node.js)         │
        │  http://localhost:5001/api         │
        ├────────────────────────────────────┤
        │                                    │
        │  Routes:                           │
        │  ├─ /auth                          │
        │  │  ├─ POST /register              │
        │  │  ├─ POST /login                 │
        │  │  ├─ GET /me (requireAuth)       │
        │  │  ├─ POST /refresh               │
        │  │  └─ POST /logout                │
        │  │                                 │
        │  ├─ /birds (requireOwner)          │
        │  │  ├─ GET / (list + paginate)     │
        │  │  ├─ POST / (create)             │
        │  │  ├─ GET /:id (get)              │
        │  │  ├─ PUT /:id (update)           │
        │  │  └─ DELETE /:id (soft-delete)   │
        │  │                                 │
        │  ├─ /groups (same pattern)         │
        │  ├─ /locations (same pattern)      │
        │  ├─ /pairings (same pattern)       │
        │  ├─ /egg-production (same pattern) │
        │  ├─ /hatch-events (same pattern)   │
        │  └─ /health-records (same pattern) │
        │                                    │
        │  Middleware:                       │
        │  ├─ CORS (allow from :5173)        │
        │  ├─ JSON parser                    │
        │  ├─ Morgan (logging)               │
        │  ├─ requireAuth (JWT validation)   │
        │  └─ requireOwner (ownerId extract) │
        │                                    │
        │  Controllers:                      │
        │  ├─ authController                 │
        │  ├─ birdController                 │
        │  ├─ groupController                │
        │  ├─ locationController             │
        │  ├─ pairingController              │
        │  ├─ eggProductionController        │
        │  ├─ hatchEventController           │
        │  └─ healthRecordController         │
        │                                    │
        │  Utils:                            │
        │  ├─ tokenService (JWT)             │
        │  └─ logger                         │
        │                                    │
        └────────┬─────────────────────────┘
                 │ MongoDB Driver
                 │ (Mongoose ORM)
                 ▼
        ┌────────────────────────────────────┐
        │  MongoDB (Database)                 │
        │  mongodb://localhost:27017          │
        ├────────────────────────────────────┤
        │                                    │
        │  Database: flockgeek               │
        │                                    │
        │  Collections:                      │
        │  ├─ birds                          │
        │  │  ├─ _id (ObjectId)              │
        │  │  ├─ ownerId (indexed)           │
        │  │  ├─ tagId (unique per owner)    │
        │  │  ├─ name, sex, breed            │
        │  │  ├─ hatchDate                   │
        │  │  ├─ sireId, damId (refs)        │
        │  │  ├─ locationId (ref)            │
        │  │  ├─ status (active/retired/etc) │
        │  │  ├─ temperamentScore            │
        │  │  ├─ createdAt, updatedAt        │
        │  │  └─ deletedAt (soft-delete)     │
        │  │                                 │
        │  ├─ groups                         │
        │  │  ├─ _id, ownerId (indexed)      │
        │  │  ├─ name, purpose, type         │
        │  │  ├─ startDate, endDate          │
        │  │  └─ [timestamps + soft-delete]  │
        │  │                                 │
        │  ├─ locations                      │
        │  │  ├─ _id, ownerId (indexed)      │
        │  │  ├─ name, type, capacity        │
        │  │  ├─ cleaningIntervalDays        │
        │  │  └─ [timestamps + soft-delete]  │
        │  │                                 │
        │  ├─ pairings                       │
        │  │  ├─ _id, ownerId (indexed)      │
        │  │  ├─ name, season, seasonYear    │
        │  │  ├─ roosterIds[], henIds[]      │
        │  │  ├─ goals[], active             │
        │  │  └─ [timestamps + soft-delete]  │
        │  │                                 │
        │  ├─ eggproductions                 │
        │  │  ├─ _id, ownerId (indexed)      │
        │  │  ├─ date, eggsCount             │
        │  │  ├─ eggColor, eggSize, quality  │
        │  │  ├─ source, groupId, birdId     │
        │  │  └─ [timestamps + soft-delete]  │
        │  │                                 │
        │  ├─ hatchevents                    │
        │  │  ├─ _id, ownerId (indexed)      │
        │  │  ├─ pairingId (ref)             │
        │  │  ├─ setDate, hatchDate          │
        │  │  ├─ eggsSet, eggsFertile        │
        │  │  ├─ chicksHatched, pullets      │
        │  │  ├─ cockerels, mortalityByDay   │
        │  │  └─ [timestamps + soft-delete]  │
        │  │                                 │
        │  ├─ healthrecords                  │
        │  │  ├─ _id, ownerId (indexed)      │
        │  │  ├─ birdId (ref)                │
        │  │  ├─ eventDate, type             │
        │  │  ├─ diagnosis, treatment        │
        │  │  ├─ outcome, vet, costCents     │
        │  │  └─ [timestamps + soft-delete]  │
        │  │                                 │
        │  ├─ [GroupMembership, BirdTrait,   │
        │  │   BirdNote, Event, LineageCache]│
        │  │                                 │
        │  └─ Indexes:                       │
        │     ├─ ownerId (all collections)   │
        │     ├─ deletedAt (all collections) │
        │     ├─ tagId (birds)               │
        │     ├─ date (eggproduction)        │
        │     └─ setDate (hatchevents)       │
        │                                    │
        └────────────────────────────────────┘
```

---

## Authentication Flow Diagram

```
User
  │
  ├─ Opens http://localhost:5173
  │                │
  │                ├─ App.jsx checks isLoading
  │                ├─ AuthContext calls GET /auth/me
  │                ├─ If token in localStorage, use it
  │                └─ If not logged in, redirect to /login
  │
  └─ LoginPage Shown
       │
       ├─ Click "Sign In"
       │    │
       │    └─ POST /auth/login
       │         │
       │         ├─ Forward to BaseGeek
       │         ├─ BaseGeek returns geek_token + geek_refresh_token
       │         ├─ Store in localStorage
       │         └─ Store ownerId from response
       │
       ├─ AuthContext updated
       │    │
       │    └─ isAuthenticated = true
       │
       └─ Redirect to home page
            │
            └─ ProtectedRoute allows access
                 │
                 └─ User sees dashboard

Accessing Data Pages
  │
  ├─ GET /api/birds
  │    │
  │    ├─ apiClient Interceptor
  │    │    ├─ Add Authorization header
  │    │    │  (Bearer geek_token)
  │    │    └─ Add X-Owner-Id header
  │    │       (from localStorage)
  │    │
  │    ├─ Backend Receives
  │    │    ├─ Check Authorization header
  │    │    ├─ Extract X-Owner-Id
  │    │    └─ Query birds WHERE ownerId = X-Owner-Id
  │    │
  │    └─ Response
  │         ├─ 200 OK with data
  │         └─ Display in BirdsPage table
  │
  ├─ Token Expires
  │    │
  │    ├─ Next API call returns 401
  │    │    │
  │    │    └─ apiClient interceptor catches 401
  │    │
  │    ├─ POST /auth/refresh
  │    │    ├─ Send geek_refresh_token
  │    │    └─ BaseGeek returns new geek_token
  │    │
  │    ├─ Update localStorage
  │    │    └─ Store new geek_token
  │    │
  │    └─ Retry original request
  │         └─ Now succeeds with new token
  │
  └─ Logout
       │
       ├─ Click Logout button
       │    │
       │    └─ AuthContext.logout()
       │
       ├─ Clear localStorage
       │    └─ Remove geek_token, geek_refresh_token, ownerId
       │
       ├─ Redirect to /login
       │    │
       │    └─ ProtectedRoute blocks access
       │
       └─ User must login again
```

---

## Data Flow for Single Page Load

### Example: Loading Birds Page

```
User clicks "Birds" in Navigation
         │
         ▼
Navigate to /birds
         │
         ▼
App.jsx ProtectedRoute
  ├─ Check isAuthenticated (true)
  ├─ Check isLoading (false)
  └─ Render BirdsPage
         │
         ▼
BirdsPage Component Mount
  ├─ useState for: birds, loading, error, page, rowsPerPage, total, filters
  ├─ useEffect with dependencies: [page, rowsPerPage, filters]
  └─ Call fetchBirds()
         │
         ▼
fetchBirds() Function
  ├─ Set loading = true
  ├─ Build params:
  │  ├─ page = 1 (0-indexed to 1-indexed)
  │  ├─ limit = 10 (rowsPerPage)
  │  └─ ...filters (status, sex, breed, search)
  │
  ├─ client.get('/birds', { params })
  │    │
  │    ▼
  │  apiClient.js - Request Interceptor
  │    ├─ Add headers:
  │    │  ├─ Authorization: Bearer geek_token
  │    │  └─ X-Owner-Id: ownerId
  │    │
  │    └─ Send to backend
  │
  ├─ Backend receives GET /birds
  │    │
  │    ▼
  │  Express Router (birds.js)
  │    ├─ Middleware: requireOwner
  │    │  └─ Extract X-Owner-Id from header
  │    │  └─ Set req.ownerId
  │    │
  │    └─ Handler: list birds
  │
  ├─ birdController.listBirds()
  │    ├─ Extract ownerId, page, limit, filters from request
  │    ├─ Build MongoDB query:
  │    │  ├─ ownerId: req.ownerId (required)
  │    │  ├─ deletedAt: { $exists: false } (soft-delete filter)
  │    │  ├─ status: filters.status (if provided)
  │    │  ├─ sex: filters.sex (if provided)
  │    │  ├─ breed: filters.breed (if provided)
  │    │  └─ $or: [ { name }, { tagId } ] (search)
  │    │
  │    ├─ Count total matching documents
  │    ├─ Skip (page - 1) * limit
  │    ├─ Limit to limit documents
  │    ├─ Sort by _id descending
  │    └─ Return response
  │
  ├─ Backend Response
  │    └─ {
  │       "data": {
  │         "birds": [ {...}, {...}, ... ],
  │         "pagination": {
  │           "total": 42,
  │           "page": 1,
  │           "limit": 10,
  │           "pages": 5
  │         }
  │       }
  │     }
  │
  ▼
apiClient.js - Response Interceptor
  ├─ Check status (200 OK)
  └─ Return response data
         │
         ▼
BirdsPage - Handle Response
  ├─ setBirds(response.data.data.birds)
  ├─ setTotal(response.data.data.pagination.total)
  ├─ setLoading(false)
  └─ setError("")
         │
         ▼
Re-render BirdsPage
  ├─ Table with birds data
  ├─ Pagination controls
  ├─ Filter controls
  └─ Delete buttons
         │
         ▼
User sees BirdsPage with data! ✅
```

---

## Multi-Tenancy Isolation

```
Request from User A
  │
  ├─ GET /birds
  │  ├─ Authorization: Bearer [User A's Token]
  │  └─ X-Owner-Id: [User A's ID]
  │
  ▼
Backend requireOwner Middleware
  ├─ Extract X-Owner-Id = "user-a-id"
  ├─ Set req.ownerId = "user-a-id"
  └─ Continue to handler
       │
       ▼
  birdController.listBirds()
       ├─ Build query: { ownerId: "user-a-id", deletedAt: { $exists: false } }
       └─ MongoDB query
            │
            ├─ Find birds WHERE:
            │  ├─ ownerId = "user-a-id"
            │  └─ deletedAt is NOT set
            │
            └─ Return only User A's birds
                 │
                 └─ User A sees: [Bird 1, Bird 2, Bird 3] (only theirs)

Request from User B (simultaneous)
  │
  ├─ GET /birds
  │  ├─ Authorization: Bearer [User B's Token]
  │  └─ X-Owner-Id: [User B's ID]
  │
  ▼
Backend requireOwner Middleware
  ├─ Extract X-Owner-Id = "user-b-id"
  ├─ Set req.ownerId = "user-b-id"
  └─ Continue to handler
       │
       ▼
  birdController.listBirds()
       ├─ Build query: { ownerId: "user-b-id", deletedAt: { $exists: false } }
       └─ MongoDB query
            │
            ├─ Find birds WHERE:
            │  ├─ ownerId = "user-b-id"
            │  └─ deletedAt is NOT set
            │
            └─ Return only User B's birds
                 │
                 └─ User B sees: [Bird 4, Bird 5] (only theirs)

Result:
  ✅ Complete isolation
  ✅ No data leakage between users
  ✅ Each user sees only their data
```

---

## Soft-Delete Pattern

```
User clicks Delete on Bird "Henny"
         │
         ▼
BirdsPage handleDeleteBird()
  ├─ Confirm dialog
  └─ client.delete(`/birds/${id}`)
         │
         ▼
Backend DELETE /birds/:id
  ├─ requireOwner middleware
  │  └─ Verify ownerId owns this bird
  │
  ├─ birdController.deleteBird()
  │  ├─ Find bird by _id AND ownerId
  │  ├─ Set bird.deletedAt = new Date()
  │  ├─ SAVE (don't delete)
  │  └─ Return success
  │
  └─ Response: { success: true }
         │
         ▼
BirdsPage
  ├─ Remove from UI immediately
  ├─ Call fetchBirds() to refresh
  └─ Table re-renders without deleted bird
         │
         ▼
User sees: Bird "Henny" removed from table ✅

Database Reality:
  ├─ Bird document still exists in MongoDB
  ├─ deletedAt field = "2024-01-15T10:30:00Z"
  ├─ All queries now exclude where deletedAt exists
  └─ Data is recoverable if needed

Benefits:
  ✅ Audit trail (know when deleted)
  ✅ Soft recovery (can restore)
  ✅ Referential integrity (don't orphan related records)
  ✅ Compliance (keep historical data)
```

---

## Page Component Pattern

```
BirdsPage Component Structure:
  │
  ├─ State Variables
  │  ├─ birds: [] (data from API)
  │  ├─ loading: false (loading state)
  │  ├─ error: "" (error message)
  │  ├─ page: 0 (current page, 0-indexed)
  │  ├─ rowsPerPage: 10 (pagination)
  │  ├─ total: 0 (total count from API)
  │  └─ filters: { status: "", sex: "", breed: "", q: "" }
  │
  ├─ API Call Function: fetchBirds()
  │  ├─ Set loading = true
  │  ├─ Build params with filters + pagination
  │  ├─ Call client.get('/birds', { params })
  │  ├─ Update birds, total
  │  └─ Handle errors
  │
  ├─ useEffect Hook
  │  ├─ Dependencies: [page, rowsPerPage, filters]
  │  ├─ Call fetchBirds() when any dependency changes
  │  └─ Auto-refresh when user changes filters/pagination
  │
  ├─ Event Handlers
  │  ├─ handleDeleteBird(id) → Call API delete, refresh
  │  ├─ handleChangePage() → Update page state
  │  ├─ handleChangeRowsPerPage() → Update rowsPerPage state
  │  └─ Filter change handlers → Update filters state
  │
  ├─ UI Layers
  │  ├─ Header (Title + Add Button)
  │  ├─ Error Alert (if error exists)
  │  ├─ Filter Controls (search, dropdowns)
  │  ├─ Loading Spinner (if loading)
  │  ├─ Data Table (with columns and actions)
  │  └─ Pagination Control
  │
  └─ Render Flow
     ├─ Component mounts → useEffect fires → fetchBirds()
     ├─ Loading = true → Show spinner
     ├─ API returns → Update state
     ├─ Component re-renders → Show table
     ├─ User changes filter → Filter state updates
     ├─ useEffect detects change → fetchBirds() again
     └─ New data loads → Table updates

Pattern is identical for all 6 pages:
  ├─ BirdsPage
  ├─ GroupsPage
  ├─ LocationsPage
  ├─ PairingsPage
  ├─ EggLogPage
  └─ HatchLogPage
```

---

## Technology Stack Summary

```
Frontend Stack:
  ├─ React 18.3.1
  ├─ React Router 6 (routing)
  ├─ Material-UI 5.15.20 (components)
  ├─ Axios 1.7.2 (HTTP)
  └─ Vite 5.4.20 (build tool)

Backend Stack:
  ├─ Express 4.19.2 (web server)
  ├─ Mongoose 8.5.1 (MongoDB ORM)
  ├─ Node.js 20+ (runtime)
  ├─ Axios 1.12.2 (for BaseGeek calls)
  ├─ Helmet (security headers)
  ├─ CORS (cross-origin support)
  └─ Morgan (request logging)

Database Stack:
  ├─ MongoDB 8.5+ (NoSQL database)
  ├─ 12 Collections (data models)
  ├─ Indexes (performance)
  └─ Soft-delete pattern (data retention)

Auth Stack:
  ├─ BaseGeek (external auth service)
  ├─ JWT (token format)
  ├─ localStorage (token storage)
  └─ Axios interceptors (auto header injection)
```

---

## System Status Summary

```
✅ RUNNING
  ├─ Backend: http://localhost:5001
  ├─ Frontend: http://localhost:5173
  ├─ MongoDB: localhost:27017
  └─ BaseGeek: https://basegeek.clintgeek.com

✅ FEATURES
  ├─ Authentication
  ├─ Data Pages (6 total)
  ├─ Filtering & Pagination
  ├─ Soft-Delete
  ├─ Multi-Tenancy
  └─ Error Handling

✅ CODE
  ├─ 2,500+ lines frontend
  ├─ 8,000+ lines backend
  ├─ 12 database models
  ├─ 7 API controllers
  └─ Comprehensive documentation

⏳ IN PROGRESS
  ├─ CRUD dialog forms
  ├─ Detail pages
  └─ Dashboard

⏳ PENDING
  ├─ Docker configuration
  ├─ Production build
  └─ Deployment
```

---

This diagram provides a complete overview of how FlockGeek works at every level!

