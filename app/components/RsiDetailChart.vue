<script setup lang="ts">
import type { EChartsOption } from 'echarts'

// 定义接收的 props 类型，与 API 响应匹配
interface ChartData {
  dates: string[]
  netValues: (number | null)[]
  rsiValues: (number | null)[]
  signals: {
    buy: any[]
    sell: any[]
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
    // 关键：将两个图表的 tooltip 和 dataZoom 联动
    axisPointer: { link: { xAxisIndex: 'all' } },
    tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
    legend: { top: 35, textStyle: { color: textColor } },
    // 关键：定义两个 grid，一个上一个下
    grid: [
      { top: '12%', left: '8%', right: '8%', height: '50%' }, // 上图：净值
      { top: '68%', left: '8%', right: '8%', height: '20%' }, // 下图：RSI
    ],
    // 关键：定义两个 x 轴
    xAxis: [
      { type: 'category', gridIndex: 0, data: dates, axisLabel: { show: false }, axisLine: { lineStyle: { color: gridColor } } }, // 上图x轴
      { type: 'category', gridIndex: 1, data: dates, axisLine: { lineStyle: { color: gridColor } }, axisLabel: { color: textColor } }, // 下图x轴
    ],
    // 关键：定义两个 y 轴
    yAxis: [
      { type: 'value', gridIndex: 0, scale: true, axisLine: { show: true, lineStyle: { color: gridColor } }, splitLine: { lineStyle: { color: [gridColor] } }, axisLabel: { color: textColor } }, // 上图y轴
      { type: 'value', gridIndex: 1, min: 0, max: 100, axisLine: { show: true, lineStyle: { color: gridColor } }, splitLine: { lineStyle: { color: [gridColor] } }, axisLabel: { color: textColor } }, // 下图y轴
    ],
    // 关键：dataZoom 控制所有 x 轴
    dataZoom: [
      { type: 'inside', xAxisIndex: [0, 1], zoomOnMouseWheel: false },
      { type: 'slider', xAxisIndex: [0, 1], top: '92%', height: 20 },
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
        // RSI 曲线上的买卖点
        markPoint: {
          data: [
            ...signals.buy.map(p => ({ ...p, symbol: 'pin', itemStyle: { color: '#ef4444' } })),
            ...signals.sell.map(p => ({ ...p, symbol: 'triangle', symbolRotate: 180, itemStyle: { color: '#22c55e' } })),
          ],
        },
        // RSI 曲线的超买超卖线和区域填充
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
