<!-- File: app/components/FundChart.vue -->
<script setup lang="ts">
import type { EChartsOption } from 'echarts'
import type { HoldingHistoryPoint } from '~/types/holding'
import { LineChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TitleComponent, TooltipComponent } from 'echarts/components'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { provide } from 'vue'
import VChart, { THEME_KEY } from 'vue-echarts'

const props = defineProps<{
  history: HoldingHistoryPoint[]
  signals: any[] // [新增] 接收策略信号
  title: string
}>()

const emit = defineEmits(['signal-click']) // [新增] 定义事件

use([CanvasRenderer, LineChart, TitleComponent, TooltipComponent, GridComponent, LegendComponent])

const colorMode = useColorMode()
// [修改] 让 ECharts 感知主题变化
provide(THEME_KEY, computed(() => colorMode.value))

// [新增] 将信号数据转换为 ECharts 的 markPoint 格式
function mapSignalsToMarkPoints(signalType: '买入' | '卖出') {
  const color = signalType === '买入' ? '#ef4444' : '#22c55e' // red-500, green-500
  const symbol = signalType === '买入' ? 'pin' : 'arrow'

  return props.signals
    .filter(s => s.signal === signalType)
    .map(s => ({
      name: signalType,
      // `value` 用于 tooltip 显示, `id` 和 `data` 用于点击事件
      value: `${signalType}: ${s.latest_close.toFixed(4)}`,
      id: s.id,
      data: s, // 将完整的信号对象附加到数据点上
      xAxis: s.latest_date,
      yAxis: s.latest_close,
      itemStyle: { color },
      symbol,
      symbolSize: 15,
      label: { show: false },
    }))
}

const chartOption = computed<EChartsOption>(() => {
  const dates = props.history.map(p => p.date.slice(0, 10))
  const navs = props.history.map(p => p.nav)
  const ma5 = props.history.map(p => p.ma5)
  const ma10 = props.history.map(p => p.ma10)
  const ma20 = props.history.map(p => p.ma20)

  const isDark = colorMode.value === 'dark'
  const textColor = isDark ? '#d1d5db' : '#374151'

  return {
    title: { text: props.title, left: 'center', textStyle: { color: textColor } },
    tooltip: { trigger: 'axis' },
    legend: { data: ['净值', 'MA5', 'MA10', 'MA20'], top: 30, textStyle: { color: textColor } },
    grid: { top: 70, left: '10%', right: '10%', bottom: '10%' },
    xAxis: { type: 'category', data: dates, axisLabel: { color: textColor } },
    yAxis: { type: 'value', scale: true, axisLabel: { color: textColor, formatter: (val: number) => val.toFixed(3) } },
    series: [
      {
        name: '净值',
        type: 'line',
        data: navs,
        showSymbol: false,
        // [新增] 在净值线上标记买卖点
        markPoint: {
          data: [
            ...mapSignalsToMarkPoints('买入'),
            ...mapSignalsToMarkPoints('卖出'),
          ],
        },
      },
      { name: 'MA5', type: 'line', data: ma5, showSymbol: false, lineStyle: { type: 'dashed' } },
      { name: 'MA10', type: 'line', data: ma10, showSymbol: false, lineStyle: { type: 'dashed' } },
      { name: 'MA20', type: 'line', data: ma20, showSymbol: false, lineStyle: { type: 'dashed' } },
    ],
  }
})

// [新增] ECharts 点击事件处理
function handleChartClick(params: any) {
  // 检查点击的是否是我们的策略信号点 (markPoint)
  if (params.componentType === 'markPoint' && params.data && params.data.data) {
    // 触发 'signal-click' 事件，并将完整的信号对象传递给父组件
    emit('signal-click', params.data.data)
  }
}
</script>

<template>
  <!-- [修改] 添加 @click 事件监听 -->
  <VChart class="h-100 w-full" :option="chartOption" autoresize @click="handleChartClick" />
</template>
