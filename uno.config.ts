import { createLocalFontProcessor } from '@unocss/preset-web-fonts/local'
import {
  defineConfig,
  presetAttributify,
  presetIcons,
  presetTypography,
  presetWebFonts,
  presetWind4,
  transformerDirectives,
  transformerVariantGroup,
} from 'unocss'

export default defineConfig({
  content: {
    pipeline: {
      include: [
        // 模板类文件（UnoCSS 默认扫描范围）
        /\.(vue|svelte|jsx|tsx|mdx?|astro|elm|php|phtml|html)($|\?)/,
        // 纯 js/ts：composables / utils / strategy-charts 等模块中存在字面量 class
        // （图表高度 h-*、徽章配色等）。新版 UnoCSS 默认管道不含纯 js/ts，
        // 不显式纳入会导致这些样式缺失（如图表高度为 0 整图不显示）。
        /\.(js|mjs|cjs|ts|mts|cts)($|\?)/,
      ],
    },
  },
  theme: {
    colors: {
      'primary': 'var(--theme-primary)',
      'primary-hover': 'var(--theme-primary-hover)',
    },
  },
  shortcuts: [
    // 语义化表面/文本/边框 token：集中定义明暗两套行为，模板中避免裸色值链
    {
      'bg-base': 'bg-white dark:bg-gray-800',
      'bg-secondary': 'bg-gray-50 dark:bg-gray-900',
      'color-base': 'text-gray-900 dark:text-gray-100',
      'color-fade': 'text-gray-500 dark:text-gray-400',
      'border-base': 'border-gray-200 dark:border-gray-700',
      'border-base-strong': 'border-gray-300 dark:border-gray-600',

      // 命名深度层级：模板中禁止裸 z-* 值，堆叠顺序只在这一处维护
      'z-sticky': 'z-10', // 局部粘性内容：表头、吸顶导航、下拉面板、行内提示
      'z-raised': 'z-20', // 高于常规内容的悬浮层：固定角标、悬停抬升
      'z-overlay': 'z-50', // 全局覆盖层：模态框、遮罩、浮动按钮/抽屉
    },
    ['btn', 'px-4 py-2 rounded-md inline-block bg-primary text-white cursor-pointer transition-colors duration-200 ease-in-out hover:bg-primary-hover disabled:cursor-default disabled:bg-gray-600 disabled:op-50'],
    ['btn-sm', 'btn px-3! py-1.5! text-sm'],
    ['input-num', 'input-base font-mono tabular-nums text-center'],
    ['icon-btn', 'inline-block cursor-pointer op-80 hover:op-100 hover:text-primary disabled:cursor-default disabled:op-50'],
    ['card', 'bg-base rounded-lg shadow-md'],
    ['input-base', 'block w-full px-3 py-2 bg-transparent border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary'],
  ],
  presets: [
    presetWind4({
      preflights: {
        reset: true,
      },
    }),
    presetAttributify(),
    presetIcons({
      scale: 1.2,
    }),
    presetTypography(),
    presetWebFonts({
      themeKey: 'font',
      fonts: {
        sans: 'DM Sans',
        serif: 'DM Serif Display',
        mono: 'Roboto Mono',
      },
      processors: createLocalFontProcessor(),
    }),
  ],
  transformers: [
    transformerDirectives(),
    transformerVariantGroup(),
  ],
})
