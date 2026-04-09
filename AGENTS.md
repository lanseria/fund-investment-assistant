# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

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
