import { env } from 'node:process'
import { appDescription } from './app/constants/index'

const scheduledTasks: Record<string, string[]> = {}

// 从环境变量读取 Cron 表达式
const syncHistoryCron = env.CRON_FUND_SYNC_HISTORY ?? '0 2 * * *'
const syncEstimateCron = env.CRON_FUND_SYNC_ESTIMATE ?? '* 9-15 * * *'
const runStrategiesCron = env.CRON_FUND_RUN_STRATEGIES ?? '0 6 * * *'

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
export default defineNuxtConfig({
  modules: [
    '@vueuse/nuxt',
    '@unocss/nuxt',
    '@pinia/nuxt',
    '@nuxtjs/color-mode',
    '@nuxt/eslint',
    'dayjs-nuxt',
    'nuxt-echarts',
  ],
  ssr: true,
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
  },

  future: {
    compatibilityVersion: 4,
  },

  experimental: {
    payloadExtraction: false,
    renderJsonPayloads: true,
    typedPages: true,
  },

  compatibilityDate: '2025-06-25',

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
    },
  },
  vite: {
    optimizeDeps: {
      include: [
        'dayjs',
        'dayjs/plugin/updateLocale',
        'dayjs/plugin/relativeTime',
        'dayjs/plugin/utc',
        'vue-echarts',

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
})
