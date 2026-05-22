# HuggingFace部署与维护手册
本文档记录了项目在HuggingFace Spaces的部署、更新与维护全流程，避免重复踩坑。

---

## 一、项目说明
本项目为前后端分离的Node.js全栈项目，通过Docker多阶段构建部署在HuggingFace免费CPU实例上，实现公网可访问的在线服务，与本地电脑无关。

---

## 二、首次部署流程（纯网页操作，零本地修改）
### 1. 前置准备
- 确保GitHub项目仓库为**公开状态**，否则HuggingFace无法拉取代码
- 本地项目根目录已存在适配HuggingFace的`Dockerfile`（已写好，无需修改）

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
RUN git clone https://github.com/CarlosShao/world-helper.git .

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
RUN mkdir -p uploads data

# HuggingFace强制配置：端口+绑定主机
ENV PORT=7860
ENV HOST=0.0.0.0
EXPOSE 7860

# 启动命令
CMD ["node", "dist/index.js"]
```

### 重新编译

- `settings` -> 找到 `Factory rebuild`, 项目就重新编译了, 只要github上的代码是最新的, 那这个项目就会保持最新

---

## 三、数据存储说明

### 当前方案
本项目采用**本地临时存储**方案：
- 数据库保存在容器内的 `/app/data/word-helper.db`
- **Factory Rebuild 后数据会丢失**
- 操作响应速度快

### 为什么这样设计？
HuggingFace Spaces 的持久化存储（Persistent Storage）写入速度较慢，影响用户体验。本项目使用频率较低，不需要实时保存，因此采用手动保存模式。

### 注意事项
- **Factory Rebuild 会清空数据**，重建前请确保已手动保存重要数据
- 可以导出 PDF 重新导入，数据不会丢失
- 如果需要频繁保存数据，可以考虑使用第三方数据库服务（如 Supabase PostgreSQL）

---

## 四、手动保存与数据管理

### 手动保存数据库
在应用界面找到相关保存选项，或者通过 API 保存：

**API 接口**：`POST /api/db/save`

保存后数据库文件会写入容器本地存储。

### 数据备份建议
1. **导出备份**：定期导出 PDF 文件保存到本地
2. **重新导入**：Factory Rebuild 后，重新上传 PDF 即可恢复数据
3. **关注 HuggingFace 官方**：如果未来有更优的持久化方案，会及时更新

### 导入数据流程
1. 准备包含单词的 PDF 文件
2. 在应用中选择"导入PDF"功能
3. 上传文件，等待处理完成
4. 如需保存，调用保存接口

---

## 五、故障排除

### 问题1：数据丢失
**原因**：Factory Rebuild 会清空容器，临时存储被清除
**解决**：重新导入 PDF 文件

### 问题2：导入失败
**检查项**：
- [ ] PDF 文件格式是否正确？
- [ ] 文件是否过大？
- [ ] 网络连接是否正常？

### 问题3：应用无法访问
**检查项**：
- [ ] Space 是否正在运行？
- [ ] 是否超过免费实例时间限制？
- [ ] 查看 Space 日志排查错误

---

## 六、最佳实践

1. **重要数据备份**：定期导出 PDF 文件到本地
2. **避免频繁重建**：非必要不进行 Factory Rebuild
3. **关注更新**：代码更新后记得同步到 GitHub，再重建 Space
4. **记录配置**：如果修改了代码中的配置项，记录下来方便恢复
