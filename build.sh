#!/bin/bash
set -e

# GeekSuite Docker Image Builder
# Builds app images from the monorepo root
# Usage: ./build.sh [app-name]   Build a single app
#        ./build.sh              Build all apps
#        ./build.sh --list       List buildable apps

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Apps with root-level Dockerfiles (buildable)
APPS=(
  babelgeek
  basegeek
  bookgeek
  bujogeek
  dashgeek
  fitnessgeek
  flockgeek
  musicgeek
  notegeek
  photogeek
)

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

build_app() {
  local app="$1"
  local dockerfile="apps/${app}/Dockerfile"

  if [ ! -f "$dockerfile" ]; then
    echo -e "${RED}✗ No Dockerfile found for ${app}${NC}"
    return 1
  fi

  echo -e "${YELLOW}🔨 Building geeksuite/${app}:latest ...${NC}"
  docker build -t "geeksuite/${app}:latest" -f "$dockerfile" .

  if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ geeksuite/${app}:latest built successfully${NC}"
  else
    echo -e "${RED}✗ Failed to build geeksuite/${app}:latest${NC}"
    return 1
  fi
}

# Docker Directory Root
DOCKER_ROOT="/mnt/Media/Docker"

deploy_app() {
  local app="$1"
  local deploy_dir="$DOCKER_ROOT/$app"

  echo -e "${YELLOW}🚀 Deploying ${app} ...${NC}"

  if [ ! -d "$deploy_dir" ]; then
    echo -e "${RED}✗ Deployment directory not found: ${deploy_dir}${NC}"
    return 1
  fi

  if [ ! -f "$deploy_dir/docker-compose.yml" ]; then
    echo -e "${RED}✗ docker-compose.yml not found in ${deploy_dir}${NC}"
    return 1
  fi

  # Deploy: restart container to pick up new image and renew anonymous volumes (-V)
  (cd "$deploy_dir" && docker compose up -d -V)

  if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ ${app} deployed successfully${NC}"
  else
    echo -e "${RED}✗ Failed to deploy ${app}${NC}"
    return 1
  fi
}

build_and_deploy() {
  local app="$1"
  build_app "$app"
  if [ $? -eq 0 ]; then
    deploy_app "$app"
  else
    return 1
  fi
}

# Check for dialog if running interactively
if [ -z "$1" ] && command -v dialog >/dev/null 2>&1; then
  # Build checklist options
  OPTIONS=()
  for app in "${APPS[@]}"; do
    if [ -f "apps/${app}/Dockerfile" ]; then
      OPTIONS+=("$app" "Build & Deploy" "OFF") # Default OFF
    fi
  done

  # Show checklist
  CHOICES=$(dialog --stdout --backtitle "GeekSuite Monorepo Builder" \
         --title "Select Apps" \
                   --checklist "Choose which applications to build and deploy:" \
                   20 60 15 \
                   "${OPTIONS[@]}")

  clear

  if [ -z "$CHOICES" ]; then
    echo "No apps selected. Exiting."
    exit 0
  fi

  echo "Selected apps: $CHOICES"
  echo ""

  # Loop through choices (dialog returns quoted strings like "app1" "app2")
  for app in $CHOICES; do
    # Remove quotes
    app="${app%\"}"
    app="${app#\"}"
    build_and_deploy "$app"
  done
  exit 0
fi

if [ "$1" = "--list" ] || [ -z "$1" ]; then
  # Fallback for no-args if dialog is missing, or explicit --list
  echo "Usage: ./build.sh [app_name] | --all"
  echo ""
  echo "Buildable apps:"
  for app in "${APPS[@]}"; do
    if [ -f "apps/${app}/Dockerfile" ]; then
      echo -e "  ${GREEN}✓${NC} ${app}"
    else
      echo -e "  ${RED}✗${NC} ${app} (no Dockerfile)"
    fi
  done
  exit 0
fi

if [ "$1" = "--all" ]; then
  # Build and deploy all apps
  echo "Building and Deploying ALL GeekSuite apps..."
  echo ""
  FAILED=()
  for app in "${APPS[@]}"; do
    build_and_deploy "$app" || FAILED+=("$app")
    echo ""
  done

  echo "================================"
  if [ ${#FAILED[@]} -eq 0 ]; then
    echo -e "${GREEN}All apps built and deployed successfully!${NC}"
  else
    echo -e "${RED}Failed apps: ${FAILED[*]}${NC}"
    exit 1
  fi
else
  # Build and deploy single app
  build_and_deploy "$1"
fi

