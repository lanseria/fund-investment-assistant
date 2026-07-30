<script setup lang="ts">
import type { EChartsOption } from 'echarts'
import type { SectorCapitalHistoryResponse } from '~/types/sector'

const props = withDefaults(defineProps<{
  data: SectorCapitalHistoryResponse['history']
  title: string
  // dataZoom 控制参数（可选，默认展示全部数据）
  dataZoomStart?: number
  dataZoomEnd?: number
}>(), {
  dataZoomStart: 0,
  dataZoomEnd: 100,
})

const colorMode = useColorMode()
provide(THEME_KEY, computed(() => colorMode.value === 'dark' ? 'dark' : 'default'))

// 主力行为 → 配色与缩写（用于 markPoint 标注）
const actionStyle: Record<string, { color: string, label: string }> = {
  抢筹: { color: '#ef4444', label: '抢' }, // 红
  建仓: { color: '#f97316', label: '建' }, // 橙
  洗盘: { color: '#9ca3af', label: '洗' }, // 灰
  出货: { color: '#22c55e', label: '出' }, // 绿
}

// 主力强度颜色：正值偏多 → 红，负值偏空 → 绿
const STRENGTH_COLOR_POS = '#ef4444' // 红
const STRENGTH_COLOR_NEG = '#22c55e' // 绿

const chartOption = computed<EChartsOption>(() => {
  const isDark = colorMode.value === 'dark'
  const textColor = isDark ? '#d1d5db' : '#374151'
  const gridColor = isDark ? '#4b5563' : '#e5e7eb'

  const { dates, mainStrength, mainCapital, mainHidden, actions } = props.data

  // 数据点过少时（如刚绑定只有 1 条快照），强制展示全部数据，
  // 避免外部传入的 dataZoom 百分比把仅有的点排除出可视窗口。
  const safeZoom = dates.length <= 2
    ? { start: 0, end: 100 }
    : { start: props.dataZoomStart, end: props.dataZoomEnd }

  // 构造主力行为标注点（在主力强度折线上）
  const actionMarks = dates
    .map((date, i) => {
      const action = actions[i]
      const strength = mainStrength[i]
      const style = action ? actionStyle[action] : null
      // 仅标注有行为且强度值有效的那天
      if (!style || strength === null)
        return null
      return {
        coord: [date, strength],
        itemStyle: { color: style.color },
        label: { formatter: style.label },
      }
    })
    .filter(Boolean) as { coord: [string, number], itemStyle: { color: string }, label: { formatter: string } }[]

  // 主力强度按正负染色。使用 continuous visualMap，并以数据绝对值的最大值
  // 作为对称的 min/max，使 0 始终落在颜色区间正中，从而实现「正红/负绿」的清晰分界。
  //
  // NOTE：之前使用 piecewise visualMap（pieces: [{gte:0},{lt:0}]）会触发 ECharts
  // 6.x 的崩溃 —— 当所有 piece 均触及 ±Infinity 时，getVisualMeta 生成的 stops
  // 为空数组，而 LineView.getVisualGradient 在 stopLen===0 时既不会提前 return，
  // 又会继续访问 colorStopsInRange[0].coord，导致
  // "Cannot read properties of undefined (reading 'coord')" 报错。
  const strengthMaxAbs = mainStrength.reduce(
    (max, v) => v !== null ? Math.max(max, Math.abs(v)) : max,
    0,
  ) || 1 // 全 0 时退化为 1，避免 visualMap min===max===0 的退化区间

  return {
    title: { text: props.title, left: 'center', textStyle: { color: textColor } },
    axisPointer: { link: [{ xAxisIndex: 'all' }] },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross' },
      // 自定义 tooltip：展示主力行为与各项数值（注意主力强度为百分比，资金为亿元）
      formatter: (params: any) => {
        if (!Array.isArray(params) || params.length === 0)
          return ''
        const date = params[0].axisValue
        const idx = dates.indexOf(date)
        const action = idx >= 0 ? actions[idx] : ''
        const actionBadge = action
          ? `<span style="display:inline-block;padding:1px 5px;border-radius:3px;color:#fff;background:${actionStyle[action]?.color || '#999'};font-size:11px">${action}</span>`
          : ''
        let html = `<div style="font-weight:600;margin-bottom:4px">${date} ${actionBadge}</div>`
        for (const p of params) {
          const val = p.value
          if (val === null || val === undefined || Number.isNaN(val))
            continue
          // 主力强度是百分比（%），其余为资金（亿）
          const unit = p.seriesName === '主力强度' ? '%' : ' 亿'
          html += `<div>${p.marker} ${p.seriesName}: <b>${val > 0 ? '+' : ''}${Number(val).toFixed(2)}</b>${unit}</div>`
        }
        return html
      },
    },
    legend: { top: 40, textStyle: { color: textColor }, data: ['主力强度', '主力资金', '主力暗盘'] },
    // 主力强度按正负染色：visualMap 仅作用于 seriesIndex 0（主力强度）。
    // 使用 continuous + 对称区间，使 0 落在颜色区间正中，实现正红/负绿。
    visualMap: {
      show: false,
      type: 'continuous',
      seriesIndex: 0,
      min: -strengthMaxAbs,
      max: strengthMaxAbs,
      calculable: false,
      inRange: { color: [STRENGTH_COLOR_NEG, STRENGTH_COLOR_POS] },
    },
    grid: [
      { top: '12%', left: '8%', right: '8%', height: '44%' },
      { top: '62%', left: '8%', right: '8%', height: '22%' },
    ],
    xAxis: [
      { type: 'category', gridIndex: 0, data: dates, axisLabel: { show: false }, axisLine: { lineStyle: { color: gridColor } } },
      { type: 'category', gridIndex: 1, data: dates, axisLine: { lineStyle: { color: gridColor } }, axisLabel: { color: textColor } },
    ],
    yAxis: [
      // 上图：主力强度，围绕 0 轴
      { type: 'value', gridIndex: 0, axisLine: { show: true, lineStyle: { color: gridColor } }, splitLine: { lineStyle: { color: [gridColor] } }, axisLabel: { color: textColor, formatter: '{value}%' } },
      // 下图：资金（亿）
      { type: 'value', gridIndex: 1, axisLine: { show: true, lineStyle: { color: gridColor } }, splitLine: { lineStyle: { color: [gridColor] } }, axisLabel: { color: textColor } },
    ],
    dataZoom: [
      { type: 'inside', xAxisIndex: [0, 1], start: safeZoom.start, end: safeZoom.end, zoomOnMouseWheel: false },
      { type: 'slider', xAxisIndex: [0, 1], top: '90%', height: 20, start: safeZoom.start, end: safeZoom.end },
    ],
    series: [
      {
        name: '主力强度',
        type: 'line',
        data: mainStrength,
        xAxisIndex: 0,
        yAxisIndex: 0,
        showSymbol: false,
        lineStyle: { width: 2 },
        // 0 轴参考线（主力强度的多空分界）
        markLine: {
          silent: true,
          symbol: 'none',
          data: [
            { yAxis: 0, lineStyle: { color: gridColor, type: 'dashed' } },
          ],
        },
        // 主力行为彩色标注点
        markPoint: {
          symbol: 'circle',
          symbolSize: 22,
          data: actionMarks,
          label: {
            show: true,
            color: '#fff',
            fontSize: 11,
            fontWeight: 'bold' as const,
          },
        },
      },
      {
        name: '主力资金',
        type: 'line',
        data: mainCapital,
        xAxisIndex: 1,
        yAxisIndex: 1,
        showSymbol: false,
        lineStyle: { color: '#ef4444', width: 1.5 },
      },
      {
        name: '主力暗盘',
        type: 'line',
        data: mainHidden,
        xAxisIndex: 1,
        yAxisIndex: 1,
        showSymbol: false,
        lineStyle: { color: '#f97316', width: 1.5 },
      },
    ],
  } as EChartsOption
})
</script>

<template>
  <VChartFull class="h-150 w-full" :option="chartOption" autoresize />
</template>
