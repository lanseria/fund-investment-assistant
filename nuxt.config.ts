import { env } from 'node:process'
import { appDescription } from './app/constants/index'

const scheduledTasks: Record<string, string[]> = {}

/**
 * 调度器总开关 (DISABLE_SCHEDULER)
 * - 开发模式: 默认禁用定时任务，避免本地 dev 干扰线上数据库 (可通过 DISABLE_SCHEDULER=false 强制启用)
 * - 生产模式: 默认启用定时任务 (可通过 DISABLE_SCHEDULER=true 强制禁用)
 */
const disableScheduler
  = env.DISABLE_SCHEDULER !== undefined
    ? env.DISABLE_SCHEDULER === 'true'
    : env.NODE_ENV === 'development'

// 从环境变量读取 Cron 表达式
const syncHistoryCron = env.CRON_FUND_SYNC_HISTORY ?? '0 2 * * *'
// 同步盘中估值: 9:30 - 16:30 每半小时 (9:30 开盘单独触发 + 10:00-16:30 每半小时)
// 支持逗号分隔多个 cron，便于 env 覆盖时灵活配置
const syncEstimateCrons = (env.CRON_FUND_SYNC_ESTIMATE ?? '30 9 * * *,*/30 10-16 * * *')
  .split(',')
  .map(c => c.trim())
  .filter(Boolean)
const runStrategiesCron = env.CRON_FUND_RUN_STRATEGIES ?? '0 6 * * *'
const processTransactionsCron = env.CRON_FUND_PROCESS_TRANSACTIONS ?? '0 9 * * *'
// AI 自动交易: 工作日 14:30
const runAiTradeCron = env.CRON_AI_AUTO_TRADE ?? '30 14 * * 1-5'
// 清理 AI 用户灰尘份额: 每天 10:00 (在 9:00 处理交易之后)
const cleanDustSharesCron = env.CRON_FUND_CLEAN_DUST ?? '0 10 * * *'
// 注: 板块主力资金快照 (sector:syncCapital) 与 syncEstimate 共用同一组 cron (CRON_FUND_SYNC_ESTIMATE)，
// 盘中 9:30-16:30 每半小时抓取；原独立的 15:30 收盘任务已合并（盘中表达式已覆盖 15:30）。

// 只有当调度器未禁用，且环境变量中设置了有效的 Cron 表达式时，才添加任务
// 注意：nitro scheduledTasks 是 cron → 任务名数组的映射，多个任务共用同一 cron 时
// 必须追加到同一数组，不能直接赋值（否则会覆盖先前注册的任务）。
function addTask(cron: string, task: string) {
  if (scheduledTasks[cron])
    scheduledTasks[cron]!.push(task)
  else
    scheduledTasks[cron] = [task]
}

if (!disableScheduler && syncHistoryCron) {
  addTask(syncHistoryCron, 'fund:syncHistory')
}
if (!disableScheduler && syncEstimateCrons.length) {
  for (const cron of syncEstimateCrons) {
    // 盘中估值与板块主力资金快照共用同一组 cron
    addTask(cron, 'fund:syncEstimate')
    addTask(cron, 'sector:syncCapital')
  }
}
if (!disableScheduler && runStrategiesCron) {
  addTask(runStrategiesCron, 'fund:runStrategies')
}
if (!disableScheduler && processTransactionsCron) {
  addTask(processTransactionsCron, 'fund:processTransactions')
}
if (!disableScheduler && runAiTradeCron) {
  addTask(runAiTradeCron, 'ai:runAutoTrade')
}
if (!disableScheduler && cleanDustSharesCron) {
  addTask(cleanDustSharesCron, 'fund:cleanDustShares')
}

export default defineNuxtConfig({
  modules: [
    '@vueuse/nuxt',
    '@unocss/nuxt',
    '@pinia/nuxt',
    '@nuxtjs/color-mode',
    '@nuxt/eslint',
    'nuxt-echarts',
    '@nuxtjs/mcp-toolkit',
  ],
  ssr: false,

  app: {
    head: {
      link: [
        { rel: 'icon', href: '/favicon.ico', sizes: 'any' },
        { rel: 'icon', type: 'image/svg+xml', href: '/logo.svg' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
      ],
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: appDescription },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
        { name: 'theme-color', media: '(prefers-color-scheme: light)', content: 'white' },
        { name: 'theme-color', media: '(prefers-color-scheme: dark)', content: '#222222' },
      ],
    },
  },

  colorMode: {
    classSuffix: '',
  },

  runtimeConfig: {
    dbUrl: '', // can be overridden by NUXT_DB_URL environment variable
    strategyApiUrl: '', // can be overridden by NUXT_STRATEGY_API_URL environment variable
    redis: {
      host: '',
      password: '',
    },
    openRouterApiKey: '', // NUXT_OPEN_ROUTER_API_KEY
    openRouterBaseUrl: '', // NUXT_OPEN_ROUTER_BASE_URL
    // 是否禁用调度器 (开发模式默认禁用定时任务/轮询)
    disableScheduler,
  },
  devServer: {
    port: 8888,
  },

  experimental: {
    payloadExtraction: false,
    renderJsonPayloads: true,
    typedPages: true,
  },

  compatibilityDate: '2026-02-04',
  nitro: {
    esbuild: {
      options: {
        target: 'esnext',
      },
    },
    scheduledTasks,
    experimental: {
      database: true,
      tasks: true,
      asyncContext: true,
    },
  },
  vite: {
    optimizeDeps: {
      include: [
        'bignumber.js',
        'vue-echarts',
        'markdown-exit',
        'date-fns',
      ],
    },
  },
  echarts: {
    renderer: ['canvas'],
    charts: ['LineChart', 'BarChart'],
    components: [
      'DataZoomComponent',
      'GridComponent',
      'LegendComponent',
      'MarkPointComponent',
      'MarkLineComponent',
      'TitleComponent',
      'TooltipComponent',
      'VisualMapComponent',
    ],
  },
  eslint: {
    config: {
      standalone: false,
      nuxt: {
        sortConfigKeys: true,
      },
    },
  },
  mcp: {
    name: 'Fund Investment Assistant MCP Server',
    route: '/mcp', // Default route for the MCP server
    dir: 'mcp', // Base directory for MCP definitions (relative to server/)
  },
})
