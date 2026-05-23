# Word Helper 项目 Render 部署与维护手册

## 📋 目录

- [概述](#概述)
- [为什么选择 Render](#为什么选择-render)
- [Render 免费版限制](#render-免费版限制)
- [部署架构](#部署架构)
- [前置准备](#前置准备)
- [部署步骤](#部署步骤)
- [前端部署到 Vercel](#前端部署到-vercel)
- [环境变量配置](#环境变量配置)
- [数据库初始化](#数据库初始化)
- [访问配置](#访问配置)
- [维护指南](#维护指南)
- [注意事项](#注意事项)
- [常见问题排查](#常见问题排查)
- [成本优化建议](#成本优化建议)

---

## 概述

本文档详细说明如何将 Word Helper 项目部署到 Render 平台，实现**后端 API + PostgreSQL 数据库**的云端部署，配合 Vercel 部署的前端，提供完整的在线单词学习工具。

## 为什么选择 Render

### Render 的优势

1. **免费 PostgreSQL 数据库**：提供免费数据库实例，适合个人项目
2. **亚太地区节点**：支持新加坡区域，访问速度快
3. **GitHub 集成**：支持自动部署，更新代码即自动部署
4. **一键回滚**：可以快速回滚到之前的版本
5. **HTTPS 自动配置**：无需手动配置 SSL 证书
6. **健康检查**：内置健康检查功能

### 对比 HuggingFace Spaces

| 特性 | HuggingFace | Render |
|------|------------|--------|
| 数据库支持 | 仅 SQLite | PostgreSQL（完整） |
| 访问速度（亚太） | 一般 | 较快（新加坡节点） |
| 免费额度 | 有限 | 750小时/月 |
| 冷启动 | 慢 | 中等（~30秒） |
| 自定义域名 | 需要配置 | 支持 |

## Render 免费版限制

### Web 服务限制

- **实例小时数**：每月 750 小时（超出后服务暂停）
- **空闲自动休眠**：15 分钟无请求会自动休眠
- **冷启动延迟**：休眠后再次启动约需 30 秒
- **无持久磁盘**：文件系统临时，重启会丢失
- **单实例**：不支持水平扩展

### PostgreSQL 限制

- **90 天过期**：免费数据库 90 天后会自动删除
- **单数据库**：每个账号只能创建一个免费数据库
- **存储限制**：约 1GB 存储空间

### ⚠️ 重要提醒

> **免费版适合开发和测试，不适合生产环境。**
> 
> 如果项目需要长期运行，建议：
> 1. 升级到付费计划
> 2. 定期备份数据
> 3. 关注数据库过期时间

---

## 部署架构

```
┌─────────────────────────────────────────────────────────────┐
│                      用户浏览器                               │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                   Vercel (前端)                              │
│                   word-helper 前端                          │
│                   静态站点 + SPA                            │
└────────────────────────┬────────────────────────────────┘
                         │
                         │ API 请求
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                  Render (后端 API)                          │
│                  word-helper-api                            │
│                  Node.js + Express                          │
│                  https://word-helper-api.onrender.com       │
└────────────────────────┬────────────────────────────────┘
                         │
                         │ PostgreSQL 连接
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                Render PostgreSQL                            │
│                word-helper-db                               │
│                免费版 PostgreSQL 16                         │
└─────────────────────────────────────────────────────────────┘
```

---

## 前置准备

### 1. 账号准备

#### Render 账号
1. 访问 [Render 注册页面](https://dashboard.render.com/register)
2. 使用 GitHub 账号登录（推荐）
3. 完成邮箱验证

#### Vercel 账号
1. 访问 [Vercel 注册页面](https://vercel.com/signup)
2. 使用 GitHub 账号登录
3. 授权 Vercel 访问你的 GitHub 仓库

### 2. GitHub 仓库准备

确保你的代码已在 GitHub 上：

```bash
# 在项目根目录执行
cd word-helper

# 检查 Git 状态
git status

# 添加所有文件
git add .

# 提交
git commit -m "准备部署到 Render"

# 推送到 GitHub
git push origin main
```

### 3. 项目代码准备

项目已包含以下 Render 部署所需的文件：

- ✅ `render.yaml` - Render 基础设施配置文件
- ✅ `backend/src/index.ts` - 已配置 CORS 和健康检查
- ✅ `backend/src/db.ts` - 已配置 SSL 连接
- ✅ `backend/package.json` - 包含构建和启动脚本

---

## 部署步骤

### 方式一：使用 Blueprint（推荐）

这种方式可以通过配置文件自动创建所有服务。

#### 步骤 1：推送代码

确保 `render.yaml` 文件在仓库根目录：

```bash
git add render.yaml
git commit -m "添加 Render 部署配置"
git push origin main
```

#### 步骤 2：创建 Blueprint

1. 登录 [Render Dashboard](https://dashboard.render.com)
2. 点击右上角 **New** → **Blueprint**
3. 选择你的 GitHub 仓库
4. Render 会自动检测 `render.yaml` 文件
5. 点击 **Apply** 开始部署

#### 步骤 3：等待部署

部署过程会自动完成以下操作：
1. 创建 PostgreSQL 数据库
2. 创建后端 Web 服务
3. 构建并启动应用
4. 运行数据库初始化脚本

部署完成后，你会获得：
- 后端 API 地址：`https://word-helper-api.onrender.com`
- 数据库连接字符串（自动配置）

---

### 方式二：手动部署

如果不使用 Blueprint，可以手动创建服务。

#### 步骤 1：创建 PostgreSQL 数据库

1. Render Dashboard → **New** → **PostgreSQL**
2. 配置数据库：
   - **Name**: `word-helper-db`
   - **Plan**: Free
   - **Region**: Singapore
   - **Database Name**: `wordhelper`
3. 点击 **Create Database**
4. 等待数据库创建完成（约 1-2 分钟）
5. 复制 **Internal Database URL**（稍后使用）

#### 步骤 2：创建 Web 服务

1. Render Dashboard → **New** → **Web Service**
2. 配置服务：
   - **GitHub**: 选择 `word-helper` 仓库
   - **Branch**: `main`
   - **Root Directory**: `backend`
   - **Runtime**: Node
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
   - **Plan**: Free
   - **Region**: Singapore
3. 点击 **Create Web Service**

#### 步骤 3：配置环境变量

在 Web 服务的 **Environment** 页面添加：

| 变量名 | 值 | 说明 |
|--------|-----|------|
| `NODE_ENV` | `production` | 生产环境 |
| `PORT` | `10000` | 端口号 |
| `DATABASE_URL` | [你的数据库 Internal URL] | 数据库连接字符串 |
| `PGSSLMODE` | `require` | SSL 模式 |

#### 步骤 4：等待构建

构建过程需要 3-5 分钟，包括：
1. 安装依赖（npm install）
2. TypeScript 编译（npm run build）
3. 启动服务

完成后，服务会显示 **Live** 状态。

---

## 前端部署到 Vercel

### 为什么前端用 Vercel

- **更好的静态站点支持**：Vercel 专为前端设计
- **更快的全球 CDN**：访问速度更快
- **免费额度更充足**：每月 100GB 带宽

### 部署步骤

#### 1. 导入 GitHub 仓库

1. 登录 [Vercel Dashboard](https://vercel.com/dashboard)
2. 点击 **Add New** → **Project**
3. 选择 `word-helper` 仓库
4. Vercel 会自动检测前端配置

#### 2. 配置构建设置

Vercel 自动配置：
- **Framework Preset**: `Vite`
- **Build Command**: `npm run build`
- **Output Directory**: `dist`

#### 3. 设置环境变量

在 Vercel 项目设置中添加：

| 变量名 | 值 | 说明 |
|--------|-----|------|
| `VITE_API_URL` | `https://word-helper-api.onrender.com` | 后端 API 地址 |

#### 4. 配置重定向

由于前端是 SPA（单页应用），需要配置所有路由回退到 `index.html`：

在项目根目录创建 `vercel.json`：

```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

#### 5. 部署

点击 **Deploy**，Vercel 会自动构建并部署前端。

---

## 环境变量配置

### 后端环境变量（Render）

在 Render Web Service 的 Environment 页面配置：

```bash
# 生产环境标识
NODE_ENV=production

# 端口（Render 会自动设置，10000 是推荐值）
PORT=10000

# 数据库连接（从 Render PostgreSQL 获取）
DATABASE_URL=postgresql://user:password@host:5432/wordhelper

# PostgreSQL SSL 模式
PGSSLMODE=require
```

### 前端环境变量（Vercel）

在 Vercel 项目设置中配置：

```bash
# 后端 API 地址（根据实际部署地址修改）
VITE_API_URL=https://word-helper-api.onrender.com
```

### 修改 API 地址

如果部署后 API 地址变化，需要更新前端配置：

1. 打开 `frontend/src/api.ts`
2. 修改 `baseURL` 为新的后端地址
3. 重新部署前端

---

## 数据库初始化

### 自动初始化

当后端服务首次启动时，会自动创建所有必要的表：

- `words` - 单词表
- `error_words` - 错题集
- `observation_words` - 观察室
- `import_files` - 导入文件记录
- `word_relations` - 单词关系
- `classification_rules` - 分类规则
- `practice_sessions` - 练习会话
- `settings` - 设置
- `parts_of_speech` - 词性
- `import_error_logs` - 导入错误日志

### 手动初始化（可选）

如果需要手动运行初始化：

1. 进入 Render 服务页面
2. 点击 **Shell**
3. 执行命令：

```bash
node dist/index.js
```

服务会启动并初始化数据库。

---

## 访问配置

### 后端 API

部署成功后，后端 API 可通过以下地址访问：

```
https://word-helper-api.onrender.com
```

### 前端访问

前端部署到 Vercel 后，访问地址类似：

```
https://word-helper.vercel.app
```

### 测试 API

在浏览器中访问健康检查端点：

```
https://word-helper-api.onrender.com/health
```

应该返回：

```json
{
  "status": "ok",
  "timestamp": "2025-05-23T10:00:00.000Z"
}
```

---

## 维护指南

### 1. 代码更新

#### 自动部署

当代码推送到 GitHub 时，Render 和 Vercel 会自动检测并重新部署：

```bash
# 修改代码后
git add .
git commit -m "修复某个问题"
git push origin main

# 自动部署触发
```

#### 手动部署

在 Render/Vercel Dashboard 中：
1. 进入对应服务页面
2. 点击 **Deployments**
3. 选择最新提交
4. 点击 **Redeploy**

### 2. 数据库备份

#### 导出数据

1. Render Dashboard → PostgreSQL 数据库
2. 点击 **Connect** → **External Connection String**
3. 使用 pgAdmin 或 psql 连接
4. 导出数据：

```bash
pg_dump -h hostname -U username -d wordhelper -f backup.sql
```

#### 导入数据

```bash
psql -h hostname -U username -d wordhelper -f backup.sql
```

### 3. 监控和日志

#### 查看日志

在 Render Dashboard：
1. 进入 Web Service 页面
2. 点击 **Logs**
3. 实时查看应用日志

#### 设置告警（可选）

可以设置当服务出现问题时发送邮件通知。

### 4. 续期数据库

Render 免费数据库 90 天后会过期：

#### 避免数据丢失

1. **提前备份**：在过期前导出数据
2. **创建新数据库**：在过期前创建新数据库
3. **导入数据**：将备份数据导入新数据库
4. **更新配置**：修改后端 DATABASE_URL

#### 自动化提醒

建议在日历中设置 80 天后的提醒。

---

## 注意事项

### 1. 安全建议

#### 敏感信息

- ✅ DATABASE_URL 已配置为环境变量
- ✅ 密码不在代码中硬编码
- ⚠️ 建议定期轮换数据库密码

#### CORS 配置

后端已配置支持以下来源：
- `localhost:3000` - 本地开发
- `localhost:5173` - 本地开发（Vite）
- `*.onrender.com` - Render 域名
- `*.vercel.app` - Vercel 域名
- `*.netlify.app` - Netlify 域名

如需添加其他域名，请修改 `backend/src/index.ts` 中的 `corsOptions`。

### 2. 性能考虑

#### 冷启动延迟

免费服务休眠后，首次请求需要 30 秒左右的启动时间。这是正常的。

#### 连接池

数据库连接池配置为：
- 最大连接数：10
- 空闲超时：30 秒
- 连接超时：5 秒

### 3. 数据持久性

#### 文件系统

Render 的文件系统是临时的：
- 上传的 PDF 文件在重启后会丢失
- 建议使用外部存储（如 AWS S3）存储上传文件

#### 数据库

PostgreSQL 数据是持久化的，但免费版有 90 天过期限制。

---

## 常见问题排查

### Q1: 部署失败

#### 可能原因

1. **构建超时**：免费实例资源有限
2. **环境变量缺失**：DATABASE_URL 未配置
3. **依赖安装失败**：检查 npm install 输出

#### 解决方法

```bash
# 本地测试构建
cd backend
npm install
npm run build

# 检查构建日志
```

### Q2: 数据库连接失败

#### 症状

```
Error: Connection refused
```

#### 解决方法

1. 检查 DATABASE_URL 是否正确
2. 确认数据库是否创建完成
3. 检查 PGSSLMODE 是否设置为 `require`
4. 查看日志中的详细错误信息

### Q3: CORS 错误

#### 症状

```
Access to fetch at 'https://word-helper-api.onrender.com' from origin 'https://word-helper.vercel.app' has been blocked by CORS policy
```

#### 解决方法

1. 确认后端 CORS 配置包含前端域名
2. 检查前端 API 地址是否正确
3. 前端地址必须在允许列表中

### Q4: 服务无法启动

#### 检查项

1. 查看 Render 日志
2. 检查端口配置（应为 10000）
3. 确认 startCommand 正确
4. 检查环境变量

### Q5: 磁盘空间不足

#### 症状

```
ENOSPC: no space left on device
```

#### 解决方法

免费实例磁盘空间有限：
1. 清理不必要的文件
2. 删除临时文件
3. 考虑升级到付费实例

### Q6: 冷启动慢

#### 症状

首次访问需要等待 30 秒左右

#### 说明

这是免费实例的正常行为，无法完全避免。可以：
1. 使用付费实例（不停机）
2. 配置定时访问保持活跃
3. 接受冷启动延迟

---

## 成本优化建议

### 当前成本

使用免费版：
- **Render Web Service**: 免费（750小时/月）
- **Render PostgreSQL**: 免费（90天）
- **Vercel 前端**: 免费（100GB/月）

**总计**: ¥0/月

### 付费升级建议

如果需要更好的性能：

#### 推荐方案

1. **Render Starter Plan**: $7/月
   - 永不休眠
   - 持久磁盘
   - 优先构建

2. **Render PostgreSQL**: $7/月
   - 无过期限制
   - 更大存储

### 何时升级

建议在以下情况下升级：
- 项目需要投入生产使用
- 用户量增长导致性能不足
- 需要持久化文件存储
- 无法接受冷启动延迟

---

## 总结

### 部署检查清单

- [ ] Render 账号已注册
- [ ] Vercel 账号已注册
- [ ] GitHub 仓库已创建
- [ ] `render.yaml` 已推送到仓库
- [ ] PostgreSQL 数据库已创建
- [ ] Web 服务已部署
- [ ] 环境变量已配置
- [ ] 前端已部署到 Vercel
- [ ] API 连接测试通过
- [ ] 功能测试完成

### 重要链接

- **Render Dashboard**: https://dashboard.render.com
- **Vercel Dashboard**: https://vercel.com/dashboard
- **后端 API**: https://word-helper-api.onrender.com
- **API 健康检查**: https://word-helper-api.onrender.com/health

### 下一步

1. 完成部署
2. 测试所有功能
3. 配置自定义域名（可选）
4. 设置数据备份策略
5. 监控服务状态

---

## 技术支持

### 文档更新

如发现文档错误或有补充内容，欢迎提交 PR。

### 遇到问题

1. 查看本文档的常见问题排查部分
2. 查看 Render 官方文档
3. 查看 Vercel 官方文档
4. 检查 GitHub Issues

---

**祝你部署顺利！** 🎉

---

*文档版本：1.0.0*
*最后更新：2026-05-23*
*适用版本：Word Helper v1.0+*
