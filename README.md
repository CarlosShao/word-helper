# 单词助手

帮助更好地学习和复习英语单词的应用。

## 更新日志

### 2026-05-18
- 修复PDF解析脏数据问题
- 优化随手拼功能（从指定单词开始、进度计数）
- 修复子层级显示和操作限制
- 优化操作栏布局

## 功能特性

- PDF文件导入，自动识别单词、词性和中文释义
- 单词列表展示，支持分页和搜索
- 隐藏/显示中英文，方便背诵
- 随手拼写练习功能
- 错题集管理
- 昨日错词巩固
- 观察室单词复习

## 技术栈

- 前端：Vue 3 + Element Plus + Vite
- 后端：Node.js + Express + TypeScript
- 数据库：SQLite
- PDF解析：pdf-parse

## 快速开始

### 使用 Docker（推荐）

1. 构建并启动应用：
```bash
docker-compose up -d --build
```

2. 访问应用：
打开浏览器访问 http://localhost:3000

3. 停止应用：
```bash
docker-compose down
```

### 本地部署

#### 前置需求
- 安装 [Docker](https://www.docker.com/) 和 [Docker Compose](https://docs.docker.com/compose/)（推荐方式）
- 或者安装 [Node.js 18+](https://nodejs.org/)（手动部署方式）

#### Docker 一键部署（最简单）
```bash
# 1. 克隆或拉取代码
git clone <你的仓库地址>
cd word-helper

# 2. 启动应用
docker-compose up -d

# 3. 访问：http://localhost:3000
```

#### 手动部署（不推荐）
```bash
# 1. 安装后端依赖
cd backend
npm install

# 2. 安装前端依赖
cd ../frontend
npm install

# 3. 构建前端
npm run build

# 4. 复制构建产物
cp -r dist/* ../backend/public/

# 5. 启动后端
cd ../backend
npm run dev

# 6. 访问：http://localhost:3000
```

## 公网访问

### 方案一：云服务器（推荐长期使用）
1. 购买云服务器（阿里云、腾讯云、AWS等）
2. 在服务器上安装 Docker
3. 按上述 Docker 部署方式操作
4. 配置安全组开放 3000 端口
5. 可选：购买域名解析到服务器 IP

### 方案二：内网穿透（临时测试）
使用 ngrok、frp 等工具：
```bash
# 本地启动应用后
ngrok http 3000
# 会得到一个公网访问地址
```

### 开发模式

#### 后端开发

```bash
cd backend
npm install
npm run dev
```

后端服务将在 http://localhost:3000 启动

#### 前端开发

```bash
cd frontend
npm install
npm run dev
```

前端服务将在 http://localhost:5173 启动

## 使用说明

1. 导入单词：在首页上传包含单词表的PDF文件
2. 浏览单词：在单词列表中查看所有单词，可使用搜索功能
3. 隐藏显示：可以单独或批量隐藏/显示中英文
4. 随手拼写：进入随手拼页面，根据中文提示拼写英文单词
5. 错题复习：在错题集和昨日错词巩固页面复习错题

## 项目结构

```
.
├── backend/          # 后端代码
│   ├── src/
│   │   ├── index.ts      # 主入口文件
│   │   ├── db.ts         # 数据库配置
│   │   └── pdfParser.ts  # PDF解析
│   └── package.json
├── frontend/         # 前端代码
│   ├── src/
│   │   ├── views/        # 页面组件
│   │   ├── App.vue       # 根组件
│   │   ├── router.ts     # 路由配置
│   │   └── api.ts        # API接口
│   └── package.json
├── docker-compose.yml
└── Dockerfile
```
