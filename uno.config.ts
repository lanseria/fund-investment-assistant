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
  theme: {
    colors: {
      'primary': 'var(--theme-primary)',
      'primary-hover': 'var(--theme-primary-hover)',
    },
  },
  shortcuts: [
    ['btn', 'px-4 py-2 rounded-md inline-block bg-primary text-white cursor-pointer transition-colors duration-200 ease-in-out hover:bg-primary-hover disabled:cursor-default disabled:bg-gray-600 disabled:op-50'],
    ['icon-btn', 'inline-block cursor-pointer op-80 hover:op-100 hover:text-primary disabled:cursor-default disabled:op-50'],
    ['card', 'bg-white dark:bg-gray-800 rounded-lg shadow-md'],
    ['input-base', 'block w-full px-3 py-2 bg-transparent border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary'],
    ['font-numeric', 'font-mono tabular-nums'],
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
