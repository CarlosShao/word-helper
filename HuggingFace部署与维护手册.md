# HuggingFace部署与维护手册
本文档记录了项目在HuggingFace Spaces的部署、更新与维护全流程，避免重复踩坑。

---

## 一、项目说明
本项目为前后端分离的Node.js全栈项目，通过Docker多阶段构建部署在HuggingFace免费CPU实例上，实现公网可访问的在线服务，与本地电脑无关。

**数据库**：使用 PostgreSQL 数据库，支持配置第三方托管数据库（如 Supabase）实现数据持久化。

---

## 二、首次部署流程（纯网页操作，零本地修改）
### 1. 前置准备
- 确保GitHub项目仓库为**公开状态**，否则HuggingFace无法拉取代码
- 本地项目根目录已存在适配HuggingFace的`Dockerfile`（已写好，无需修改）
- 如果使用第三方数据库（推荐），准备好数据库连接信息

### 2. 新建空白Docker Space
1. 登录HuggingFace，进入`Spaces` → 点击`New Space`
2. 填写基础信息：
    - Space name：`word-helper`（与GitHub仓库同名）
    - SDK：选择`Docker`
    - 模板：**不选择任何模板**，直接往下滑
    - 硬件：默认`CPU Basic`（免费）
    - 可见性：`Public`
3. 直接点击`Create Space`，创建空白Space

### 3. 提交适配的Dockerfile
1. 进入Space页面 → 点击顶部`Files`标签
2. 点击右上角`+` → 选择`Create a new file`
3. 文件名填写`Dockerfile`（必须放在根目录，首字母大写）
4. 粘贴以下适配代码（已和项目完全匹配，无需修改）：
```dockerfile
# 阶段1：从GitHub拉取最新代码
FROM alpine/git AS clone
WORKDIR /app
RUN git clone https://github.com/CarlosShao/word-helper.git .

# 阶段2：构建前端
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY --from=clone /app/frontend/package*.json ./
RUN npm install
COPY --from=clone /app/frontend/ ./
RUN npm run build

# 阶段3：构建后端
FROM node:20-alpine AS backend-build
WORKDIR /app/backend
COPY --from=clone /app/backend/package*.json ./
RUN npm install
COPY --from=clone /app/backend/ ./
RUN npm run build

# 阶段4：生产运行（适配HuggingFace端口要求）
FROM node:20-alpine
WORKDIR /app

# 复制构建产物
COPY --from=backend-build /app/backend/package*.json ./
COPY --from=backend-build /app/backend/dist ./dist
COPY --from=backend-build /app/backend/node_modules ./node_modules
COPY --from=frontend-build /app/frontend/dist ./public

# 创建必要目录
RUN mkdir -p uploads

# HuggingFace强制配置：端口+绑定主机
ENV PORT=7860
ENV HOST=0.0.0.0

# PostgreSQL数据库环境变量（默认使用本地数据库）
# 如需使用第三方数据库，请在Space Settings中配置Secrets
ENV DB_HOST=localhost
ENV DB_PORT=5432
ENV DB_NAME=wordhelper
ENV DB_USER=postgres
ENV DB_PASSWORD=

EXPOSE 7860

# 启动命令
CMD ["node", "dist/index.js"]
```

### 4. 配置数据库连接（推荐使用Supabase）
1. 注册并创建 [Supabase](https://supabase.com/) 账号
2. 创建新项目，获取数据库连接信息：
    - Host: `db.xxx.supabase.co`
    - Port: `5432`
    - Database: `postgres`
    - User: `postgres`
    - Password: 你的数据库密码
3. 在HuggingFace Space的 `Settings` → `Variables and secrets` 中添加以下Secrets：
    - `DB_HOST`: 数据库主机地址
    - `DB_PORT`: 数据库端口（通常为5432）
    - `DB_NAME`: 数据库名称
    - `DB_USER`: 数据库用户名
    - `DB_PASSWORD`: 数据库密码

### 5. 重新编译
- `Settings` -> 找到 `Factory rebuild`, 项目就重新编译了
- 只要GitHub上的代码是最新的, 那这个项目就会保持最新

---

## 三、数据存储说明

### 当前方案
本项目支持两种数据库配置：

#### 方案A：本地SQLite（不推荐）
- 数据库保存在容器内的本地文件
- **Factory Rebuild 后数据会丢失**
- 操作响应速度快

#### 方案B：第三方PostgreSQL（推荐）
- 使用 Supabase 等托管数据库服务
- **数据持久化，不会因重建丢失**
- 需要配置环境变量

### 为什么推荐方案B？
- 数据持久化，Factory Rebuild 后数据不会丢失
- 支持多设备访问同一数据库
- 性能稳定，适合长期使用

---

## 四、环境变量配置

### 数据库连接配置
| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `DB_HOST` | 数据库主机地址 | localhost |
| `DB_PORT` | 数据库端口 | 5432 |
| `DB_NAME` | 数据库名称 | wordhelper |
| `DB_USER` | 数据库用户名 | postgres |
| `DB_PASSWORD` | 数据库密码 | 空 |

### 配置方式
在 HuggingFace Space 的 `Settings` → `Variables and secrets` 中添加以上变量。

---

## 五、故障排除

### 问题1：数据库连接失败
**原因**：数据库配置不正确
**解决**：
- 检查环境变量是否正确配置
- 确保数据库服务正常运行
- 检查网络连接是否正常

### 问题2：数据丢失
**原因**：使用了本地SQLite存储，Factory Rebuild 清空了数据
**解决**：切换到第三方数据库（如 Supabase）

### 问题3：导入失败
**检查项**：
- [ ] PDF 文件格式是否正确？
- [ ] 文件是否过大？
- [ ] 网络连接是否正常？

### 问题4：应用无法访问
**检查项**：
- [ ] Space 是否正在运行？
- [ ] 是否超过免费实例时间限制？
- [ ] 查看 Space 日志排查错误

---

## 六、最佳实践

1. **使用第三方数据库**：推荐使用 Supabase，确保数据持久化
2. **定期备份**：虽然使用了持久化数据库，仍建议定期导出 PDF 文件到本地
3. **避免频繁重建**：非必要不进行 Factory Rebuild
4. **关注更新**：代码更新后记得同步到 GitHub，再重建 Space
5. **记录配置**：如果修改了代码中的配置项，记录下来方便恢复

---

## 七、数据库迁移

### 从旧版本迁移
如果之前使用的是 sql.js（SQLite）版本，需要手动迁移数据：
1. 在旧系统中导出数据为 PDF
2. 在新系统中重新导入 PDF 文件
3. 数据会自动保存到 PostgreSQL 数据库

### 数据库初始化
首次启动时，系统会自动创建所需的数据库表：
- words: 单词表
- error_words: 错题集
- observation_words: 观察室
- word_relations: 单词关系
- classification_rules: 分类规则
- 其他辅助表

初始化时会自动添加默认的分类规则（前后缀规则）。