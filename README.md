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
