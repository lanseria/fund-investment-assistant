// 基金定投计划相关类型 (与 server/database/schemas.ts 的 dca_plans 表对应)

export type DcaFrequency = 'daily' | 'weekly' | 'biweekly' | 'monthly'

/** 定投计划 (GET /api/fund/dca-plans 返回项) */
export interface DcaPlan {
  id: number
  fundCode: string
  fundName?: string
  /** 每期定投金额 (元) */
  amount: number
  frequency: DcaFrequency
  /** 扣款日锚点: weekly 1-5 (周一~周五), monthly 1-28; daily/biweekly 为 null */
  anchorDay: number | null
  enabled: boolean
  /** 下次计划扣款日 (YYYY-MM-DD，非交易日顺延) */
  nextExecutionDate: string
  lastExecutionDate: string | null
}

/** 创建/更新定投计划的请求体 */
export interface DcaPlanPayload {
  fundCode?: string
  amount?: number
  frequency?: DcaFrequency
  anchorDay?: number | null
  enabled?: boolean
}
