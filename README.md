# 基金投资助手 (Fund Investment Assistant)

[![Nuxt](https://img.shields.io/badge/Nuxt-00DC82?style=for-the-badge&logo=nuxt.js&logoColor=white)](https://nuxt.com/)
[![Vue.js](https://img.shields.io/badge/Vue.js-35495E?style=for-the-badge&logo=vue.js&logoColor=4FC08D)](https://vuejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![UnoCSS](https://img.shields.io/badge/UnoCSS-333333?style=for-the-badge&logo=unocss&logoColor=white)](https://unocss.dev/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org/)

本项目是一个功能全面的基金投资助手，基于 Nuxt 构建，采用前后端一体化的架构。它旨在帮助用户追踪基金持仓、分析投资组合表现，并通过多种策略分析提供投资决策支持。

## ✨ 主要功能

- **用户认证与权限管理**:
  - 基于 PASETO (v4.local 和 v4.public) 的安全令牌机制。
  - 使用 HttpOnly Cookie 存储 Token，增强安全性。
  - 支持 `admin` 和 `user` 两种角色，管理员拥有用户管理权限。

- **基金持仓管理**:
  - 添加、编辑、删除基金持仓，支持“仅关注”（不填写份额和成本）模式。
  - 支持普通开放式基金和 QDII-LOF 场内基金两种类型，以获取不同的实时数据源。
  - 自动计算持仓市值、持有收益、收益率等核心指标。

- **实时数据与行情**:
  - **实时估值**: 通过定时任务在交易时间段内（`* 9-15 * * *`）自动同步所有基金的实时估值。
  - **实时推送**: 采用 **Server-Sent Events (SSE)** 技术，在数据更新后实时将最新的投资组合信息推送到前端，无需手动刷新。
  - **手动刷新**: 提供一键刷新所有持仓估值的功能。

- **数据可视化与分析**:
  - 使用 ECharts 展示基金历史净值走势，并计算 MA5, MA10, MA20 等移动平均线。
  - 集成多种投资策略（如 RSI, MACD, 布林带, 双均线交叉）的信号，并在图表上进行标注。
  - 提供独立的 RSI 策略分析图表，包含净值和RSI指标的双图展示。

- **自动化与定时任务**:
  - **历史数据同步**: 每日凌晨 (`0 2 * * *`) 自动同步所有基金的历史净值数据。
  - **策略分析执行**: 每日早晨 (`0 6 * * *`) 自动为所有持仓基金执行策略分析，并保存最新的交易信号。

- **数据管理**:
  - **导入/导出**: 支持以 JSON 格式一键导出和导入持仓数据，方便数据备份与迁移。
  - **排行榜**: 提供用户收益率排行榜，展示匿名化的投资大神表现。

- **个性化与主题**:
  - 支持亮色/暗色模式一键切换。
  - 内置多种主题色（如默认青色、热情红色），用户可自由切换，提供个性化体验。

- **响应式布局**:
  - 使用 UnoCSS 构建，界面在桌面端和移动端均有良好的展示效果。

## 🚀 技术栈

- **前端**:
  - **框架**: [Nuxt 3](https://nuxt.com/) (Vue 3)
  - **UI & 样式**: [UnoCSS](https://unocss.dev/) (原子化 CSS)
  - **状态管理**: [Pinia](https://pinia.vuejs.org/)
  - **图表**: [ECharts](https://echarts.apache.org/)
  - **工具库**: `@vueuse/core`, `dayjs`

- **后端 (Nuxt Server Engine)**:
  - **ORM**: [Drizzle ORM](https://orm.drizzle.team/)
  - **数据库**: [PostgreSQL](https://www.postgresql.org/)
  - **缓存/存储**: [Redis](https://redis.io/) (用于存储 PASETO 密钥和 Nitro 缓存)
  - **认证**: [paseto-ts](https://github.com/panva/paseto-ts)
  - **定时任务**: Nitro Tasks

- **开发与构建**:
  - **包管理器**: [pnpm](https://pnpm.io/)
  - **代码规范**: [@antfu/eslint-config](https://github.com/antfu/eslint-config)
  - **容器化**: [Docker](https://www.docker.com/)

## 🛠️ 项目设置与运行

### 1. 先决条件

- [Node.js](https://nodejs.org/) (版本 `^22.0`)
- [pnpm](https://pnpm.io/) (版本 `^10.0`)
- [PostgreSQL](https://www.postgresql.org/) 数据库
- [Redis](https://redis.io/)
- 一个用于策略分析的 **外部 FastAPI 服务** (本项目依赖该服务进行策略计算)。

### 2. 克隆仓库

```bash
git clone https://github.com/lanseria/fund-investment-assistant.git
cd fund-investment-assistant
```

### 3. 安装依赖

```bash
pnpm install
```

### 4. 环境配置

在项目根目录创建一个 `.env` 文件，并根据以下示例填入您的配置信息：

```dotenv
# .env.example

# 数据库连接 URL
# 格式: postgresql://<user>:<password>@<host>:<port>/<database>
NUXT_DB_URL="postgresql://user:password@localhost:5432/fund_db"

# Redis 配置
NUXT_REDIS_HOST="127.0.0.1"
NUXT_REDIS_PASSWORD=""

# 外部策略分析 API 的地址
NUXT_STRATEGY_API_URL="http://127.0.0.1:8000"

# 定时任务的 Cron 表达式 (可选，默认为 nuxt.config.ts 中的值)
# CRON_FUND_SYNC_HISTORY='0 2 * * *'
# CRON_FUND_SYNC_ESTIMATE='* 9-15 * * *'
# CRON_FUND_RUN_STRATEGIES='0 6 * * *'
```

### 5. 数据库迁移

本项目使用 Drizzle ORM 管理数据库结构。

首先，你需要一个空的 PostgreSQL 数据库，并在 `.env` 中正确配置 `NUXT_DB_URL`。

然后执行以下命令来创建所有表结构：

```bash
pnpm db:migrate
```

_提示：如果修改了 `server/database/schemas.ts`，可以先运行 `pnpm db:generate` 生成迁移文件，再运行 `pnpm db:migrate`。_

### 6. 初始化管理员账户

首次运行时，您需要创建一个管理员账户。

**方式一：通过命令行任务**

```bash
pnpm nuxt task run initAdmin
```

默认用户名: `admin`，密码: `123456`。请在首次登录后立即修改密码。

**方式二：通过开发 API (仅限开发环境)**
启动开发服务器后，访问 `http://localhost:3000/api/dev/init-admin`。

### 7. 运行开发服务器

```bash
pnpm dev
```

现在，您可以在 `http://localhost:3000` 访问您的应用了。

## 📦 构建与部署

### 1. 构建项目

执行以下命令来构建生产版本的应用：

```bash
pnpm build
```

构建产物会生成在 `.output` 目录。

### 2. 运行生产服务器

```bash
pnpm start
```

该命令会启动一个高性能的 Node.js 服务器来运行您的应用。

### 3. 使用 Docker 部署

项目已提供 `Dockerfile`，可以方便地进行容器化部署。

**构建 Docker 镜像:**

```bash
docker build -t fund-investment-assistant .
```

**运行 Docker 容器:**
确保您的 `.env` 文件已准备好。

```bash
docker run -p 3000:3000 --name fund-app --env-file .env -d fund-investment-assistant
```

**注意**:

- `--env-file .env` 会将您的环境变量传递给容器。
- 确保容器可以访问到您配置的 PostgreSQL 和 Redis 服务。

## 📜 可用脚本

- `pnpm dev`: 启动开发服务器。
- `pnpm build`: 构建生产版本。
- `pnpm start`: 启动生产服务器。
- `pnpm lint`: 检查并修复代码格式。
- `pnpm typecheck`: 进行 TypeScript 类型检查。
- `pnpm db:generate`: 根据 schema 生成 Drizzle 迁移文件。
- `pnpm db:migrate`: 应用数据库迁移。

## 📝 环境变量

| 变量名                     | 描述                             | 默认值         |  必需  |
| -------------------------- | -------------------------------- | -------------- | :----: |
| `NUXT_DB_URL`              | PostgreSQL 数据库的连接字符串。  | -              | **是** |
| `NUXT_STRATEGY_API_URL`    | 外部策略分析 API 的基地址。      | -              | **是** |
| `NUXT_REDIS_HOST`          | Redis 服务器地址。               | -              | **是** |
| `NUXT_REDIS_PASSWORD`      | Redis 密码。                     | -              |   否   |
| `CRON_FUND_SYNC_HISTORY`   | 同步历史净值任务的 Cron 表达式。 | `0 2 * * *`    |   否   |
| `CRON_FUND_SYNC_ESTIMATE`  | 同步实时估值任务的 Cron 表达式。 | `* 9-15 * * *` |   否   |
| `CRON_FUND_RUN_STRATEGIES` | 执行策略分析任务的 Cron 表达式。 | `0 6 * * *`    |   否   |

## 📁 项目结构概览

```
.
├── app/                  # 前端代码 (Vue 组件, Pages, Composables, etc.)
│   ├── components/       # 可复用 Vue 组件
│   ├── composables/      # 可复用组合式函数 (Pinia stores, etc.)
│   ├── layouts/          # 页面布局
│   ├── middleware/       # 路由中间件 (如全局认证)
│   ├── pages/            # 页面路由
│   └── types/            # 全局 TypeScript 类型定义
├── server/               # 后端代码 (API 路由, 数据库, 定时任务)
│   ├── api/              # API 路由
│   ├── database/         # Drizzle ORM schema 和迁移文件
│   ├── middleware/       # 服务器中间件 (如 API 认证)
│   ├── plugins/          # 服务器插件 (如初始化 Redis, PASETO)
│   ├── tasks/            # Nitro 定时任务定义
│   └── utils/            # 后端工具函数 (数据库操作, 数据抓取等)
├── Dockerfile            # Docker 部署文件
├── drizzle.config.ts     # Drizzle Kit 配置文件
├── nuxt.config.ts        # Nuxt 配置文件
├── uno.config.ts         # UnoCSS 配置文件
└── package.json          # 项目依赖与脚本
```

## 📄 许可证

[MIT](./LICENSE) License © 2024-PRESENT [Lanseria](https://github.com/lanseria)
