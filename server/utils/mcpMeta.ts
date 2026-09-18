/**
 * MCP 响应统一元信息外壳
 * -----------------------------
 * 让客户端 AI 不依赖源码/追问即可知道：数据是什么时候的、什么单位、各区块的新鲜度。
 * 结构约定（对所有结构化 MCP 工具一致）：
 * {
 *   meta: { as_of, generated_at, currency, unit_convention, staleness },
 *   data: { ...原有内容... }
 * }
 */

export interface McpMeta {
  /** 响应主数据的基准日 (yyyy-MM-dd)；多市场混合数据时为主市场基准日，并在 as_of_note 中说明 */
  as_of: string | null
  /** as_of 的补充说明（如"美股条目见各自 as_of"），无则省略 */
  as_of_note?: string
  /** 响应生成时间，ISO8601 含时区偏移（如 2026-09-18T15:00:00+08:00） */
  generated_at: string
  /** 金额币种；指数点位等无币种数据为 null */
  currency: string | null
  /** 百分比口径：所有 *_pct / *Rate / change_percent 类字段均为"百分数数值"，如 -27.02 表示 -27.02%，不是比率 0.27 */
  unit_convention: 'percent_values_are_percent_not_ratio'
  /** 各数据区块的新鲜度：键为区块名，值为 'T-0' / 'T-1' / 'realtime' 等口径说明 */
  staleness: Record<string, string>
}

/** 生成本地时区的 ISO8601 时间戳（含 +08:00 形式偏移，而非 Z 结尾） */
export function isoWithLocalOffset(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const offsetMin = -date.getTimezoneOffset()
  const sign = offsetMin >= 0 ? '+' : '-'
  const abs = Math.abs(offsetMin)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
}

/** 本地时区的今天，yyyy-MM-dd */
export function localDateStr(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/**
 * 构建 MCP 响应的 meta 外壳
 */
export function buildMcpMeta(options: {
  /** 主数据基准日 */
  asOf?: string | null
  /** 基准日补充说明 */
  asOfNote?: string
  /** 币种，默认人民币；无币种数据传 null */
  currency?: string | null
  /** 各区块新鲜度说明 */
  staleness?: Record<string, string>
}): McpMeta {
  return {
    as_of: options.asOf ?? null,
    ...(options.asOfNote ? { as_of_note: options.asOfNote } : {}),
    generated_at: isoWithLocalOffset(),
    currency: options.currency === undefined ? 'CNY' : options.currency,
    unit_convention: 'percent_values_are_percent_not_ratio',
    staleness: options.staleness ?? {},
  }
}
