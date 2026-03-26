<script setup lang="ts">
import type { EChartsOption } from 'echarts'
import type { HoldingHistoryPoint } from '~/types/holding'

const props = defineProps<{
  history: HoldingHistoryPoint[]
  signals: any[]
  transactions?: any[] // 交易记录属性
}>()

const chartOption = computed<EChartsOption>(() => {
  if (!props.history || props.history.length === 0)
    return {}

  // 根据首尾数据判断整体趋势，决定图表颜色
  const firstNav = props.history[0]?.nav ?? 0
  const lastNav = props.history.at(-1)?.nav ?? 0
  const mainColor = lastNav >= firstNav ? '#ef4444' : '#22c55e' // 红涨绿跌

  // 信号点映射逻辑
  const mapSignalsToMarkPoints = (signalType: '买入' | '卖出') => {
    const isBuy = signalType === '买入'
    return props.signals
      .filter(s => s.signal.trim() === signalType)
      .map(s => ({
        name: signalType,
        coord: [s.latestDate, Number(s.latestClose)],
        symbol: isBuy ? 'circle' : 'triangle',
        symbolRotate: isBuy ? 0 : 180,
        symbolSize: 8,
        itemStyle: {
          color: isBuy ? '#ef4444' : '#22c55e',
        },
      }))
  }

  // 将交易记录映射到图表上的打点逻辑
  const mapTransactionsToMarkPoints = () => {
    if (!props.transactions || props.transactions.length === 0)
      return []

    const groupedTxs = new Map<string, any[]>()
    props.transactions.forEach((tx) => {
      if (!groupedTxs.has(tx.orderDate)) {
        groupedTxs.set(tx.orderDate, [])
      }
      groupedTxs.get(tx.orderDate)!.push(tx)
    })

    const markPoints: any[] = []

    groupedTxs.forEach((txList, date) => {
      const types = new Set(txList.map(t => t.type))
      const isMixed = types.size > 1
      const firstType = txList[0].type

      let color = '#9ca3af'
      let symbolRotate = 0
      let symbol = 'diamond'

      if (isMixed) {
        color = '#f59e0b' // 混合交易标记为橙色圆点
        symbol = 'circle'
      }
      else {
        if (firstType === 'buy') { color = '#ef4444' }
        else if (firstType === 'sell') { color = '#22c55e'; symbolRotate = 180 }
        else if (firstType === 'convert_in') { color = '#a855f7' }
        else if (firstType === 'convert_out') { color = '#3b82f6'; symbolRotate = 180 }
      }

      let val = txList[0].confirmedNav ? Number(txList[0].confirmedNav) : null
      if (!val) {
        const historyPoint = props.history.find(h => h.date === date)
        if (historyPoint)
          val = historyPoint.nav
      }

      if (!val)
        return

      markPoints.push({
        name: isMixed ? `交易-混合` : `交易-${firstType}`,
        coord: [date, val],
        symbol,
        symbolSize: 8, // Mini版图标尺寸缩小
        symbolRotate,
        itemStyle: { color },
      })
    })

    return markPoints
  }

  return {
    grid: { top: 10, right: 10, bottom: 10, left: 10 },
    xAxis: { type: 'category', show: false, data: props.history.map(p => p.date) },
    yAxis: { type: 'value', show: false, scale: true },
    tooltip: { show: false }, // 禁用交互
    series: [
      {
        name: '净值',
        type: 'line',
        data: props.history.map(p => p.nav),
        showSymbol: false,
        lineStyle: { color: mainColor, width: 2 },
        areaStyle: { color: mainColor, opacity: 0.1 },
        markPoint: {
          data: [
            ...mapSignalsToMarkPoints('买入'),
            ...mapSignalsToMarkPoints('卖出'),
            ...mapTransactionsToMarkPoints(), // 加入交易记录的渲染
          ],
        },
      },
      // 简化均线
      { name: 'MA5', type: 'line', data: props.history.map(p => p.ma5), showSymbol: false, lineStyle: { width: 1, type: 'dashed', opacity: 0.5 } },
      { name: 'MA20', type: 'line', data: props.history.map(p => p.ma20), showSymbol: false, lineStyle: { width: 1, type: 'dashed', opacity: 0.5 } },
      { name: 'MA120', type: 'line', data: props.history.map(p => p.ma120), showSymbol: false, lineStyle: { width: 1, type: 'dashed', opacity: 0.5 } },
    ],
  }
})
</script>

<template>
  <VChartFull class="h-full w-full" :option="chartOption" autoresize />
</template>
