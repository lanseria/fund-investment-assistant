// app/constants/chart.ts
export const dateFilterOptions = [
  {
    label: '近1个月',
    value: '1m',
    amount: 1,
    unit: 'month',
  },
  {
    label: '近3个月',
    value: '3m',
    amount: 3,
    unit: 'months',
  },
  {
    label: '近6个月',
    value: '6m',
    amount: 6,
    unit: 'months',
  },
  {
    label: '近1年',
    value: '1y',
    amount: 1,
    unit: 'year',
  },
  { label: '全部', value: 'all' },
]

/**
 * 基金基础走势图中叠加的「沪深300基金占比」系列名。
 * 主图右侧独立 Y 轴（%），与净值/均线共享时间轴，便于对比走势。
 */
export const PENETRATION_SERIES_NAME = '沪深300基金占比'

/** 沪深300基金占比叠加线的配色（与占比页折线一致） */
export const PENETRATION_SERIES_COLOR = '#0ea5e9'

/**
 * 基金基础走势图中叠加的「我的成本」抽象买入线系列名。
 * 以持仓成本价为基准画一条水平虚线：净值高于该线即盈利、低于即亏损。
 */
export const COST_LINE_SERIES_NAME = '我的成本'

/** 「我的成本」抽象买入线配色（琥珀色，与净值/占比线区分，深浅色模式均可读） */
export const COST_LINE_SERIES_COLOR = '#f59e0b'
