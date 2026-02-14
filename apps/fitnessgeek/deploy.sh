#!/bin/bash

# FitnessGeek Deployment Script
# This script builds and deploys FitnessGeek to the server

set -e

echo "🚀 Starting FitnessGeek deployment..."

# Check if we're in the right directory
if [ ! -f "docker-compose.yml" ]; then
    echo "❌ Error: docker-compose.yml not found. Please run this script from the FitnessGeek root directory."
    exit 1
fi

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo "❌ Error: .env file not found. Please create one based on env.example"
    exit 1
fi

# Build and deploy
echo "📦 Building Docker containers..."
docker compose build

echo "🔄 Stopping existing containers..."
docker compose down

echo "🚀 Starting new containers..."
docker compose up -d

echo "⏳ Waiting for services to be healthy..."
sleep 10

# Check if services are running
echo "🔍 Checking service health..."
if docker compose ps | grep -q "Up"; then
    echo "✅ FitnessGeek deployed successfully!"
    echo "🌐 Frontend available internally at: http://192.168.1.17:80"
    echo "🔧 Backend API available internally at: http://192.168.1.17:3001"
    echo "📝 Configure your nginx reverse proxy to point to the frontend container"
else
    echo "❌ Deployment failed. Check logs with: docker compose logs"
    exit 1
fi

echo "📋 To view logs: docker compose logs -f"
echo "🛑 To stop: docker compose down"