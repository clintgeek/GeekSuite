# FlockGeek Backend

Dev server quickstart

1) Create `.env` in `backend/` (copy from values below):
```
PORT=5001
MONGODB_URI=mongodb://localhost:27017/datageek?authSource=admin
CORS_ORIGINS=http://localhost:5173,http://localhost:5002
```

2) Install and run:
```
cd backend
npm install
npm run dev
```

Health check:
```
GET http://localhost:5001/api/health
```

Auth header (dev): include your owner id
```
X-Owner-Id: demo-owner
```

Birds:
- POST http://localhost:5001/api/flockgeek/v1/birds
- GET http://localhost:5001/api/flockgeek/v1/birds

Groups:
- POST http://localhost:5001/api/flockgeek/v1/groups
- GET http://localhost:5001/api/flockgeek/v1/groups

Egg production (group-level):
- POST http://localhost:5001/api/flockgeek/v1/egg-production
