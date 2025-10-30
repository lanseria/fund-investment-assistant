<script setup lang="ts">
import type { RsiChartData } from '~/types/chart'
import type { HoldingHistoryPoint } from '~/types/holding'

// 定义一个统一的 prop 结构
interface ChartCardData {
  code: string
  name: string
  strategy: string
  data: RsiChartData | { history: HoldingHistoryPoint[], signals: any[] }
}

defineProps<{
  fund: ChartCardData
  // [新增] 接收 dataZoom 控制参数
  dataZoomStart: number
  dataZoomEnd: number
}>()
</script>

<template>
  <div class="card overflow-hidden">
    <!-- 卡片头部，包含基金名称和详情链接 -->
    <div class="p-4 border-b dark:border-gray-700">
      <NuxtLink :to="`/fund/${fund.code}`" class="font-semibold transition-colors hover:text-primary">
        {{ fund.name }}
        <span class="text-sm text-gray-400 font-normal font-numeric">({{ fund.code }})</span>
      </NuxtLink>
    </div>

    <div class="p-2">
      <!-- RSI 策略使用 RsiDetailChart -->
      <template v-if="fund.strategy === 'rsi'">
        <RsiDetailChart
          :data="fund.data as RsiChartData"
          title=""
          :data-zoom-start="dataZoomStart"
          :data-zoom-end="dataZoomEnd"
        />
      </template>
      <!-- 其他策略使用 FundChart -->
      <template v-else>
        <FundChart
          :history="(fund.data as any).history"
          :signals="(fund.data as any).signals"
          title=""
          :data-zoom-start="dataZoomStart"
          :data-zoom-end="dataZoomEnd"
        />
      </template>
    </div>
  </div>
</template>
