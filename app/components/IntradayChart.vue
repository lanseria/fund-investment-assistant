<script setup lang="ts">
import type { EChartsOption } from 'echarts'
import type { IntradayPoint } from '~/types/realtime'

/**
 * 盘中分时估值图。
 * - x 轴:交易时段时间(HH:mm)
 * - y 轴:估算净值,昨日净值作 markLine 基准线
 * - 红涨绿跌:整日涨跌方向决定折线/区域颜色(A 股习惯)
 * - intraday 为空数组时显示空状态提示
 */
const props = defineProps<{
  intraday: IntradayPoint[]
  /** 上一交易日单位净值,用作基准线 */
  yesterdayNav?: string | number | null
}>()

const colorMode = useColorMode()
provide(THEME_KEY, computed(() => colorMode.value === 'dark' ? 'dark' : 'default'))

// 昨日净值基准(用于 markLine 与涨跌方向判定)
const baseNav = computed(() => {
  const v = props.yesterdayNav
  if (v === null || v === undefined || v === '')
    return null
  const num = Number(v)
  return Number.isNaN(num) ? null : num
})

const hasData = computed(() => Array.isArray(props.intraday) && props.intraday.length > 0)

const chartOption = computed<EChartsOption>(() => {
  const isDark = colorMode.value === 'dark'
  const textColor = isDark ? '#d1d5db' : '#374151'
  const gridColor = isDark ? '#374151' : '#f3f4f6'

  const times = props.intraday.map(p => p.time)
  const values = props.intraday.map(p => Number(p.value))

  // 红涨绿跌:用最后一个有效点 vs 昨日净值判定方向
  let isUp = true
  const lastValue = values[values.length - 1]
  if (baseNav.value !== null && lastValue !== undefined && !Number.isNaN(lastValue)) {
    isUp = lastValue >= baseNav.value
  }
  const lineColor = isUp ? '#ef4444' : '#22c55e'

  // y 轴范围:若已知基准,以基准为中心对称展开,使基准线居中,涨跌幅直观
  let yMin: number | undefined
  let yMax: number | undefined
  if (baseNav.value !== null) {
    const validValues = values.filter(v => !Number.isNaN(v))
    if (validValues.length > 0) {
      const maxDelta = Math.max(
        Math.abs(Math.max(...validValues) - baseNav.value),
        Math.abs(Math.min(...validValues) - baseNav.value),
        baseNav.value * 0.0005, // 至少留一点呼吸空间
      )
      yMin = baseNav.value - maxDelta
      yMax = baseNav.value + maxDelta
    }
  }

  return {
    tooltip: {
      trigger: 'axis',
      formatter: (params: any) => {
        const p = params[0]
        if (!p || p.value === undefined || p.value === null)
          return ''
        const baseText = baseNav.value !== null
          ? `<br/>较昨: <span style="color:${lineColor};font-weight:bold">${(((p.value - baseNav.value) / baseNav.value) * 100).toFixed(2)}%</span>`
          : ''
        return `${p.axisValue}<br/>估值: <span style="font-weight:bold">${Number(p.value).toFixed(4)}</span>${baseText}`
      },
    },
    grid: { top: 20, right: 20, bottom: 30, left: 50, containLabel: true },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: times,
      axisLabel: { color: textColor },
      axisLine: { lineStyle: { color: gridColor } },
    },
    yAxis: {
      type: 'value',
      scale: baseNav.value === null, // 无基准时自适应缩放
      min: yMin,
      max: yMax,
      axisLabel: { color: textColor, formatter: (val: number) => val.toFixed(4) },
      splitLine: { lineStyle: { color: gridColor } },
    },
    series: [
      {
        name: '估算净值',
        data: values,
        type: 'line',
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 2, color: lineColor },
        areaStyle: { opacity: 0.12, color: lineColor },
        markLine: baseNav.value !== null
          ? {
              symbol: 'none',
              silent: true,
              label: {
                formatter: '昨收 {c}',
                position: 'end',
                color: textColor,
                fontSize: 10,
              },
              lineStyle: { color: isDark ? '#6b7280' : '#9ca3af', type: 'dashed', width: 1 },
              data: [{ yAxis: baseNav.value }],
            }
          : undefined,
      },
    ],
  } as EChartsOption
})
</script>

<template>
  <div>
    <div v-if="hasData" class="h-72 w-full">
      <VChartFull :option="chartOption" autoresize />
    </div>
    <div v-else class="text-gray-400 py-16 text-center">
      <div i-carbon-time class="text-4xl mx-auto mb-3 opacity-40" />
      <p class="text-sm">
        非交易时段 / 该基金暂无盘中分时估值
      </p>
      <p class="text-xs text-gray-400 mt-1 dark:text-gray-500">
        QDII、货币型基金无盘中估算,可查看「历史回退」净值
      </p>
    </div>
  </div>
</template>
