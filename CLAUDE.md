# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 技术栈

- **框架**: Nuxt 4.2.2 (Vue 3.5.26)
- **样式**: UnoCSS 66.6.0 (使用 presetWind4，即 Tailwind 4 风格)
- **状态管理**: Pinia 3.0.4
- **ORM**: Drizzle ORM 0.45.1
- **数据库**: PostgreSQL
- **缓存**: Redis
- **包管理器**: pnpm 10.28.0 (使用 workspace 和 catalog 管理)
- **代码规范**: @antfu/eslint-config 7.0.1

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
│   ├── api/                  # API 路由 (文件系统路由)
│   │   ├── auth/             # 认证 API
│   │   ├── fund/             # 基金 API
│   │   ├── transactions/     # 交易 API
│   │   └── ...
│   ├── database/             # 数据库
│   │   ├── schemas.ts        # Drizzle Schema 定义
│   │   └── drizzle/          # 迁移文件
│   ├── middleware/           # 服务器中间件
│   ├── plugins/              # Nitro 插件
│   │   ├── 0.storage.ts      # 存储/Redis 初始化
│   │   ├── 1.paseto.ts      # PASETO 认证初始化
│   │   └── 2.market-polling.ts
│   ├── tasks/                # Nitro 定时任务
│   │   ├── fund/             # 基金相关任务
│   │   └── ai/               # AI 任务
│   └── utils/                # 后端工具函数
├── shared/                   # 前后端共享代码
└── public/                   # 静态资源
```

### 核心模块说明

**用户认证**: 使用 PASETO (v4.local + v4.public) 令牌机制，Token 存储在 HttpOnly Cookie 中。

**实时数据推送**: 使用 Server-Sent Events (SSE) 技术在交易时间段内实时推送基金估值更新。

**定时任务** (Nitro Tasks):

- `fund:syncHistory` - 历史净值同步 (默认: `0 2 * * *`)
- `fund:syncEstimate` - 实时估值同步 (默认: `* 8-23 * * *`)
- `fund:runStrategies` - 策略分析执行 (默认: `0 6 * * *`)
- `fund:processTransactions` - 交易处理 (默认: `0 9 * * *`)
- `ai:runAutoTrade` - AI 自动交易 (默认: `40 14 * * 1-5`)

**数据库**: PostgreSQL，主要表包括 `users`, `funds`, `holdings`, `fund_nav_history`, `strategy_signals`, `fund_transactions` 等。

### 前后端代码约定

- **组件**: PascalCase 命名
- **组合式函数**: camelCase 并以 `use` 开头
- **API 路由**: 位于 `server/routes/api/`，使用 Nitro 文件系统路由
- **Pinia Stores**: 位于 `app/composables/`，使用 Composition API 风格

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

## 环境变量

| 变量                       | 说明                     |
| -------------------------- | ------------------------ |
| `NUXT_DB_URL`              | PostgreSQL 连接字符串    |
| `NUXT_STRATEGY_API_URL`    | 策略分析 API 地址        |
| `NUXT_REDIS_HOST`          | Redis 主机               |
| `NUXT_REDIS_PASSWORD`      | Redis �密码              |
| `NUXT_OPEN_ROUTER_API_KEY` | OpenRouter API Key (AI)  |
| `CRON_*`                   | 各定时任务的 Cron 表达式 |
