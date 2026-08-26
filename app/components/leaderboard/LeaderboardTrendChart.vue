<script setup lang="ts">
import type { EChartsOption } from 'echarts'
import type { LeaderboardTrendUser } from '~/types/leaderboard'

const props = defineProps<{
  users: LeaderboardTrendUser[]
}>()

const colorMode = useColorMode()
provide(THEME_KEY, computed(() => colorMode.value === 'dark' ? 'dark' : 'default'))

const mode = ref<'rate' | 'amount'>('amount') // amount: 收益额, rate: 收益率

// 时间范围筛选（客户端切片）
const rangeFilters = [
  { label: '近1月', days: 30 },
  { label: '近3月', days: 90 },
  { label: '近半年', days: 180 },
  { label: '今年', days: -1 }, // -1 表示本年
  { label: '全部', days: 0 }, // 0 表示全部
]
const activeRange = ref(0)

// 按范围筛选各用户的历史，日期轴取所有用户日期的并集
const chartData = computed(() => {
  const filter = rangeFilters[activeRange.value]!
  let rangeStart: string | undefined
  if (filter.days > 0) {
    const d = new Date()
    d.setDate(d.getDate() - filter.days)
    rangeStart = d.toISOString().slice(0, 10)
  }
  else if (filter.days === -1) {
    rangeStart = `${new Date().getFullYear()}-01-01`
  }

  const sliced = props.users
    .map(u => ({
      ...u,
      history: rangeStart ? u.history.filter(p => p.date >= rangeStart!) : u.history,
    }))
    .filter(u => u.history.length > 0)

  const dateSet = new Set<string>()
  for (const u of sliced) {
    for (const p of u.history)
      dateSet.add(p.date)
  }

  return { allDates: [...dateSet].sort(), users: sliced }
})

// 标签与提示框共用的数值格式化
function formatTrendValue(val: number) {
  const sign = val > 0 ? '+' : ''
  if (mode.value === 'rate')
    return `${sign}${val.toFixed(2)}%`
  if (Math.abs(val) > 10000)
    return `${sign}¥${(val / 10000).toFixed(2)}万`
  return `${sign}${val.toFixed(2)}`
}

const chartOption = computed<EChartsOption>(() => {
  const isDark = colorMode.value === 'dark'
  const textColor = isDark ? '#d1d5db' : '#374151'

  const { allDates, users } = chartData.value

  const series = users.map((u) => {
    // 日期 -> 数值 映射，未覆盖的日期置 null（曲线从各自首条记录开始）
    const valueMap = new Map(u.history.map(p => [p.date, mode.value === 'amount' ? p.totalProfit : p.totalProfitRate]))
    return {
      name: u.username,
      type: 'line' as const,
      smooth: true,
      showSymbol: false,
      emphasis: { focus: 'series' as const },
      // 线条结尾标注用户名与当前值
      endLabel: {
        show: true,
        formatter: (params: any) => params.value == null ? '' : `${u.username} ${formatTrendValue(params.value)}`,
        fontSize: 11,
        distance: 8,
      },
      labelLayout: { moveOverlap: 'shiftY' },
      data: allDates.map(d => valueMap.get(d) ?? null),
    }
  })

  return {
    tooltip: {
      trigger: 'axis',
      valueFormatter: (val: unknown) => val == null ? '-' : formatTrendValue(Number(val)),
    },
    legend: {
      type: 'scroll',
      top: 0,
      textStyle: { color: textColor, fontSize: 11 },
    },
    grid: { top: 40, right: 110, bottom: 20, left: 50, containLabel: true },
    xAxis: {
      type: 'category',
      data: allDates,
      axisLabel: { color: textColor },
      axisLine: { lineStyle: { color: isDark ? '#4b5563' : '#e5e7eb' } },
    },
    yAxis: {
      type: 'value',
      scale: true,
      axisLabel: {
        color: textColor,
        formatter: (val: number) => mode.value === 'rate' ? `${val}%` : `${val}`,
      },
      splitLine: { lineStyle: { color: isDark ? '#374151' : '#f3f4f6' } },
    },
    series,
  } as EChartsOption
})
</script>

<template>
  <div class="p-4 card">
    <div class="mb-4 flex flex-wrap gap-3 items-center justify-between">
      <h3 class="text-lg font-bold">
        收益走势
      </h3>
      <div class="flex flex-wrap gap-3 items-center">
        <!-- 时间范围筛选 -->
        <div class="flex flex-wrap gap-2">
          <button
            v-for="(f, i) in rangeFilters"
            :key="i"
            class="text-xs px-3 py-1.5 rounded-md transition-colors"
            :class="activeRange === i ? 'bg-primary text-white' : 'bg-gray-100 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'"
            @click="activeRange = i"
          >
            {{ f.label }}
          </button>
        </div>
        <!-- 金额 / 收益率切换 -->
        <div class="p-1 rounded-lg bg-gray-100 flex dark:bg-gray-700">
          <button
            class="text-xs px-3 py-1 rounded-md transition-colors"
            :class="mode === 'amount' ? 'bg-white dark:bg-gray-600 shadow-sm text-primary font-bold' : 'text-gray-500'"
            @click="mode = 'amount'"
          >
            收益金额
          </button>
          <button
            class="text-xs px-3 py-1 rounded-md transition-colors"
            :class="mode === 'rate' ? 'bg-white dark:bg-gray-600 shadow-sm text-primary font-bold' : 'text-gray-500'"
            @click="mode = 'rate'"
          >
            收益率
          </button>
        </div>
      </div>
    </div>

    <div v-if="chartData.users.length > 0" class="h-[480px] w-full">
      <VChartFull :option="chartOption" autoresize />
    </div>
    <div v-else class="text-gray-400 py-16 text-center">
      <div i-carbon-chart-line class="text-4xl mx-auto mb-3 opacity-30" />
      <p class="text-sm">
        当前时间范围内暂无收益数据
      </p>
    </div>
  </div>
</template>
