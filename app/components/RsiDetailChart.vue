<script setup lang="ts">
import type { EChartsOption } from 'echarts'
// ... imports from echarts

interface ChartData {
  dates: string[]
  netValues: (number | null)[]
  rsiValues: (number | null)[]
  signals: {
    buy: { coord: [string, number], value: string }[]
    sell: { coord: [string, number], value: string }[]
  }
  config: {
    rsiPeriod: number
    rsiUpper: number
    rsiLower: number
  }
}

const props = defineProps<{
  data: ChartData
  title: string
  // [新增] 接收 dataZoom 控制参数
  dataZoomStart: number
  dataZoomEnd: number
}>()

const colorMode = useColorMode()
provide(THEME_KEY, computed(() => colorMode.value))

const chartOption = computed<EChartsOption>(() => {
  const isDark = colorMode.value === 'dark'
  const textColor = isDark ? '#d1d5db' : '#374151'
  const gridColor = isDark ? '#4b5563' : '#e5e7eb'

  const { dates, netValues, rsiValues, signals, config } = props.data

  return {
    title: { text: props.title, left: 'center', textStyle: { color: textColor } },
    axisPointer: { link: { xAxisIndex: 'all' } },
    tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
    legend: { top: 35, textStyle: { color: textColor }, data: ['基金净值', `RSI(${config.rsiPeriod})`] },
    grid: [
      { top: '12%', left: '8%', right: '8%', height: '50%' },
      { top: '68%', left: '8%', right: '8%', height: '20%' },
    ],
    xAxis: [
      { type: 'category', gridIndex: 0, data: dates, axisLabel: { show: false }, axisLine: { lineStyle: { color: gridColor } } },
      { type: 'category', gridIndex: 1, data: dates, axisLine: { lineStyle: { color: gridColor } }, axisLabel: { color: textColor } },
    ],
    yAxis: [
      { type: 'value', gridIndex: 0, scale: true, axisLine: { show: true, lineStyle: { color: gridColor } }, splitLine: { lineStyle: { color: [gridColor] } }, axisLabel: { color: textColor, formatter: (val: number) => val.toFixed(3) } }, // 格式化净值
      { type: 'value', gridIndex: 1, min: 0, max: 100, axisLine: { show: true, lineStyle: { color: gridColor } }, splitLine: { lineStyle: { color: [gridColor] } }, axisLabel: { color: textColor } },
    ],
    // [修改] 使用 props 控制 dataZoom
    dataZoom: [
      { type: 'inside', xAxisIndex: [0, 1], start: props.dataZoomStart, end: props.dataZoomEnd, zoomOnMouseWheel: false },
      { type: 'slider', xAxisIndex: [0, 1], top: '92%', height: 20, start: props.dataZoomStart, end: props.dataZoomEnd },
    ],
    series: [
      // 上图系列：净值曲线
      {
        name: '基金净值',
        type: 'line',
        data: netValues,
        xAxisIndex: 0,
        yAxisIndex: 0,
        showSymbol: false,
        lineStyle: { color: '#3b82f6' },
        // [修改] 将买卖点标记移到这里
        markPoint: {
          symbolSize: 32,
          data: [
            // API返回的signals.buy的coord是 [date, rsiValue]，我们需要找到那天的净值来定位
            ...signals.buy.map((p) => {
              const dateIndex = dates.indexOf(p.coord[0])
              const netValue = dateIndex !== -1 ? netValues[dateIndex] : null
              return netValue ? { name: '买入', coord: [p.coord[0], netValue], symbol: 'pin', itemStyle: { color: '#ef4444' } } : null
            }).filter(p => p),
            ...signals.sell.map((p) => {
              const dateIndex = dates.indexOf(p.coord[0])
              const netValue = dateIndex !== -1 ? netValues[dateIndex] : null
              return netValue ? { name: '卖出', coord: [p.coord[0], netValue], symbol: 'triangle', symbolRotate: 180, itemStyle: { color: '#22c55e' } } : null
            }).filter(p => p),
          ],
          label: {
            show: true,
            formatter: (p: any) => p.name === '买入' ? 'B' : 'S',
            color: '#fff',
            fontSize: 12,
            fontWeight: 'bold' as const,
          },
        },
      },
      // 下图系列：RSI 曲线
      {
        name: `RSI(${config.rsiPeriod})`,
        type: 'line',
        data: rsiValues,
        xAxisIndex: 1,
        yAxisIndex: 1,
        showSymbol: false,
        lineStyle: { color: '#8b5cf6' },
        // [移除] markPoint 从这里移除
        markLine: {
          silent: true,
          symbol: 'none',
          data: [
            { yAxis: config.rsiUpper, lineStyle: { color: '#f87171', type: 'dashed' }, label: { formatter: `超买线: ${config.rsiUpper}` } },
            { yAxis: config.rsiLower, lineStyle: { color: '#4ade80', type: 'dashed' }, label: { formatter: `超卖线: ${config.rsiLower}` } },
          ],
        },
        markArea: {
          silent: true,
          itemStyle: { opacity: 0.15 },
          data: [
            [{ yAxis: config.rsiUpper, itemStyle: { color: '#ef4444' } }, { yAxis: 100 }],
            [{ yAxis: config.rsiLower, itemStyle: { color: '#22c55e' } }, { yAxis: 0 }],
          ],
        },
      },
    ],
  }
})
</script>

<template>
  <VChart class="h-150 w-full" :option="chartOption" autoresize />
</template>
