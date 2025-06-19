import { defineVitestConfig } from '@nuxt/test-utils/config'

export default defineVitestConfig({
  test: {
    // 启用类似 Jest 的全局 API (describe, it, expect)，这样就无需手动导入
    globals: true,
    // Vitest 将在这里寻找测试文件
    include: ['test/**/*.spec.ts'],
    // 覆盖率配置
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      // 指定需要被统计覆盖率的文件
      include: [
        'server/utils/**/*.{js,ts}',
        'server/api/**/*.{js,ts}',
      ],
    },
  },
})
