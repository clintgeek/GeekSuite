# FitnessGeek Docker Deployment Guide

This guide explains how to deploy FitnessGeek using Docker containers.

## Prerequisites

- Docker and Docker Compose installed
- Access to the server (192.168.1.17)
- MongoDB database access (via baseGeek)

## Quick Start

1. **Clone the repository** (if not already done):
   ```bash
   git clone <repository-url>
   cd fitnessGeek
   ```

2. **Set up environment variables**:
   ```bash
   cp env.example .env
   # Edit .env with your actual values
   ```

3. **Deploy using the script**:
   ```bash
   ./deploy.sh
   ```

## Manual Deployment

If you prefer to deploy manually:

```bash
# Build the containers
docker-compose build

# Start the services
docker-compose up -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f
```

## Environment Variables

Create a `.env` file with the following variables:

```bash
# Database Configuration
DB_URI=mongodb://username:password@host:port/database

# JWT Configuration
JWT_SECRET=your-jwt-secret-here

# baseGeek Integration
BASEGEEK_URL=https://basegeek.clintgeek.com
VITE_BASEGEEK_URL=https://basegeek.clintgeek.com

# API Configuration
VITE_API_URL=https://fitnessgeek.clintgeek.com/api

# Food API Keys (Optional)
USDA_API_KEY=your-usda-api-key
NUTRITIONIX_APP_ID=your-nutritionix-app-id
NUTRITIONIX_API_KEY=your-nutritionix-api-key

# Node Environment
NODE_ENV=production
```

## Service Architecture

- **Frontend**: React + Vite + MUI (internal port 80)
- **Backend**: Node.js + Express (internal port 3001)
- **Database**: MongoDB (via baseGeek)
- **External Reverse Proxy**: Your existing nginx server (handles SSL and external access)
- **Internal Proxy**: Container nginx (handles API proxying to backend)

## Ports

- **External**: Your nginx reverse proxy handles external access
- **Internal**: Frontend container (port 80), Backend container (port 3001)

## SSL/HTTPS Setup

Your existing nginx reverse proxy already handles SSL termination. To configure:

1. **Add FitnessGeek to your nginx config** to proxy to the container
2. **Configure domain** (fitnessgeek.clintgeek.com) to point to the container
3. **Update environment variables** to use HTTPS URLs

## Troubleshooting

### Check container status:
```bash
docker-compose ps
```

### View logs:
```bash
docker-compose logs -f [service-name]
```

### Restart services:
```bash
docker-compose restart
```

### Rebuild and redeploy:
```bash
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

## Development vs Production

- **Development**: Run locally with `npm run dev` (frontend) and `npm start` (backend)
- **Production**: Use Docker containers with the provided configuration

## Security Notes

- The backend is not directly exposed to the internet
- All API calls go through the frontend nginx proxy
- Environment variables should be kept secure
- JWT secrets should be strong and unique