#!/bin/bash

# InfluxDB Integration - Quick Setup Script
# This script installs dependencies and verifies the setup

set -e  # Exit on error

echo "=========================================="
echo "InfluxDB Integration Setup"
echo "=========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running from project root
if [ ! -f "package.json" ] && [ ! -d "backend" ]; then
    echo -e "${RED}Error: Please run this script from the fitnessGeek project root${NC}"
    exit 1
fi

# Backend setup
echo -e "${YELLOW}[1/4] Setting up backend dependencies...${NC}"
cd backend

if ! npm list influx > /dev/null 2>&1; then
    echo "Installing influx package..."
    npm install influx
    echo -e "${GREEN}✓ influx package installed${NC}"
else
    echo -e "${GREEN}✓ influx package already installed${NC}"
fi

# Check environment variables
echo -e "\n${YELLOW}[2/4] Checking backend environment variables...${NC}"
if [ -f ".env" ]; then
    if grep -q "INFLUXDB_HOST" .env; then
        echo -e "${GREEN}✓ INFLUXDB_HOST found in .env${NC}"
    else
        echo -e "${YELLOW}⚠ INFLUXDB_HOST not found in .env${NC}"
        echo "Adding default InfluxDB configuration..."
        cat >> .env << EOF

# InfluxDB Configuration
INFLUXDB_HOST=192.168.1.17
INFLUXDB_PORT=8086
INFLUXDB_DATABASE=geekdata
EOF
        echo -e "${GREEN}✓ Added default configuration (please update with your values)${NC}"
    fi
else
    echo -e "${RED}✗ .env file not found${NC}"
    echo "Please create backend/.env with InfluxDB configuration"
    exit 1
fi

# Frontend setup
echo -e "\n${YELLOW}[3/4] Setting up frontend dependencies...${NC}"
cd ../frontend

PACKAGES_TO_INSTALL=()

if ! npm list chart.js > /dev/null 2>&1; then
    PACKAGES_TO_INSTALL+=("chart.js")
fi

if ! npm list react-chartjs-2 > /dev/null 2>&1; then
    PACKAGES_TO_INSTALL+=("react-chartjs-2")
fi

if ! npm list chartjs-adapter-date-fns > /dev/null 2>&1; then
    PACKAGES_TO_INSTALL+=("chartjs-adapter-date-fns")
fi

if [ ${#PACKAGES_TO_INSTALL[@]} -gt 0 ]; then
    echo "Installing: ${PACKAGES_TO_INSTALL[@]}"
    npm install "${PACKAGES_TO_INSTALL[@]}"
    echo -e "${GREEN}✓ Chart packages installed${NC}"
else
    echo -e "${GREEN}✓ All chart packages already installed${NC}"
fi

# Verify files exist
echo -e "\n${YELLOW}[4/4] Verifying files...${NC}"
cd ..

REQUIRED_FILES=(
    "backend/src/services/influxService.js"
    "backend/src/services/sleepAnalysisService.js"
    "backend/src/services/aiRecoveryService.js"
    "backend/src/routes/influxRoutes.js"
    "backend/src/models/UserSettings.js"
    "frontend/src/pages/HealthDashboard.jsx"
    "frontend/src/components/SleepAnalysis.jsx"
    "frontend/src/components/IntradayDashboard.jsx"
    "frontend/src/components/MealImpactVisualization.jsx"
    "frontend/src/components/RecoveryCoach.jsx"
    "frontend/src/components/InfluxDBSettings.jsx"
)

ALL_FILES_EXIST=true

for file in "${REQUIRED_FILES[@]}"; do
    if [ -f "$file" ]; then
        echo -e "${GREEN}✓${NC} $file"
    else
        echo -e "${RED}✗${NC} $file"
        ALL_FILES_EXIST=false
    fi
done

echo ""
echo "=========================================="

if [ "$ALL_FILES_EXIST" = true ]; then
    echo -e "${GREEN}Setup Complete!${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Update backend/.env with your InfluxDB details"
    echo "2. Start backend: cd backend && npm start"
    echo "3. Start frontend: cd frontend && npm run dev"
    echo "4. Navigate to http://localhost:5173/health"
    echo "5. Enable InfluxDB in Settings tab"
    echo ""
    echo "For detailed instructions, see:"
    echo "  DOCS/INFLUXDB_SETUP_GUIDE.md"
    echo "  DOCS/INFLUXDB_INTEGRATION_COMPLETE.md"
else
    echo -e "${RED}Setup Incomplete!${NC}"
    echo "Some required files are missing."
    echo "Please ensure all InfluxDB integration files are present."
    exit 1
fi

echo "=========================================="
