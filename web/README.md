# AI Novel Generator · Web Console

Vite + React + TypeScript + TailwindCSS 构建的前端控制台，替代原 CustomTkinter GUI（GUI 仍保留，两者可并存）。

## 启动

### 1. 启动后端

```bash
# 在项目根目录
pip install -r requirements.txt
python server.py
```

默认监听 `http://127.0.0.1:8000`，API 前缀 `/api`。

### 2. 启动前端

```bash
cd web
npm install
npm run dev
```

默认 `http://127.0.0.1:5173`，Vite 自动把 `/api` 代理到 `127.0.0.1:8000`。

## ✨ 已实现功能

### 后端（FastAPI + SSE）

| 接口 | 功能 |
|---|---|
| `GET /api/health` | 健康检查 |
| `GET/POST /api/config` | 读写 `config.json` |
| `POST /api/generate/architecture` | 生成小说架构（后台任务） |
| `POST /api/generate/directory` | 生成章节目录（后台任务） |
| `POST /api/generate/chapter_draft` | 生成章节草稿（后台任务） |
| `POST /api/generate/finalize_chapter` | 章节定稿（后台任务） |
| `GET /api/tasks/{task_id}` | 任务状态查询 |
| `GET /api/logs/stream` | **SSE 实时日志流** |
| `GET/POST /api/files/{architecture\|directory\|summary\|character}` | 元数据读写 |
| `GET /api/files/chapters/list` | 章节列表 |
| `GET/POST /api/files/chapters/{n}` | 读写某章 |

### 前端（7 个页面）

- 🏠 **主操作台** `/`：**预设切换器 + 基础设定内联编辑** + 4 步生成按钮 + 任务状态 + 实时日志 + Prompt 预览弹窗
- 📝 **小说参数** `/params`：完整参数表（含章节级引导）+ 预设切换
- ⚙️ **模型配置** `/config`：LLM / Embedding provider 增删改 + 角色选择 + 连接测试 + 模型拉取
- 📄 **文件预览** `/files`：架构/目录/摘要/人物/章节读写编辑（Ctrl+S 保存）
- 👥 **角色库** `/characters`：结构化 CRUD（5 分类：物品/能力/状态/关系网/事件）+ 原文切换
- 🔧 **工具箱** `/tools`：一致性检查 / 知识库导入 / 清空向量库
- 🛡 **系统设置** `/settings`：代理设置 + WebDAV 备份配置

### ✨ 多项目预设集

`config.json` 中引入 `novel_presets`（多套小说参数）+ `active_preset` 字段。
- 在"主操作台"或"小说参数"页顶部下拉切换项目
- 激活某预设时，会自动 copy 到 `other_params`，**所有生成接口完全无感知**
- 支持新建 / 复制 / 改名 / 删除 / 一键打开保存文件夹

### UI 特性

- 🌙 **暗色模式**：一键切换，`localStorage` 持久化，跟随系统偏好
- 📱 **响应式布局**：移动端自动折叠侧栏为抽屉菜单
- ⌨️ **键盘可达**：所有交互元素均支持 `tabindex` / `aria-label` / ESC 关闭弹窗

### 后端工具接口（`/api/tools/*`）

| 接口 | 功能 |
|---|---|
| `POST /api/tools/test_llm` | 测试 LLM 连通性（直接发送 prompt） |
| `POST /api/tools/test_embedding` | 测试 Embedding，返回向量维度 |
| `POST /api/tools/list_models` | 从 OpenAI/Ollama 拉取模型列表 |
| `POST /api/tools/consistency_check` | 一致性审校（异步任务） |
| `POST /api/tools/import_knowledge` | 导入知识 txt 到向量库（异步） |
| `POST /api/tools/clear_vectorstore` | 清空当前小说的向量库 |
| `POST /api/tools/build_prompt` | 构建章节提示词（不调用 LLM，可预览） |

### 后端角色库接口（`/api/characters/*`）

| 接口 | 功能 |
|---|---|
| `GET /api/characters` | 列出所有角色（附条目数统计） |
| `GET /api/characters/{name}` | 获取角色结构化详情 |
| `POST /api/characters` | 创建新角色 |
| `PUT /api/characters/{name}` | 更新（可改名） |
| `POST /api/characters/{name}/rename` | 仅重命名 |
| `DELETE /api/characters/{name}` | 删除角色 |
| `GET/POST /api/characters/raw/text` | 原始 `character_state.txt` 读写 |

### 后端预设接口（`/api/presets/*`）

| 接口 | 功能 |
|---|---|
| `GET /api/presets` | 列出所有预设 `{ active, names }` |
| `GET /api/presets/{name}` | 获取某预设的 OtherParams |
| `POST /api/presets/{name}` | 创建/覆盖预设 |
| `POST /api/presets/{name}/activate` | 设为激活（自动同步到 other_params） |
| `POST /api/presets/{name}/rename` | 重命名 |
| `POST /api/presets/_copy` | 复制预设 |
| `DELETE /api/presets/{name}` | 删除预设 |
| `POST /api/files/open_folder` | 在系统文件管理器中打开当前 filepath |

## 🔧 架构亮点

1. **GUI 完全保留**：原 `python main.py` 不受影响，Web 通过 `python server.py` 启动。
2. **共享配置文件**：Web 和 GUI 共用同一份 `config.json`。
3. **日志桥接**：`novel_generator.*` 中所有 `logging.info` 自动广播到 SSE，**生成代码零改动**。
4. **任务隔离**：`ThreadPoolExecutor` 执行阻塞生成任务；前端通过 `task_id` 轮询状态。

## 📂 目录结构

```
AI_NovelGenerator/
├── ui/                     # 原 GUI（保留，不动）
├── novel_generator/        # 核心生成逻辑（保留，不动）
├── main.py                 # GUI 入口（保留）
├── server.py               # 🆕 Web 服务入口
├── backend/                # 🆕 FastAPI 后端
│   ├── app.py
│   ├── schemas.py
│   ├── services/{log_bus,task_runner}.py
│   └── routers/{config,files,generation}.py
└── web/                    # 🆕 Vite + React + TS 前端
    ├── src/
    │   ├── App.tsx
    │   ├── components/{Sidebar,LogStream,TextEditor,FormField}.tsx
    │   ├── lib/api.ts
    │   └── pages/{Home,Params,Config,Files}.tsx
    └── package.json
```
