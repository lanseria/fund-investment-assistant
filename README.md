# 基金投资助手 (Fund Investment Assistant)

[![Nuxt](https://img.shields.io/badge/Nuxt-00DC82?style=for-the-badge&logo=nuxt.js&logoColor=white)](https://nuxt.com/)
[![Vue.js](https://img.shields.io/badge/Vue.js-35495E?style=for-the-badge&logo=vue.js&logoColor=4FC08D)](https://vuejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![UnoCSS](https://img.shields.io/badge/UnoCSS-333333?style=for-the-badge&logo=unocss&logoColor=white)](https://unocss.dev/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org/)

本项目是一个功能全面的基金投资助手，基于 **Nuxt 4** 构建，采用前后端一体化的架构。它旨在帮助用户追踪基金持仓、分析投资组合表现，并通过多种策略分析和 AI 智能决策提供投资支持。

## ✨ 主要功能

### 🔐 用户认证与权限管理

- 基于 **PASETO (v4.local + v4.public)** 的安全令牌机制
- 使用 HttpOnly Cookie 存储 Token，增强安全性
- 支持 `admin` 和 `user` 两种角色，管理员拥有用户管理权限

### 📊 基金持仓管理

- 添加、编辑、删除基金持仓，支持"仅关注"（不填写份额和成本）模式
- 支持普通开放式基金和 QDII-LOF 场内基金两种类型
- 自动计算持仓市值、持有收益、收益率等核心指标
- 支持基金转换操作

### 🔄 实时数据与行情

- **实时估值**: 通过定时任务在交易时间段内自动同步所有基金的实时估值
- **实时推送**: 采用 **Server-Sent Events (SSE)** 技术，数据更新后实时推送到前端
- **手动刷新**: 提供一键刷新所有持仓估值的功能

### 📈 数据可视化与分析

- 使用 ECharts 展示基金历史净值走势，支持 MA5、MA10、MA20 等移动平均线
- 集成多种投资策略（RSI、MACD、布林带、双均线交叉）的信号标注
- 提供独立的 RSI 策略分析图表，包含净值和 RSI 指标的双图展示
- 板块数据分析与市场情报

### 🤖 AI 智能交易

- 基于 OpenRouter API 的 AI 自动交易代理
- 每日市场新闻情感分析
- 智能交易决策与执行日志

### ⚙️ 自动化与定时任务

- **历史数据同步**: 每日凌晨自动同步所有基金的历史净值数据
- **策略分析执行**: 每日早晨自动为所有持仓基金执行策略分析
- **交易处理**: 自动处理待确认交易
- **AI 自动交易**: 工作日下午定时执行 AI 交易策略

### 📦 数据管理

- **导入/导出**: 支持以 JSON 格式一键导出和导入持仓数据
- **排行榜**: 提供用户收益率排行榜，展示匿名化的投资大神表现
- **管理员功能**: 用户管理、字典管理、AI 日志查看

### 🎨 个性化与主题

- 支持亮色/暗色模式一键切换
- 内置多种主题色，用户可自由切换
- 响应式布局，桌面端和移动端均有良好体验

## 🚀 技术栈

### 前端

- **框架**: [Nuxt 4](https://nuxt.com/) (Vue 3.5)
- **UI & 样式**: [UnoCSS](https://unocss.dev/) (presetWind4 - Tailwind 4 风格)
- **状态管理**: [Pinia](https://pinia.vuejs.org/) 3.0
- **图表**: [ECharts](https://echarts.apache.org/)
- **工具库**: `@vueuse/core`, `dayjs`, `es-toolkit`

### 后端 (Nuxt Nitro)

- **ORM**: [Drizzle ORM](https://orm.drizzle.team/) 0.45
- **数据库**: [PostgreSQL](https://www.postgresql.org/)
- **缓存/存储**: [Redis](https://redis.io/)
- **认证**: [paseto-ts](https://github.com/panva/paseto-ts)
- **事件总线**: mitt
- **定时任务**: Nitro Tasks
- **MCP 服务器**: `@nuxtjs/mcp-toolkit`

### 开发与构建

- **包管理器**: [pnpm](https://pnpm.io/) 10 (使用 workspace catalog)
- **代码规范**: [@antfu/eslint-config](https://github.com/antfu/eslint-config)
- **类型检查**: TypeScript 严格模式

## 📁 项目架构

```sh
fund-investment-assistant/
├── app/                      # 前端代码
│   ├── components/            # Vue 组件 (PascalCase)
│   │   ├── charts/            # ECharts 图表组件
│   │   └── strategy-charts/  # 策略分析图表组件
│   ├── composables/           # Pinia Stores & 组合式函数
│   │   ├── useAuthStore.ts    # 认证状态
│   │   ├── useMarketStore.ts  # 市场数据状态
│   │   └── holdings.ts        # 持仓状态
│   ├── layouts/               # 页面布局
│   ├── middleware/            # 路由中间件
│   ├── pages/                 # 页面路由 (文件系统路由)
│   ├── types/                 # TypeScript 类型定义
│   └── utils/                 # 前端工具函数
├── server/                   # 后端代码 (Nitro)
│   ├── routes/api/           # API 路由 (文件系统路由)
│   │   ├── auth/             # 认证 API
│   │   ├── fund/             # 基金 API
│   │   ├── sse/              # SSE 实时推送
│   │   ├── admin/            # 管理员 API
│   │   └── ...
│   ├── database/             # 数据库
│   │   ├── schemas.ts        # Drizzle Schema (fund_app schema)
│   │   └── drizzle/          # 迁移文件
│   ├── middleware/           # 服务器中间件
│   ├── mcp/                 # MCP 服务器定义
│   ├── plugins/              # Nitro 插件 (按数字顺序加载)
│   │   ├── 0.storage.ts      # 存储/Redis 初始化
│   │   ├── 1.paseto.ts      # PASETO 密钥初始化
│   │   └── 2.market-polling.ts
│   ├── tasks/                # Nitro 定时任务
│   │   ├── fund/             # 基金相关任务
│   │   ├── ai/               # AI 任务
│   │   └── initAdmin.ts      # 初始化管理员任务
│   └── utils/                # 后端工具函数
│       └── emitter.ts        # mitt 事件总线
├── shared/                   # 前后端共享代码
├── docs/                     # API 文档
└── public/                   # 静态资源
```

## 🔧 快速开始

### 前置要求

- Node.js 20+
- pnpm 10+
- PostgreSQL 15+
- Redis 7+

### 环境变量配置

创建 `.env` 文件：

```env
# 数据库
NUXT_DB_URL=postgresql://user:password@localhost:5432/fund_app

# Redis
NUXT_REDIS_HOST=localhost
NUXT_REDIS_PASSWORD=

# 外部 API
NUXT_STRATEGY_API_URL=http://localhost:8000
NUXT_OPEN_ROUTER_API_KEY=your_openrouter_api_key

# 定时任务 Cron (可选，有默认值)
CRON_FUND_SYNC_HISTORY=0 2 * * *
CRON_FUND_SYNC_ESTIMATE=* 8-23 * * *
CRON_FUND_RUN_STRATEGIES=0 6 * * *
CRON_FUND_PROCESS_TRANSACTIONS=0 9 * * *
CRON_AI_AUTO_TRADE=30 14 * * 1-5
```

### 安装与运行

```bash
# 安装依赖
pnpm install

# 准备 Nuxt
pnpm prepare

# 生成数据库迁移
pnpm db:generate

# 应用数据库迁移
pnpm db:migrate

# 初始化管理员账户
pnpm nuxt task run initAdmin

# 启动开发服务器
pnpm dev
```

### 常用命令

```bash
# 开发与构建
pnpm dev               # 启动开发服务器
pnpm build             # 构建生产版本
pnpm generate          # 静态站点生成
pnpm preview           # 预览构建产物
pnpm start             # 启动生产服务器
pnpm start:generate    # 启动静态站点预览

# 代码质量
pnpm lint              # ESLint 检查并修复
pnpm typecheck         # TypeScript 类型检查
pnpm coverage          # Vitest 测试覆盖率

# 数据库
pnpm db:generate       # 生成 Drizzle 迁移文件
pnpm db:migrate        # 应用数据库迁移
```

## 📚 API 文档

详细的 API 接口文档请参考 [docs/README.md](./docs/README.md)。

## 🎯 核心模块说明

### 用户认证

使用 PASETO (v4.local + v4.public) 令牌机制，密钥存储在 Redis 中，Token 存储在 HttpOnly Cookie 中。

### 实时数据推送

使用 mitt 事件总线 + Server-Sent Events (SSE) 实现。定时任务完成估值同步后通过 `emitter.emit('holdings:updated')` 触发，SSE 接口监听事件并推送更新给前端。

### 外部策略 API

依赖外部 FastAPI 服务 (`NUXT_STRATEGY_API_URL`) 进行策略分析计算（RSI、MACD、布林带等）。

### 定时任务 (Nitro Tasks)

- `fund:syncHistory` - 历史净值同步 (默认: `0 2 * * *`)
- `fund:syncEstimate` - 实时估值同步 (默认: `* 8-23 * * *`)
- `fund:runStrategies` - 策略分析执行 (默认: `0 6 * * *`)
- `fund:processTransactions` - 交易处理 (默认: `0 9 * * *`)
- `ai:runAutoTrade` - AI 自动交易 (默认: `30 14 * * 1-5`)

### 数据库

PostgreSQL，使用 `fund_app` schema。主要表包括 `users`, `funds`, `holdings`, `fund_nav_history`, `strategy_signals`, `fund_transactions`, `daily_news`, `news_items`, `ai_daily_analysis`, `ai_execution_logs` 等。

## 📝 代码规范

遵循 @antfu/eslint-config：

- 无分号
- 单引号
- 尾随逗号 (多行对象/数组)
- 导入排序
- TypeScript 严格模式

### 命名约定

- **组件**: PascalCase
- **组合式函数**: camelCase 并以 `use` 开头
- **API 路由**: 位于 `server/routes/api/`，使用 Nitro 文件系统路由
- **Pinia Stores**: 位于 `app/composables/`，使用 Composition API 风格

## 🤝 MCP 服务器

项目集成 `@nuxtjs/mcp-toolkit`，MCP 定义位于 `server/mcp/`，访问路径为 `/mcp`。

## 📄 许可证

MIT
