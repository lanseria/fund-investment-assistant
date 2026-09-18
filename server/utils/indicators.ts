/**
 * 纯计算技术指标库
 * -----------------------------
 * 不依赖数据库与 Nitro 运行时，便于单测与跨端复用。
 * 计算口径与主流行情软件（通达信/同花顺/东财基金 App）对齐。
 */

/**
 * Wilder RSI（通达信 SMA(X,N,1) 口径）
 * RSI = SMA(MAX(CLOSE-LC,0),N,1) / SMA(ABS(CLOSE-LC),N,1) * 100
 *
 * @param closes 收盘价（基金为单位净值）序列，按时间升序（旧 -> 新）
 * @param period RSI 周期，如 6 / 12 / 24 / 14
 * @returns 最新一日的 RSI（0-100，两位小数）；数据不足 period+1 个、或区间内完全平盘（分母为 0）时返回 null
 */
export function computeRsi(closes: number[], period: number): number | null {
  if (!Number.isInteger(period) || period < 1 || closes.length < period + 1)
    return null

  const diffs: number[] = []
  for (let i = 1; i < closes.length; i++)
    diffs.push(closes[i]! - closes[i - 1]!)

  // SMA(X,N,1)：初值取前 N 个 X 的简单均值，其后按 y = (X + (N-1)*y') / N 递推
  const seedSma = (values: number[]) =>
    values.slice(0, period).reduce((acc, v) => acc + v, 0) / period

  let up = seedSma(diffs.map(d => Math.max(d, 0)))
  let dn = seedSma(diffs.map(d => Math.abs(d)))

  for (let i = period; i < diffs.length; i++) {
    up = (Math.max(diffs[i]!, 0) + (period - 1) * up) / period
    dn = (Math.abs(diffs[i]!) + (period - 1) * dn) / period
  }

  if (dn === 0)
    return up === 0 ? null : 100

  return Number(((up / dn) * 100).toFixed(2))
}

/**
 * 乖离率 Bias（%）：(price - ma) / ma * 100，两位小数。
 * @returns 数值（如 -3.10 表示价格低于均线 3.10%）；price/ma 无效或 ma<=0 时返回 null
 */
export function computeBiasPct(
  price: number | null | undefined,
  ma: number | null | undefined,
): number | null {
  if (price == null || ma == null || ma <= 0 || price <= 0)
    return null
  return Number((((price - ma) / ma) * 100).toFixed(2))
}
