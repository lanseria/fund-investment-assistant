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
const syncEstimateCron = env.CRON_FUND_SYNC_ESTIMATE ?? '*/30 9-15 * * *' // 默认改为半小时一次，主要依赖客户端轮询
const runStrategiesCron = env.CRON_FUND_RUN_STRATEGIES ?? '0 6 * * *'
const processTransactionsCron = env.CRON_FUND_PROCESS_TRANSACTIONS ?? '0 9 * * *'
// AI 自动交易: 工作日 14:30
const runAiTradeCron = env.CRON_AI_AUTO_TRADE ?? '30 14 * * 1-5'
// 清理 AI 用户灰尘份额: 每天 10:00 (在 9:00 处理交易之后)
const cleanDustSharesCron = env.CRON_FUND_CLEAN_DUST ?? '0 10 * * *'
// 板块主力资金每日快照: 工作日 15:30 收盘后抓取
const syncSectorCapitalCron = env.CRON_SECTOR_SYNC_CAPITAL ?? '30 15 * * 1-5'

// 只有当调度器未禁用，且环境变量中设置了有效的 Cron 表达式时，才添加任务
if (!disableScheduler && syncHistoryCron) {
  scheduledTasks[syncHistoryCron] = ['fund:syncHistory']
}
if (!disableScheduler && syncEstimateCron) {
  scheduledTasks[syncEstimateCron] = ['fund:syncEstimate']
}
if (!disableScheduler && runStrategiesCron) {
  scheduledTasks[runStrategiesCron] = ['fund:runStrategies']
}
if (!disableScheduler && processTransactionsCron) {
  scheduledTasks[processTransactionsCron] = ['fund:processTransactions']
}
if (!disableScheduler && runAiTradeCron) {
  scheduledTasks[runAiTradeCron] = ['ai:runAutoTrade']
}
if (!disableScheduler && cleanDustSharesCron) {
  scheduledTasks[cleanDustSharesCron] = ['fund:cleanDustShares']
}
if (!disableScheduler && syncSectorCapitalCron) {
  scheduledTasks[syncSectorCapitalCron] = ['sector:syncCapital']
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
