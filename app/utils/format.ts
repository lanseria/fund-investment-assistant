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
    minimumFractionDigits: minDigits = 4,
    maximumFractionDigits: maxDigits = 4,
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
