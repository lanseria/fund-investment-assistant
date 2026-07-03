import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const r = (p: string) => resolve(fileURLToPath(new URL('.', import.meta.url)), p)

export default defineConfig({
  test: {
    // server 纯逻辑用 node 环境即可,无需启动完整 Nuxt 实例,保持测试快速。
    // 刻意不使用 @nuxt/test-utils 的 defineVitestConfig,否则会加载 Nuxt 的
    // vite 插件(unimport),把裸 useRuntimeConfig 编译成对 nuxt 模块的 import,
    // 从而在测试中报 "[nuxt] instance unavailable"。改用全局注入桩函数(见测试文件)。
    environment: 'node',
    include: ['**/*.test.ts'],
    exclude: ['node_modules/**', '.nuxt/**', '.output/**', 'dist/**'],
    globals: true,
  },
  resolve: {
    alias: {
      // 解析 Nuxt 的 ~~/ 别名(指向项目根目录),使 vitest 能直接 import 源码
      '~~/': `${r('./')}/`,
      '~~': r('./'),
    },
  },
})
