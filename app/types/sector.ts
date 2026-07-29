/**
 * 板块主力资金流向数据（对应 /sector/capital 全量表的单条记录）。
 * amount / mainCapital / retailCapital / mainHidden 原始单位为「亿」的字符串，
 * 例如 "440.19 亿"；排序时需剥离「亿」转为数值。
 */
export interface SectorCapitalItem {
  name: string // 板块名称
  code: string // 板块代码 (BKxxxx)
  changePercent: number // 涨幅 (%)
  amount: string // 成交额（亿元字符串，如 "440.19 亿"）
  mainCapital: string // 主力资金（亿元字符串）
  retailCapital: string // 散户资金（亿元字符串）
  mainHidden: string // 主力暗盘（亿元字符串）
  mainStrength: number // 主力强度 (%)
  mainAction: string // 主力行为：抢筹 / 建仓 / 洗盘 / 出货
}

export type SectorType = 'industry' | 'concept'

/** /sector/capital 全量响应 */
export interface SectorCapitalResponse {
  type: SectorType
  count: number
  sectors: SectorCapitalItem[]
}
