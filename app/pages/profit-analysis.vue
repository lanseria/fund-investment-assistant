<script setup lang="ts">
import type { ProfitAnalysisData } from '~/types/profit'
import ProfitCalendar from '~/components/profit/ProfitCalendar.vue'
import ProfitChart from '~/components/profit/ProfitChart.vue'
import { useProfitMetrics } from '~/composables/useProfitMetrics'
import { appName } from '~/constants'
import { formatCurrency } from '~/utils/format'

useHead({
  title: `收益明细 - ${appName}`,
})

const { data, pending, error } = useAsyncData<ProfitAnalysisData>(
  'profit-analysis',
  () => apiFetch('/api/user/profit-analysis'),
)

// 时间范围筛选（客户端切片 history）
const rangeFilters = [
  { label: '近1月', days: 30 },
  { label: '近3月', days: 90 },
  { label: '近半年', days: 180 },
  { label: '今年', days: -1 }, // -1 表示本年
  { label: '全部', days: 0 }, // 0 表示全部
]
const activeRange = ref(0) // 默认全部

const filteredHistory = computed(() => {
  if (!data.value?.history)
    return []
  const filter = rangeFilters[activeRange.value]!
  if (filter.days === 0)
    return data.value.history

  const total = data.value.history.length
  if (filter.days === -1) {
    // 本年：找到今年第一条记录
    const yearStart = `${new Date().getFullYear()}-01-01`
    const idx = data.value.history.findIndex(p => p.date >= yearStart)
    return idx >= 0 ? data.value.history.slice(idx) : data.value.history
  }

  const startIdx = Math.max(0, total - filter.days)
  return data.value.history.slice(startIdx)
})

// 基于筛选后的历史计算风险指标
const metrics = useProfitMetrics(filteredHistory)

// 累计盈亏额（原 summary 未提供，从 history 末尾取）
const totalProfit = computed(() => data.value?.history.at(-1)?.totalProfit ?? 0)
const totalProfitRate = computed(() => data.value?.summary.totalProfitRate ?? 0)
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

    <EmptyState
      v-else-if="error"
      icon="i-carbon-warning-alt"
      message="加载失败"
      :description="error.message"
    />

    <EmptyState
      v-else-if="!data || data.history.length === 0"
      icon="i-carbon-chart-line"
      message="暂无收益数据"
      description="完成第一笔交易确认后，将在此展示收益分析"
    />

    <div v-else class="space-y-6">
      <!-- 1. 收益总览（升级：含累计盈亏额 + 累计收益率） -->
      <div class="p-4 card gap-4 grid grid-cols-2 md:grid-cols-4">
        <StatCard label="当前总资产" :value="formatCurrency(data.summary.totalAssets)" />
        <StatCard label="累计盈亏" :value="formatCurrency(totalProfit)" :colored="true" />
        <StatCard label="累计收益率" :value="`${totalProfitRate > 0 ? '+' : ''}${totalProfitRate.toFixed(2)}%`" :colored="true" />
        <StatCard label="昨日收益" :value="formatCurrency(data.summary.yesterdayProfit)" :colored="true" />
      </div>

      <!-- 2. 风险指标（新增） -->
      <ProfitRiskCard :metrics="metrics" />

      <!-- 3. 时间范围筛选 -->
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

      <!-- 4. 曲线图（基于筛选后数据） -->
      <ProfitChart :history="filteredHistory" />

      <!-- 5. 收益日历 -->
      <ProfitCalendar :calendar-data="data.calendar" />
    </div>
  </div>
</template>
