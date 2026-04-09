<script setup lang="ts">
import type { EChartsOption } from 'echarts'
import type { MarkPointComponentOption } from 'echarts/components'
import type { HoldingHistoryPoint } from '~/types/holding'
import { formatCurrency } from '~/utils/format'

const props = defineProps<{
  history: HoldingHistoryPoint[]
  signals: any[]
  transactions?: any[]
  title: string
  dataZoomStart: number
  dataZoomEnd: number
}>()

const emit = defineEmits(['signal-click', 'transaction-click'])

const colorMode = useColorMode()
provide(THEME_KEY, computed(() => colorMode.value === 'dark' ? 'dark' : 'default'))

type TransactionType = 'buy' | 'sell' | 'convert_in' | 'convert_out'

const transactionMeta: Record<TransactionType, { label: string, color: string, sign: 1 | -1 }> = {
  buy: { label: '买入', color: '#ef4444', sign: 1 },
  sell: { label: '卖出', color: '#22c55e', sign: -1 },
  convert_in: { label: '转入', color: '#a855f7', sign: 1 },
  convert_out: { label: '转出', color: '#3b82f6', sign: -1 },
}

function getTransactionAmount(tx: any) {
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

// 策略信号的映射逻辑
function mapSignalsToMarkPoints(signalType: '买入' | '卖出'): MarkPointComponentOption['data'] {
  const isBuy = signalType === '买入'
  const isDark = colorMode.value === 'dark'
  const color = isBuy ? (isDark ? '#f87171' : '#ef4444') : (isDark ? '#4ade80' : '#22c55e')
  const symbol = isBuy ? 'pin' : 'triangle'
  const symbolRotate = isBuy ? 0 : 180

  return props.signals
    .filter(s => s.signal.trim() === signalType)
    .map((s) => {
      const dateStr = useDayjs()(s.latestDate).format('YYYY-MM-DD')
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
function mapTransactionsToMarkPoints(): MarkPointComponentOption['data'] {
  if (!props.transactions || props.transactions.length === 0)
    return []

  // 1. 按日期分组
  const groupedTxs = new Map<string, any[]>()
  props.transactions.forEach((tx) => {
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
      const historyPoint = props.history.find(h => h.date === date)
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

  return markPoints as MarkPointComponentOption['data']
}

function buildTransactionBarSeries(dates: string[]) {
  const groupedAmounts = new Map<string, Partial<Record<TransactionType, number>>>()

  ;(props.transactions || []).forEach((tx) => {
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

const chartOption = computed<EChartsOption>(() => {
  const dates = props.history.map(p => p.date)
  const navs = props.history.map(p => p.nav)
  const ma5 = props.history.map(p => p.ma5)
  const ma10 = props.history.map(p => p.ma10)
  const ma20 = props.history.map(p => p.ma20)
  const ma120 = props.history.map(p => p.ma120)
  const transactionBarSeries = buildTransactionBarSeries(dates)

  const isDark = colorMode.value === 'dark'
  const textColor = isDark ? '#d1d5db' : '#374151'
  const gridColor = isDark ? '#4b5563' : '#e5e7eb'

  return {
    title: { text: props.title, left: 'center', textStyle: { color: textColor } },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross' },
      formatter: (params: any) => {
        const list = Array.isArray(params) ? params : [params]
        if (list.length === 0)
          return ''

        const date = list[0]?.axisValueLabel || list[0]?.axisValue || ''
        const lines = [`<b>${date}</b>`]
        const seriesOrder = ['净值', 'MA5', 'MA10', 'MA20', 'MA120', '买入', '卖出', '转入', '转出']

        list
          .filter((item: any) => item?.value !== null && item?.value !== undefined)
          .sort((a: any, b: any) => seriesOrder.indexOf(a.seriesName) - seriesOrder.indexOf(b.seriesName))
          .forEach((item: any) => {
            if (item.seriesType === 'bar') {
              const amount = Number(item.value)
              if (Number.isNaN(amount) || amount === 0)
                return
              const absAmount = Math.abs(amount)
              const direction = amount < 0 ? '流出' : '流入'
              lines.push(`${item.marker}${item.seriesName}: ${formatCurrency(absAmount)} <span style="color:${textColor}">(${direction})</span>`)
              return
            }

            if (item.seriesName === '净值') {
              lines.push(`${item.marker}净值: ${Number(item.value).toFixed(4)}`)
              return
            }

            if (typeof item.value === 'number') {
              lines.push(`${item.marker}${item.seriesName}: ${Number(item.value).toFixed(3)}`)
            }
          })

        return lines.join('<br/>')
      },
    },
    legend: {
      data: ['净值', 'MA5', 'MA10', 'MA20', 'MA120', '买入', '卖出', '转入', '转出'],
      top: 40,
      type: 'scroll',
      textStyle: { color: textColor },
    },
    grid: { top: 86, left: '10%', right: '12%', bottom: '18%' },
    xAxis: { type: 'category', data: dates, axisLabel: { color: textColor }, axisLine: { lineStyle: { color: gridColor } } },
    yAxis: [
      {
        type: 'value',
        scale: true,
        axisLabel: { color: textColor, formatter: (val: number) => val.toFixed(3) },
        splitLine: { lineStyle: { color: gridColor } },
      },
      {
        type: 'value',
        scale: true,
        position: 'right',
        axisLabel: { color: textColor, formatter: (val: number) => formatCurrency(val, { minimumFractionDigits: 0, maximumFractionDigits: 0 }) },
        splitLine: { show: false },
        axisLine: { lineStyle: { color: gridColor } },
      },
    ],
    dataZoom: [
      { type: 'inside', start: props.dataZoomStart, end: props.dataZoomEnd, zoomOnMouseWheel: false },
      { type: 'slider', start: props.dataZoomStart, end: props.dataZoomEnd, top: 'auto', bottom: 10, height: 25 },
    ],
    series: [
      {
        name: '净值',
        type: 'line',
        data: navs,
        showSymbol: false,
        z: 3,
        markPoint: {
          symbolKeepAspect: true,
          data: [
            ...mapSignalsToMarkPoints('买入')!,
            ...mapSignalsToMarkPoints('卖出')!,
            ...mapTransactionsToMarkPoints()!,
          ],
          tooltip: {
            formatter: (params: any) => {
              if (params.data && params.data.fullData) {
                const data = params.data.fullData
                return `<b>${data.signal}信号 (ID: ${data.id})</b><br/>日期: ${data.latestDate}<br/>净值: ${Number(data.latestClose).toFixed(4)}<br/>原因: ${data.reason}`
              }
              return params.name
            },
          },
          zlevel: 10,
        },
      },
      { name: 'MA5', type: 'line', data: ma5, showSymbol: false, lineStyle: { type: 'dashed' }, z: 3 },
      { name: 'MA10', type: 'line', data: ma10, showSymbol: false, lineStyle: { type: 'dashed' }, z: 3 },
      { name: 'MA20', type: 'line', data: ma20, showSymbol: false, lineStyle: { type: 'dashed' }, z: 3 },
      { name: 'MA120', type: 'line', data: ma120, showSymbol: false, lineStyle: { type: 'dashed' }, z: 3 },
      ...transactionBarSeries,
    ],
  }
})

function handleChartClick(params: any) {
  if (params.componentType === 'markPoint' && params.data) {
    if (params.data.fullData) {
      emit('signal-click', params.data.fullData)
    }
    // 检查 transactionList
    else if (params.data.transactionList) {
      emit('transaction-click', params.data.transactionList)
    }
  }
}
</script>

<template>
  <VChartFull class="h-100 w-full" :option="chartOption" autoresize @click="handleChartClick" />
</template>
