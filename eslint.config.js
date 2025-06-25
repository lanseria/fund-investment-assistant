// @ts-check
import antfu from '@antfu/eslint-config'
import nuxt from './.nuxt/eslint.config.mjs'

export default antfu(
  {
    unocss: true,
    formatters: true,
    pnpm: true,
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/cypress/**',
      '**/server/database/drizzle/meta/**.json',
    ],
    vue: {
      overrides: {
        'vue/component-name-in-template-casing': ['error', 'PascalCase', {
          registeredComponentsOnly: false,
        }],
        'vue/custom-event-name-casing': ['error', 'kebab-case'],
      },
    },
  },
)
  .append(nuxt())
