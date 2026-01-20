import { env } from 'node:process'
import { appDescription } from './app/constants/index'

const scheduledTasks: Record<string, string[]> = {}

// 从环境变量读取 Cron 表达式
const syncHistoryCron = env.CRON_FUND_SYNC_HISTORY ?? '0 2 * * *'
const syncEstimateCron = env.CRON_FUND_SYNC_ESTIMATE ?? '* 8-23 * * *'
const runStrategiesCron = env.CRON_FUND_RUN_STRATEGIES ?? '0 6 * * *'
const processTransactionsCron = env.CRON_FUND_PROCESS_TRANSACTIONS ?? '0 9 * * *'
// AI 自动交易: 工作日 14:30
const runAiTradeCron = env.CRON_AI_AUTO_TRADE ?? '30 14 * * 1-5'

// 只有当环境变量中设置了有效的 Cron 表达式时，才添加任务
if (syncHistoryCron) {
  scheduledTasks[syncHistoryCron] = ['fund:syncHistory']
}
if (syncEstimateCron) {
  scheduledTasks[syncEstimateCron] = ['fund:syncEstimate']
}
if (runStrategiesCron) {
  scheduledTasks[runStrategiesCron] = ['fund:runStrategies']
}
if (processTransactionsCron) {
  scheduledTasks[processTransactionsCron] = ['fund:processTransactions']
}
if (runAiTradeCron) {
  scheduledTasks[runAiTradeCron] = ['ai:runAutoTrade']
}

export default defineNuxtConfig({
  modules: [
    '@vueuse/nuxt',
    '@unocss/nuxt',
    '@pinia/nuxt',
    '@nuxtjs/color-mode',
    '@nuxt/eslint',
    'dayjs-nuxt',
    'nuxt-echarts',
    '@nuxtjs/mcp-toolkit',
  ],
  ssr: false,
  devtools: {
    enabled: false,
  },
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
  },

  routeRules: {
    // [重要] Webhook 接口必须豁免 CSRF 检查，因为它们来自外部服务器
    '/api/webhooks/**': {
      security: {
        csrf: false,
      },
    },
    '/api/dev/**': {
      security: {
        csrf: false,
      },
    },
  },

  experimental: {
    payloadExtraction: false,
    renderJsonPayloads: true,
    typedPages: true,
  },

  compatibilityDate: '2025-06-25',

  nitro: {
    moduleSideEffects: ['dayjs/plugin/isBetween'],
    esbuild: {
      options: {
        target: 'esnext',
      },
    },
    scheduledTasks,
    experimental: {
      database: true,
      tasks: true,
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
    name: 'My MCP Server',
    route: '/mcp', // Default route for the MCP server
    dir: 'mcp', // Base directory for MCP definitions (relative to server/)
  },

})
