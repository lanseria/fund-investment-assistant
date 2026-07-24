/**
 * 格式化货币金额（人民币）
 * @param value - 要格式化的数值
 * @param options - 格式化选项
 * @param options.minimumFractionDigits - 最小小数位数，默认 4
 * @param options.maximumFractionDigits - 最大小数位数，默认 4
 * @returns 格式化后的货币字符串
 */
export function formatCurrency(
  value: number | string | null | undefined,
  options: {
    minimumFractionDigits?: number
    maximumFractionDigits?: number
  } = {},
): string {
  const {
    minimumFractionDigits: minDigits = 2,
    maximumFractionDigits: maxDigits = 2,
  } = options

  const num = Number(value)

  if (Number.isNaN(num) || value === null || value === undefined)
    return '-'

  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: 'CNY',
    minimumFractionDigits: minDigits,
    maximumFractionDigits: maxDigits,
  }).format(num)
}

/**
 * 紧凑货币格式化：大额数字自动换算为"万"单位，适合列表/卡片等空间紧凑场景。
 * 例如 128450 → ¥12.85万，-1234.5 → ¥-1234.50
 */
export function formatCurrencyCompact(value: number | string | null | undefined): string {
  const num = Number(value)
  if (Number.isNaN(num) || value === null || value === undefined)
    return '-'

  // 绝对值 ≥ 1万 时用"万"单位
  if (Math.abs(num) >= 10000)
    return `¥${(num / 10000).toFixed(2)}万`

  return formatCurrency(num)
}

/**
 * 格式化涨跌幅百分比，自动补正负号。
 * @param change 涨跌幅数值（如 0.86 表示 0.86%），null/undefined 显示 '-'
 * @param digits 小数位数，默认 2
 * @returns 如 '+0.86%' / '-1.20%' / '-'
 */
export function formatChange(change: number | string | null | undefined, digits = 2): string {
  const num = Number(change)
  if (Number.isNaN(num) || change === null || change === undefined)
    return '-'
  const sign = num > 0 ? '+' : ''
  return `${sign}${num.toFixed(digits)}%`
}

/**
 * 根据涨跌幅返回红/绿/灰的 Tailwind 颜色类（A 股习惯：红涨绿跌）。
 */
export function getChangeColorClass(change: number | string | null | undefined): string {
  const num = Number(change)
  if (Number.isNaN(num) || change === null || change === undefined || num === 0)
    return 'text-gray-500 dark:text-gray-400'
  return num > 0 ? 'text-red-500 dark:text-red-400' : 'text-green-500 dark:text-green-400'
}

/**
 * 涨跌图例常量，供页面在表格旁标注"红涨绿跌"说明。
 */
export const CHANGE_LEGEND = '红涨绿跌'
