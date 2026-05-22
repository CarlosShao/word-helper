# 第一阶段：构建前端
FROM node:20-alpine AS frontend-build

WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# 第二阶段：构建后端
FROM node:20-alpine AS backend-build

WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm install
COPY backend/ ./
RUN npm run build

# 第三阶段：生产阶段
FROM node:20-alpine

WORKDIR /app

# 复制后端构建产物
COPY --from=backend-build /app/backend/package*.json ./
COPY --from=backend-build /app/backend/dist ./dist
COPY --from=backend-build /app/backend/node_modules ./node_modules

# 复制前端构建产物到后端的public目录
COPY --from=frontend-build /app/frontend/dist ./public

# 创建必要的目录
RUN mkdir -p uploads data

EXPOSE 3000

CMD ["node", "dist/index.js"]
