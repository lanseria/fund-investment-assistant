# Fund Investment Assistant - Frontend

这是基金投资助手项目的 **Nuxt 3 前端应用**。它基于功能丰富的 [Vitesse for Nuxt 3](https://github.com/antfu/vitesse-nuxt) 模板构建，负责提供一个美观、响应式且功能强大的用户界面。

## ✨ 主要功能

- **仪表盘**: 以清晰的表格形式展示所有持仓基金，动态显示份额、持有金额、盘中估算金额及涨跌幅。
- **交互式图表**: 为每只基金提供历史净值走势图，支持动态时间范围选择和多条移动平均线（MA）的展示。
- **持仓管理**: 通过美观的模态框（Modal）实现基金持仓的添加、修改和删除操作。
- **数据导入/导出**: 提供 UI 界面，支持通过 JSON 文件备份和恢复核心的持仓数据。
- **响应式设计**: 完美适配桌面和移动设备，提供一致的用户体验。
- **主题切换**: 支持亮色（Light）和暗色（Dark）模式，并能自动适配系统设置。

## 🛠️ 技术栈

- **框架**: [Nuxt 3](https://nuxt.com/) (Vue 3)
- **构建工具**: Vite
- **状态管理**: Pinia
- **样式方案**: [UnoCSS](https://github.com/unocss/unocss) (原子化 CSS)
- **图表库**: ECharts
- **语言**: TypeScript
- **代码规范**: @antfu/eslint-config

## 🚀 快速开始

### 1. 环境准备

- **Node.js**: 建议使用 v18.x 或 v20.x 版本。
- **pnpm**: 推荐使用 `pnpm`作为包管理器。如果尚未安装，请运行：
  ```bash
  npm install -g pnpm
  ```

### 2. 项目配置

- **克隆项目**:

  ```bash
  git clone <your-frontend-repo-url>
  cd <your-frontend-project-name>
  ```

- **安装依赖**:

  ```bash
  pnpm install
  ```

- **后端 API 配置**:
  本项目通过 Nuxt 的服务器代理与后端 API 通信。请确保后端服务正在运行。代理配置位于 `nuxt.config.ts` 的 `nitro.routeRules` 部分。默认配置会将所有 `/api/fund/**` 的请求转发到 `http://127.0.0.1:8000/**`。

  **请确保您的 Python 后端服务正在 `http://127.0.0.1:8000` 上运行。**

### 3. 开发模式

- **启动开发服务器**:
  ```bash
  pnpm run dev
  ```
  应用将运行在 `http://localhost:3000`。得益于 Vite，您将享受到极速的热模块重载（HMR）。

## scripts

- `pnpm run dev`: 启动开发服务器。
- `pnpm run build`: 构建用于生产环境的应用。
- `pnpm run preview`: 在本地预览生产构建的产物。
- `pnpm run lint`: 检查代码风格和规范。
- `pnpm run typecheck`: 进行 TypeScript 类型检查。

## 部署

### 静态站点部署 (SSG)

1.  **生成静态文件**:

    ```bash
    pnpm run generate
    ```

    此命令会预渲染所有页面，并将结果输出到 `.output/public` 目录。

2.  **部署**:
    将 `.output/public` 目录下的所有内容部署到任何静态网站托管平台，如 Netlify, Vercel, GitHub Pages 等。

### Node.js 服务器部署 (SSR)

1.  **构建应用**:

    ```bash
    pnpm run build
    ```

    此命令会构建一个优化的 Node.js 服务器，产物位于 `.output` 目录。

2.  **启动服务器**:
    ```bash
    pnpm run start
    ```
    或者将整个 `.output` 目录部署到您的服务器，并运行 `node .output/server/index.mjs`。

### Docker 部署

项目包含一个 `Dockerfile`，用于将应用打包成一个独立的 Docker 镜像。

1.  **构建镜像**:

    ```bash
    docker build -t fund-frontend:latest .
    ```

2.  **运行容器**:
    ```bash
    docker run -p 3000:3000 fund-frontend:latest
    ```
    应用将在容器的 3000 端口运行，并通过 `-p` 映射到主机的 3000 端口。

## 🏗️ 项目结构

- `app/`: 应用的核心代码目录。
  - `components/`: Vue 组件。
  - `composables/`: Vue 组合式函数 (如 Pinia stores)。
  - `layouts/`: 布局组件。
  - `pages/`: 页面和路由。
  - `types/`: TypeScript 类型定义。
- `public/`: 静态资源，会被直接复制到根目录。
- `server/`: 服务器端代码 (API 路由、中间件)。
- `nuxt.config.ts`: Nuxt 的主配置文件。
- `uno.config.ts`: UnoCSS 的配置文件。

## 📄 License

MIT
