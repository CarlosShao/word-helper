#!/bin/bash

# Word Helper Stop Script for Linux
# ==================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}   Word Helper Stop Script (Linux)${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# [1/3] Stopping Docker Compose services
echo -e "${YELLOW}[1/3] Stopping Docker Compose services...${NC}"
if docker compose down; then
    echo -e "${GREEN}Docker Compose services stopped${NC}"
else
    echo -e "${YELLOW}No Docker Compose services running or already stopped${NC}"
fi
echo ""

# [2/3] Stopping word-helper container
echo -e "${YELLOW}[2/3] Stopping word-helper container...${NC}"
if docker stop word-helper 2>/dev/null; then
    echo -e "${GREEN}word-helper container stopped${NC}"
else
    echo -e "${YELLOW}word-helper container not running or already stopped${NC}"
fi
echo ""

# [3/3] Removing word-helper container
echo -e "${YELLOW}[3/3] Removing word-helper container...${NC}"
if docker rm -f word-helper 2>/dev/null; then
    echo -e "${GREEN}word-helper container removed${NC}"
else
    echo -e "${YELLOW}word-helper container not found or already removed${NC}"
fi
echo ""

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}   Stopped successfully!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

echo -e "${YELLOW}Tips:${NC}"
echo "  - To restart services, run: ./start.sh"
echo "  - To view logs: docker compose logs"
echo "  - To completely remove images: docker compose down -v --rmi local"
echo ""
