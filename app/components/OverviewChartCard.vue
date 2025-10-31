<script setup lang="ts">
import type { RsiChartData } from '~/types/chart'
import type { HoldingHistoryPoint } from '~/types/holding'
import { dateFilterOptions } from '~/constants/chart' // 导入共享常量

interface ChartCardData {
  code: string
  name: string
  strategy: string
  data: RsiChartData | { history: HoldingHistoryPoint[], signals: any[] }
}

const props = defineProps<{
  fund: ChartCardData
  // prop 名称，传递意图而非具体值
  activeDateFilter: string
}>()

const dayjs = useDayjs()

// 在组件内部根据自身数据计算 dataZoom
const zoomConfig = computed(() => {
  const period = props.activeDateFilter

  // 根据策略类型获取正确的日期数组
  const dates = props.fund.strategy === 'rsi'
    ? (props.fund.data as RsiChartData).dates
    : (props.fund.data as { history: HoldingHistoryPoint[] }).history.map(p => p.date)

  if (!dates || dates.length === 0)
    return { start: 0, end: 100 } // 数据为空则显示全部

  const totalPoints = dates.length
  if (period === 'all')
    return { start: 0, end: 100 }

  const filter = dateFilterOptions.find(f => f.value === period)
  if (!filter || !filter.unit)
    return { start: 0, end: 100 } // 找不到过滤器则显示全部

  // 从最后一天开始倒推
  const targetDate = dayjs(dates[totalPoints - 1]).subtract(filter.amount, filter.unit as any)
  const startIndex = dates.findIndex((d: string) => dayjs(d).isAfter(targetDate))

  if (startIndex !== -1) {
    return {
      start: (startIndex / totalPoints) * 100,
      end: 100,
    }
  }

  // 如果找不到开始索引（例如基金历史比筛选范围还短），则显示全部
  return { start: 0, end: 100 }
})
</script>

<template>
  <div class="card overflow-hidden">
    <div class="p-4 border-b dark:border-gray-700">
      <NuxtLink :to="`/fund/${fund.code}`" class="font-semibold transition-colors hover:text-primary">
        {{ fund.name }}
        <span class="text-sm text-gray-400 font-normal font-numeric">({{ fund.code }})</span>
      </NuxtLink>
    </div>

    <div class="p-2">
      <template v-if="fund.strategy === 'rsi'">
        <RsiDetailChart
          :data="fund.data as RsiChartData"
          title=""
          :data-zoom-start="zoomConfig.start"
          :data-zoom-end="zoomConfig.end"
        />
      </template>
      <template v-else>
        <FundChart
          :history="(fund.data as any).history"
          :signals="(fund.data as any).signals"
          title=""
          :data-zoom-start="zoomConfig.start"
          :data-zoom-end="zoomConfig.end"
        />
      </template>
    </div>
  </div>
</template>
