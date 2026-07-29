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

/**
 * 板块绑定关系：项目板块 (字典 sectors 的 value) 与东财板块 (BKxxxx) 的 1 对 1 绑定。
 */
export interface SectorBinding {
  id: number
  /** 项目板块 value (字典 sectors 的 value) */
  dictValue: string
  /** 东财板块代码 (BKxxxx) */
  sectorCode: string
  /** 板块类型 */
  sectorType: SectorType
  /** 东财板块名称快照 */
  sectorName: string | null
  createdAt: string
}

/**
 * 板块主力资金历史回顾数据（对应 GET /api/sectors/[dictValue]/history 响应）。
 */
export interface SectorCapitalHistoryResponse {
  dictValue: string
  sectorCode: string | null
  sectorName: string | null
  sectorType: SectorType | null
  /** 是否已绑定东财板块 */
  bound: boolean
  /** 最新一条快照摘要 */
  latest: {
    date: string
    mainAction: string | null
    mainStrength: number | null
    mainCapital: number | null
    mainHidden: number | null
    changePercent: number | null
  } | null
  /** 图表数据 */
  history: {
    dates: string[]
    mainStrength: (number | null)[]
    mainCapital: (number | null)[]
    mainHidden: (number | null)[]
    changePercent: (number | null)[]
    actions: string[]
  }
}
