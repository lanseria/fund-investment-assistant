import type { HoldingHistoryPoint } from '~/types/holding'
import { format, parseISO } from 'date-fns'

/**
 * 基金走势图主图上的标注(marks)构建：
 * 策略信号点(B/S pin)、交易点(菱形/圆形)、交易金额柱状序列。
 * 均为纯函数，由 FundChart 传入数据后调用。
 */

export type TransactionType = 'buy' | 'sell' | 'convert_in' | 'convert_out'

/** 交易类型 → ECharts 配色/文案/金额符号（主图金额柱与标注点共用） */
export const transactionMeta: Record<TransactionType, { label: string, color: string, sign: 1 | -1 }> = {
  buy: { label: '买入', color: '#ef4444', sign: 1 },
  sell: { label: '卖出', color: '#22c55e', sign: -1 },
  convert_in: { label: '转入', color: '#a855f7', sign: 1 },
  convert_out: { label: '转出', color: '#3b82f6', sign: -1 },
}

/** 取一笔交易的展示金额：优先确认/申报金额，其次份额 × 净值推算 */
export function getTransactionAmount(tx: any) {
  const candidates = [
    tx.confirmedAmount,
    tx.orderAmount,
  ]

  for (const value of candidates) {
    const amount = Number(value)
    if (!Number.isNaN(amount) && amount > 0)
      return amount
  }

  const shares = Number(tx.confirmedShares ?? tx.orderShares)
  const nav = Number(tx.confirmedNav)

  if (!Number.isNaN(shares) && !Number.isNaN(nav) && shares > 0 && nav > 0)
    return shares * nav

  return null
}

/** 策略信号(买入/卖出)映射为主图净值线上的 B/S pin 标注点 */
export function mapSignalsToMarkPoints(
  signals: any[],
  signalType: '买入' | '卖出',
  isDark: boolean,
): any[] {
  const isBuy = signalType === '买入'
  const color = isBuy ? (isDark ? '#f87171' : '#ef4444') : (isDark ? '#4ade80' : '#22c55e')
  const symbol = isBuy ? 'pin' : 'triangle'
  const symbolRotate = isBuy ? 0 : 180

  return signals
    .filter(s => s.signal.trim() === signalType)
    .map((s) => {
      const dateStr = format(parseISO(s.latestDate), 'yyyy-MM-dd')
      const closeValue = Number(s.latestClose)

      return {
        name: signalType,
        coord: [dateStr, closeValue],
        fullData: s,
        id: s.id,
        symbol,
        symbolRotate,
        symbolSize: 32,
        itemStyle: {
          color,
          borderColor: isDark ? '#1f2937' : '#ffffff',
          borderWidth: 1,
        },
        label: {
          show: true,
          formatter: isBuy ? 'B' : 'S',
          color: '#fff',
          fontSize: 12,
          fontWeight: 'bold' as const,
        },
      }
    })
}

/** 交易记录按日期分组映射为主图上的标注点（同日混合交易用橙色圆形） */
export function mapTransactionsToMarkPoints(
  transactions: any[] | undefined,
  history: HoldingHistoryPoint[],
): any[] {
  if (!transactions || transactions.length === 0)
    return []

  // 1. 按日期分组
  const groupedTxs = new Map<string, any[]>()
  transactions.forEach((tx) => {
    if (!groupedTxs.has(tx.orderDate)) {
      groupedTxs.set(tx.orderDate, [])
    }
    groupedTxs.get(tx.orderDate)!.push(tx)
  })

  const markPoints: any[] = []

  // 2. 遍历分组生成点
  groupedTxs.forEach((txList, date) => {
    // 检查是否包含混合类型
    const types = new Set(txList.map(t => t.type))
    const isMixed = types.size > 1
    const firstType = txList[0].type // 如果不是混合，取第一个类型即可

    let color = '#9ca3af'
    let symbolRotate = 0
    let symbol = 'diamond'

    if (isMixed) {
      color = '#f59e0b' // Orange
      symbol = 'circle' // 混合用圆形
    }
    else {
      // 单一类型样式
      if (firstType === 'buy') {
        color = '#ef4444'
      }
      else if (firstType === 'sell') {
        color = '#22c55e'
        symbolRotate = 180
      }
      else if (firstType === 'convert_in') {
        color = '#a855f7'
      }
      else if (firstType === 'convert_out') {
        color = '#3b82f6'
        symbolRotate = 180
      }
    }

    // 获取该日期的净值 (取第一笔交易的 confirmedNav 或历史净值)
    let val = txList[0].confirmedNav ? Number(txList[0].confirmedNav) : null
    if (!val) {
      const historyPoint = history.find(h => h.date === date)
      if (historyPoint)
        val = historyPoint.nav
    }

    if (!val)
      return

    // 对象字面量中包含自定义属性 transactionList
    markPoints.push({
      name: isMixed ? `交易-混合` : `交易-${firstType}`,
      coord: [date, val],
      transactionList: txList, // 自定义字段
      symbol,
      symbolSize: 18,
      symbolRotate,
      itemStyle: {
        color,
        borderColor: '#fff',
        borderWidth: 1,
      },
      label: { show: false },
      tooltip: { show: false },
    })
  })

  return markPoints
}

/** 构建主图的交易金额柱序列（按类型一柱、同轴堆叠，正负号区分流入/流出） */
export function buildTransactionBarSeries(transactions: any[] | undefined, dates: string[]) {
  const groupedAmounts = new Map<string, Partial<Record<TransactionType, number>>>()

  ;(transactions || []).forEach((tx) => {
    const type = tx.type as TransactionType
    const meta = transactionMeta[type]
    if (!meta || !tx.orderDate)
      return

    const amount = getTransactionAmount(tx)
    if (!amount)
      return

    const signedAmount = amount * meta.sign
    const day = tx.orderDate

    if (!groupedAmounts.has(day))
      groupedAmounts.set(day, {})

    const current = groupedAmounts.get(day)!
    current[type] = (current[type] || 0) + signedAmount
  })

  return (Object.keys(transactionMeta) as TransactionType[]).map((type) => {
    const data = dates.map((date) => {
      const value = groupedAmounts.get(date)?.[type]
      return value === undefined ? null : value
    })

    return {
      name: transactionMeta[type].label,
      type: 'bar' as const,
      yAxisIndex: 1,
      data,
      barMaxWidth: 14,
      barGap: '-100%',
      barCategoryGap: '38%',
      stack: 'transaction-amount',
      itemStyle: {
        color: transactionMeta[type].color,
        opacity: 0.72,
      },
      emphasis: {
        itemStyle: {
          opacity: 0.95,
        },
      },
      z: 1,
    }
  })
}
