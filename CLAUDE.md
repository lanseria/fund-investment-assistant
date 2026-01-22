# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 技术栈

- **框架**: Nuxt 4.2.2 (Vue 3.5.26)
- **样式**: UnoCSS 66.6.0 (使用 presetWind4，即 Tailwind 4 风格)
- **状态管理**: Pinia 3.0.4
- **ORM**: Drizzle ORM 0.45.1
- **数据库**: PostgreSQL
- **缓存**: Redis
- **包管理器**: pnpm 10.28.1 (使用 workspace catalog 管理)
  - Backend catalog: drizzle-orm, pg, etc.
  - Build catalog: nuxt, vite, unocss, etc.
  - Frontend catalog: vue, pinia, echarts, etc.
  - Utils catalog: es-toolkit, dayjs, paseto-ts, etc.
- **代码规范**: @antfu/eslint-config 7.1.0

## 常用命令

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

# 数据库
pnpm db:generate       # 生成 Drizzle 迁移文件
pnpm db:migrate        # 应用数据库迁移

# 任务
pnpm coverage          # Vitest 测试覆盖率
pnpm prepare           # Nuxt 准备
```

## 项目架构

这是一个全栈基金投资助手应用，采用 Nuxt 4 的前后端一体化架构。

### 目录结构

```
fund-investment-assistant/
├── app/                      # 前端代码
│   ├── components/            # Vue 组件
│   │   ├── charts/            # ECharts 图表组件
│   │   └── strategy-charts/  # 策略分析图表组件
│   ├── composables/           # Pinia Stores (状态管理)
│   │   ├── useAuthStore.ts    # 认证状态 (PASETO)
│   │   ├── useMarketStore.ts  # 市场数据状态
│   │   ├── holdings.ts        # 持仓状态
│   │   └── ...
│   ├── layouts/               # 页面布局
│   ├── middleware/            # 路由中间件
│   ├── pages/                 # 页面路由 (文件系统路由)
│   ├── types/                 # TypeScript 类型定义
│   └── utils/                 # 前端工具函数
├── server/                   # 后端代码 (Nitro)
│   ├── routes/api/           # API 路由 (文件系统路由)
│   │   ├── auth/             # 认证 API (login, logout, me, refresh)
│   │   ├── fund/             # 基金 API (holdings, transactions, etc.)
│   │   ├── sse/              # SSE 实时推送 (holdings, market)
│   │   ├── admin/            # 管理员 API
│   │   └── ...
│   ├── database/             # 数据库
│   │   ├── schemas.ts        # Drizzle Schema 定义 (fund_app schema)
│   │   └── drizzle/          # 迁移文件
│   ├── middleware/           # 服务器中间件
│   ├── mcp/                 # MCP 服务器定义
│   ├── plugins/              # Nitro 插件 (按数字顺序加载)
│   │   ├── 0.storage.ts      # 存储/Redis 初始化
│   │   ├── 1.paseto.ts      # PASETO 密钥初始化 (Redis 存储)
│   │   └── 2.market-polling.ts
│   ├── tasks/                # Nitro 定时任务
│   │   ├── fund/             # 基金相关任务
│   │   ├── initAdmin.ts      # 初始化管理员任务
│   │   └── ai/               # AI 任务
│   └── utils/                # 后端工具函数
├── shared/                   # 前后端共享代码
└── public/                   # 静态资源
```

### 核心模块说明

**用户认证**: 使用 PASETO (v4.local + v4.public) 令牌机制，密钥存储在 Redis 中，Token 存储在 HttpOnly Cookie 中。

**实时数据推送**: 使用 mitt 事件总线 + Server-Sent Events (SSE) 实现。定时任务完成估值同步后通过 `emitter.emit('holdings:updated')` 触发，SSE 接口监听事件并推送更新给前端。

**外部策略 API**: 依赖外部 FastAPI 服务 (`NUXT_STRATEGY_API_URL`) 进行策略分析计算（RSI、MACD、布林带等）。

**定时任务** (Nitro Tasks):

- `fund:syncHistory` - 历史净值同步 (默认: `0 2 * * *`)
- `fund:syncEstimate` - 实时估值同步 (默认: `* 8-23 * * *`)
- `fund:runStrategies` - 策略分析执行 (默认: `0 6 * * *`)
- `fund:processTransactions` - 交易处理 (默认: `0 9 * * *`)
- `ai:runAutoTrade` - AI 自动交易 (默认: `30 14 * * 1-5`)
- `initAdmin` - 初始化管理员账户 (手动执行: `pnpm nuxt task run initAdmin`)

**数据库**: PostgreSQL，使用 `fund_app` schema。主要表包括 `users`, `funds`, `holdings`, `fund_nav_history`, `strategy_signals`, `fund_transactions`, `daily_news`, `news_items`, `ai_daily_analysis`, `ai_execution_logs` 等。

### 前后端代码约定

- **组件**: PascalCase 命名
- **组合式函数**: camelCase 并以 `use` 开头
- **API 路由**: 位于 `server/routes/api/`，使用 Nitro 文件系统路由
- **Pinia Stores**: 位于 `app/composables/`，使用 Composition API 风格
- **事件总线**: 使用 mitt (`server/utils/emitter.ts`) 实现跨模块通信

## UnoCSS 配置

- **预设**: presetWind4 (Tailwind 4 风格)
- **快捷类**: `btn`, `icon-btn`, `card`, `input-base`, `font-numeric`
- **图标**: Carbon Icons, Twemoji
- **字体**: DM Sans, DM Serif Display, Roboto Mono

## 代码风格

遵循 @antfu/eslint-config:

- 无分号
- 单引号
- 尾随逗号 (多行对象/数组)
- 导入排序
- TypeScript 严格模式

## MCP 服务器

项目集成 `@nuxtjs/mcp-toolkit`，MCP 定义位于 `server/mcp/`，访问路径为 `/mcp`。

## 环境变量

| 变量                             | 说明                                     |
| -------------------------------- | ---------------------------------------- |
| `NUXT_DB_URL`                    | PostgreSQL 连接字符串                    |
| `NUXT_STRATEGY_API_URL`          | 策略分析 API 地址                        |
| `NUXT_REDIS_HOST`                | Redis 主机                               |
| `NUXT_REDIS_PASSWORD`            | Redis 密码                               |
| `NUXT_OPEN_ROUTER_API_KEY`       | OpenRouter API Key (AI)                  |
| `CRON_FUND_SYNC_HISTORY`         | 历史净值同步 Cron (默认: `0 2 * * *`)    |
| `CRON_FUND_SYNC_ESTIMATE`        | 实时估值同步 Cron (默认: `* 8-23 * * *`) |
| `CRON_FUND_RUN_STRATEGIES`       | 策略分析执行 Cron (默认: `0 6 * * *`)    |
| `CRON_FUND_PROCESS_TRANSACTIONS` | 交易处理 Cron (默认: `0 9 * * *`)        |
| `CRON_AI_AUTO_TRADE`             | AI 自动交易 Cron (默认: `30 14 * * 1-5`) |
