#!/bin/bash
set -e

# Word Helper Quick Start for Linux
# =================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}   Word Helper Quick Start (Linux)${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# [0/5] Configuring startup options
echo -e "${YELLOW}[0/5] Configuring startup options...${NC}"

# [1/5] Checking Docker status
echo -e "${YELLOW}[1/5] Checking Docker status...${NC}"
if ! command -v docker &> /dev/null; then
    echo -e "${RED}Docker is not installed!${NC}"
    echo "Please install Docker first:"
    echo "  curl -fsSL https://get.docker.com | sh"
    exit 1
fi

if ! docker info &> /dev/null; then
    echo -e "${YELLOW}Docker not running, starting...${NC}"
    if [ -f "/etc/init.d/docker" ]; then
        sudo /etc/init.d/docker start
    elif [ -f "/usr/lib/systemd/system/docker.service" ]; then
        sudo systemctl start docker
    else
        echo -e "${RED}Failed to start Docker!${NC}"
        exit 1
    fi
    echo "Waiting for Docker to start..."
    sleep 5
fi
echo -e "${GREEN}Docker is running${NC}"
echo ""

# [2/5] Changing to project directory
echo -e "${YELLOW}[2/5] Changing to project directory...${NC}"
cd "$(dirname "$0")" || { echo -e "${RED}Failed to change directory!${NC}"; exit 1; }
echo -e "${GREEN}Changed to project directory${NC}"
echo ""

# [3/5] Fetching latest code with fallback to Gitee
echo -e "${YELLOW}[3/5] Fetching latest code...${NC}"
echo "Trying GitHub first..."

# Try to fetch from GitHub with timeout
if timeout --signal=SIGINT 3 git fetch origin; then
    echo -e "${GREEN}GitHub fetch successful${NC}"
    echo "Resetting to latest main branch..."
    git checkout main
    git reset --hard origin/main
    echo -e "${GREEN}Updated to latest code from GitHub${NC}"
else
    echo -e "${YELLOW}GitHub fetch failed or timed out, trying Gitee...${NC}"
    
    # Check if gitee remote exists
    if ! git remote get-url gitee &> /dev/null; then
        git remote add gitee https://gitee.com/CarlosShao/word-helper.git
    fi
    
    if timeout --signal=SIGINT 10 git fetch gitee; then
        echo -e "${GREEN}Gitee fetch successful${NC}"
        echo "Resetting to latest main branch..."
        git checkout main
        git reset --hard gitee/main
        echo -e "${GREEN}Updated to latest code from Gitee${NC}"
    else
        echo -e "${YELLOW}Both GitHub and Gitee failed! Using local code${NC}"
    fi
fi
echo ""

# [4/5] Cleaning up old containers and images
echo -e "${YELLOW}[4/5] Cleaning up old containers and images...${NC}"
docker stop word-helper 2>/dev/null || true
docker rm -f word-helper 2>/dev/null || true
docker compose down -v 2>/dev/null || true
docker rmi -f word-helper 2>/dev/null || true
docker builder prune -f
echo -e "${GREEN}Cleaned up old containers and images${NC}"
echo ""

# [5/5] Rebuilding and starting services
echo -e "${YELLOW}[5/5] Rebuilding and starting services...${NC}"
echo "Building, please wait (this may take a few minutes)..."

if ! docker compose build --no-cache; then
    echo -e "${RED}Docker build failed!${NC}"
    exit 1
fi

if ! docker compose up -d; then
    echo -e "${RED}Docker start failed!${NC}"
    echo "Please check if Docker is running properly"
    exit 1
fi
echo -e "${GREEN}Docker services started${NC}"
echo ""

# Wait for services to be ready
echo -e "${YELLOW}[6/5] Waiting for services to be ready...${NC}"
sleep 10

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}   Deployed successfully!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${BLUE}Access at: ${NC}http://localhost:3000"
echo ""
echo -e "${YELLOW}Tips:${NC}"
echo "  - Database uses remote Supabase"
echo "  - Check logs: docker compose logs -f"
echo "  - Stop services: docker compose down"
echo ""
