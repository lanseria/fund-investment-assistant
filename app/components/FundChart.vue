<!-- File: app/components/FundChart.vue -->
<script setup lang="ts">
import type { EChartsOption } from 'echarts'
import type { MarkPointComponentOption } from 'echarts/components'
import type { HoldingHistoryPoint } from '~/types/holding'

const props = defineProps<{
  history: HoldingHistoryPoint[]
  signals: any[]
  title: string
  dataZoomStart: number
  dataZoomEnd: number
}>()

const emit = defineEmits(['signal-click'])

const colorMode = useColorMode()
provide(THEME_KEY, computed(() => colorMode.value === 'dark' ? 'dark' : 'default'))

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

const chartOption = computed<EChartsOption>(() => {
  const dates = props.history.map(p => p.date)
  const navs = props.history.map(p => p.nav)
  const ma5 = props.history.map(p => p.ma5)
  const ma10 = props.history.map(p => p.ma10)
  const ma20 = props.history.map(p => p.ma20)
  const ma120 = props.history.map(p => p.ma120)

  const isDark = colorMode.value === 'dark'
  const textColor = isDark ? '#d1d5db' : '#374151'

  return {
    title: { text: props.title, left: 'center', textStyle: { color: textColor } },
    tooltip: { trigger: 'axis' },
    legend: { data: ['净值', 'MA5', 'MA10', 'MA20', 'MA120'], top: 40, textStyle: { color: textColor } },
    grid: { top: 70, left: '10%', right: '10%', bottom: '15%' },
    xAxis: { type: 'category', data: dates, axisLabel: { color: textColor } },
    yAxis: { type: 'value', scale: true, axisLabel: { color: textColor, formatter: (val: number) => val.toFixed(3) } },
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
        markPoint: {
          symbolKeepAspect: true,
          data: [
            ...mapSignalsToMarkPoints('买入')!,
            ...mapSignalsToMarkPoints('卖出')!,
          ],
          tooltip: {
            formatter: (params: any) => {
              const data = params.data.fullData
              if (!data)
                return ''
              return `<b>${data.signal}信号 (ID: ${data.id})</b><br/>日期: ${data.latestDate}<br/>净值: ${Number(data.latestClose).toFixed(4)}<br/>原因: ${data.reason}`
            },
          },
          zlevel: 10,
        },
      },
      { name: 'MA5', type: 'line', data: ma5, showSymbol: false, lineStyle: { type: 'dashed' } },
      { name: 'MA10', type: 'line', data: ma10, showSymbol: false, lineStyle: { type: 'dashed' } },
      { name: 'MA20', type: 'line', data: ma20, showSymbol: false, lineStyle: { type: 'dashed' } },
      { name: 'MA120', type: 'line', data: ma120, showSymbol: false, lineStyle: { type: 'dashed' } },
    ],
  }
})

function handleChartClick(params: any) {
  if (params.componentType === 'markPoint' && params.data && params.data.fullData) {
    emit('signal-click', params.data.fullData)
  }
}
</script>

<template>
  <VChartFull class="h-100 w-full" :option="chartOption" autoresize @click="handleChartClick" />
</template>
