<script setup lang="ts">
import type { ProfitAnalysisData } from '~/types/profit'
import ProfitCalendar from '~/components/profit/ProfitCalendar.vue'
import ProfitChart from '~/components/profit/ProfitChart.vue'
import ProfitSummaryCard from '~/components/profit/ProfitSummaryCard.vue'
import { appName } from '~/constants'

useHead({
  title: `收益明细 - ${appName}`,
})

const { data, pending, error } = useAsyncData<ProfitAnalysisData>(
  'profit-analysis',
  () => apiFetch('/api/user/profit-analysis'),
)
</script>

<template>
  <div class="mx-auto p-4 max-w-6xl lg:p-8 sm:p-6">
    <header class="mb-6 flex gap-2 items-center">
      <NuxtLink to="/" class="btn-icon p-2 rounded-full transition-colors hover:bg-gray-200 dark:hover:bg-gray-700">
        <div i-carbon-arrow-left text-xl />
      </NuxtLink>
      <h1 class="text-2xl font-bold sm:text-3xl">
        收益明细
      </h1>
    </header>

    <div v-if="pending" class="py-20 flex justify-center">
      <div i-carbon-circle-dash class="text-4xl text-primary animate-spin" />
    </div>

    <div v-else-if="error" class="text-red-500 p-8 text-center card">
      <div i-carbon-warning-alt class="text-4xl mx-auto mb-2" />
      加载失败: {{ error.message }}
    </div>

    <div v-else-if="data" class="space-y-6">
      <!-- 1. 收益总览 -->
      <ProfitSummaryCard
        :yesterday-profit="data.summary.yesterdayProfit"
        :year-profit="data.summary.yearProfit"
        :total-profit-rate="data.summary.totalProfitRate"
        :total-assets="data.summary.totalAssets"
      />

      <!-- 2. 曲线图 -->
      <ProfitChart :history="data.history" />

      <!-- 3. 收益日历 -->
      <ProfitCalendar :calendar-data="data.calendar" />
    </div>
  </div>
</template>
