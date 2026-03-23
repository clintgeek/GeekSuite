# GuitarGeek - Using External PostgreSQL

## Configuration Updated ✅

The project has been reconfigured to use your existing PostgreSQL server instead of a containerized database.

### Connection Details

**PostgreSQL Server:**

- Host: `localhost`
- Port: `55432`
- Database: `guitargeek` (dedicated database for this project)
- User: `datageek_pg_admin`
- Password: `REDACTED`

### What Changed

1. **Removed** the `db` service from `docker-compose.yml`
2. **Updated** `.env` with your PostgreSQL credentials
3. **Updated** `backend/database.json` for migrations
4. **Configured** Docker containers to use `host.docker.internal` to access your local PostgreSQL

### Setup Instructions

#### 1. Create Database & Run Migrations

Run the automated setup script:

```bash
./setup-database.sh
```

Or manually:

```bash
# Create database
PGPASSWORD=REDACTED psql -h localhost -p 55432 -U datageek_pg_admin -d datageek -c "CREATE DATABASE guitargeek;"

# Run migrations
cd backend
npm run migrate:up
```

#### 2. Start Application

```bash
docker-compose up -d --build
```

This starts:

- **Backend** on port 3001
- **Frontend** on port 3000

#### 3. Verify Backend is Running

```bash
# Check container status
docker-compose ps

# Check backend logs
docker-compose logs backend

# Test API health
curl http://localhost:3001/health
```

### Database Management

**Connect to database:**

```bash
PGPASSWORD=REDACTED psql -h localhost -p 55432 -U datageek_pg_admin -d guitargeek
```

**View tables:**

```sql
\dt
```

**View sample data:**

```sql
SELECT * FROM users;
SELECT * FROM lessons;
SELECT * FROM achievements;
```

**Reset database (if needed):**

```bash
cd backend
npm run migrate:down
npm run migrate:up
```

### Environment Variables

All database configuration is in `.env`:

```bash
POSTGRES_HOST=localhost
POSTGRES_PORT=55432
POSTGRES_USER=datageek_pg_admin
POSTGRES_PASSWORD=REDACTED
POSTGRES_DB=guitargeek
DATABASE_URL=postgres://datageek_pg_admin:REDACTED@localhost:55432/guitargeek
```

### Docker Compose Changes

The `docker-compose.yml` now:

- ✅ Removed PostgreSQL container (using your external server)
- ✅ Backend connects via `host.docker.internal`
- ✅ Environment variables passed to containers
- ✅ Volume mounts for hot-reloading

### Troubleshooting

**Backend container not starting:**

```bash
docker-compose logs backend
```

**Database connection issues:**

1. Verify PostgreSQL is running on port 55432
2. Check firewall allows connections
3. Ensure `guitargeek` database exists:
   ```bash
   PGPASSWORD=REDACTED psql -h localhost -p 55432 -U datageek_pg_admin -d datageek -c "\l" | grep guitargeek
   ```

**Migration errors:**

```bash
cd backend
# Check connection
PGPASSWORD=REDACTED psql -h localhost -p 55432 -U datageek_pg_admin -d guitargeek -c "SELECT 1;"

# Re-run migrations
npm run migrate:up
```

### Next Steps

1. ✅ Database created and migrated
2. ✅ Docker containers configured
3. 🔄 Start containers: `docker-compose up -d`
4. 🧪 Test API: `curl http://localhost:3001/api/lessons`
5. 🚀 Continue with Phase 3 (Frontend) or test the API

---

**Note:** Your PostgreSQL server on port 55432 now hosts the `guitargeek` database with all tables and seed data ready to use!
