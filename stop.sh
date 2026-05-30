#!/bin/bash

# Word Helper Stop Script for Linux
# ==================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 默认停止生产环境
ENV_MODE="prod"

# 解析参数
while [[ "$#" -gt 0 ]]; do
    case $1 in
        --prod|--production) ENV_MODE="prod"; shift ;;
        --dev|--development) ENV_MODE="dev"; shift ;;
        *) echo "Unknown parameter passed: $1"; exit 1 ;;
    esac
done

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}   Word Helper Stop Script (Linux)${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# 显示当前环境
if [ "$ENV_MODE" = "prod" ]; then
    echo -e "${GREEN}环境: 生产环境 (Production)${NC}"
    echo -e "${BLUE}使用配置: docker-compose.yml${NC}"
else
    echo -e "${YELLOW}环境: 开发环境 (Development)${NC}"
    echo -e "${BLUE}使用配置: docker-compose.dev.yml${NC}"
fi
echo ""

# 确定使用哪个 docker-compose 文件
if [ "$ENV_MODE" = "prod" ]; then
    COMPOSE_FILE="docker-compose.yml"
else
    COMPOSE_FILE="docker-compose.dev.yml"
fi

# [1/3] Stopping Docker Compose services
echo -e "${YELLOW}[1/3] Stopping Docker Compose services...${NC}"
if docker compose -f $COMPOSE_FILE down; then
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
if [ "$ENV_MODE" = "prod" ]; then
    echo "  - To restart production services, run: ./start.sh"
    echo "  - To stop dev services, run: ./stop.sh --dev"
else
    echo "  - To restart dev services, run: docker compose -f docker-compose.dev.yml up -d"
    echo "  - To stop production services, run: ./stop.sh"
fi
echo ""

