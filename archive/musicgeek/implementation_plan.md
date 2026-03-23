# Implementation Plan - Update Docker Configuration

## Goal Description

Update the `docker-compose.yml` file to reflect the migration from PostgreSQL to MongoDB. The backend service needs to be configured with the correct MongoDB connection string instead of the PostgreSQL database URL.

## Proposed Changes

### Configuration

#### [MODIFY] [docker-compose.yml](file:///Users/ccrocker/projects/GuitarGeek/docker-compose.yml)

- Remove `DATABASE_URL` environment variable from `backend` service.
- Add `MONGO_URI` environment variable to `backend` service, referencing the value from `.env`.

## Verification Plan

### Automated Tests

- Run `docker compose up --build` and verify that the backend service starts successfully.
- Check backend logs to confirm MongoDB connection: `docker compose logs backend`.
- Verify API accessibility via `curl http://localhost:3001/health`.
