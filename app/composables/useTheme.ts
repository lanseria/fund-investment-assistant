import { useLocalStorage } from '@vueuse/core'

// 定义主题的类型
export interface Theme {
  'name': string
  'label': string
  'primary': string // 主色
  'primary-hover': string // 悬浮色
}

// 定义所有可用主题
export const themes: Theme[] = [
  {
    'name': 'teal-breeze', // 名字：青色微风
    'label': '默认主题 (青)',
    'primary': '#0d9488', // teal-600
    'primary-hover': '#0f766e', // teal-700
  },
  {
    'name': 'crimson-fire', // 名字：赤红之火
    'label': '热情主题 (红)',
    'primary': '#b91c1c', // red-700
    'primary-hover': '#991b1b', // red-800
  },
]

export function useTheme() {
  // 使用 useLocalStorage 持久化当前主题的名称
  const currentThemeName = useLocalStorage('app-theme', 'teal-breeze')

  // 根据名称找到完整的主题对象
  const currentTheme = computed(() => {
    return themes.find(t => t.name === currentThemeName.value) || themes[0]!
  })

  // 切换到下一个主题
  function cycleTheme() {
    const currentIndex = themes.findIndex(t => t.name === currentThemeName.value)
    const nextIndex = (currentIndex + 1) % themes.length
    currentThemeName.value = themes[nextIndex]!.name
  }

  // 监听主题变化，并更新 <html> 元素的 style
  watch(currentTheme, (newTheme) => {
    if (typeof document !== 'undefined') {
      const root = document.documentElement
      root.style.setProperty('--theme-primary', newTheme.primary)
      root.style.setProperty('--theme-primary-hover', newTheme['primary-hover'])
    }
  }, { immediate: true }) // immediate: true 确保页面加载时就应用主题

  return {
    currentTheme,
    cycleTheme,
  }
}
