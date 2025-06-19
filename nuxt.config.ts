import { pwa } from './app/config/pwa'
import { appDescription } from './app/constants/index'

export default defineNuxtConfig({
  modules: [
    '@vueuse/nuxt',
    '@unocss/nuxt',
    '@pinia/nuxt',
    '@nuxtjs/color-mode',
    '@vite-pwa/nuxt',
    '@nuxt/eslint',
    'dayjs-nuxt',
    '@nuxt/test-utils/module',
  ],
  ssr: false,
  devtools: {
    enabled: true,
  },
  app: {
    head: {
      viewport: 'width=device-width,initial-scale=1',
      link: [
        { rel: 'icon', href: '/favicon.ico', sizes: 'any' },
        { rel: 'icon', type: 'image/svg+xml', href: '/nuxt.svg' },
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
  },

  future: {
    compatibilityVersion: 4,
  },

  experimental: {
    // when using generate, payload js assets included in sw precache manifest
    // but missing on offline, disabling extraction it until fixed
    payloadExtraction: false,
    renderJsonPayloads: true,
    typedPages: true,
  },

  compatibilityDate: '2024-08-14',

  nitro: {
    // routeRules: {
    //   // 将所有 /api/fund/** 的请求代理到 Python 后端
    //   '/api/fund/**': {
    //     proxy: `${env.API_BASE_URL || 'http://127.0.0.1:8000'}/**`,
    //   },
    // },
    esbuild: {
      options: {
        target: 'esnext',
      },
    },
    // [重要修改] 新增定时任务配置
    scheduledTasks: {
      // 每天凌晨 2:00 执行历史数据同步任务
      '0 2 * * *': ['fund:syncHistory'],
      // 在周一至周五的 9:30 到 14:30 之间，每小时的30分执行实时估值同步任务
      '30 9-14 * * 1-5': ['fund:syncEstimate'],
    },
    // [重要修改] 开启实验性的 tasks 功能
    experimental: {
      database: true,
      tasks: true,
    },
    prerender: {
      crawlLinks: false,
      routes: ['/'],
    },
  },

  eslint: {
    config: {
      standalone: false,
      nuxt: {
        sortConfigKeys: true,
      },
    },
  },

  pwa,
})
