/**
 * 板块主力行为的统一样式映射。
 * 图表折线(markPoint/tooltip 徽章)与页面摘要 badge 共用，避免各处配色口径漂移。
 */

/** 板块主力行为 → 图表配色与缩写（用于主力强度子图的 markPoint 标注） */
export const SECTOR_ACTION_STYLE: Record<string, { color: string, label: string }> = {
  抢筹: { color: '#ef4444', label: '抢' },
  建仓: { color: '#f97316', label: '建' },
  洗盘: { color: '#9ca3af', label: '洗' },
  出货: { color: '#22c55e', label: '出' },
}

/** 主力强度配色：正值偏多 → 红，负值偏空 → 绿 */
export const STRENGTH_COLOR_POS = '#ef4444'
export const STRENGTH_COLOR_NEG = '#22c55e'

/** ECharts tooltip 内嵌的主力行为徽章 HTML（抢筹/建仓/洗盘/出货） */
export function buildActionBadgeHtml(action: string): string {
  const color = SECTOR_ACTION_STYLE[action]?.color || '#999'
  return `<span style="display:inline-block;padding:1px 5px;border-radius:3px;color:#fff;background:${color};font-size:11px">${action}</span>`
}

/**
 * 主力行为 badge 的 Tailwind 配色（页面摘要/表格用）。
 * 抢筹/建仓 偏多（红橙），洗盘 中性（灰），出货 偏空（绿）。
 */
export function getActionBadgeClass(action: string): string {
  switch (action) {
    case '抢筹':
      return 'text-red-600 border-red-100 bg-red-50 dark:text-red-400 dark:border-red-800 dark:bg-red-900/20'
    case '建仓':
      return 'text-orange-600 border-orange-100 bg-orange-50 dark:text-orange-400 dark:border-orange-800 dark:bg-orange-900/20'
    case '洗盘':
      return 'text-gray-500 border-gray-200 bg-gray-50 dark:text-gray-400 dark:border-gray-600 dark:bg-gray-700/40'
    case '出货':
      return 'text-green-600 border-green-100 bg-green-50 dark:text-green-400 dark:border-green-800 dark:bg-green-900/20'
    default:
      return 'text-gray-500 border-gray-200 bg-gray-50 dark:text-gray-400 dark:border-gray-600 dark:bg-gray-700/40'
  }
}
