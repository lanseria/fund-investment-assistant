<script setup lang="ts">
import type { RsiChartData } from '~/types/chart'
import type { HoldingHistoryPoint } from '~/types/holding'
import MiniFundChart from '~/components/charts/MiniFundChart.vue'
import MiniRsiChart from '~/components/charts/MiniRsiChart.vue'
import { SECTOR_DICT_TYPE } from '~/constants' // 引入板块字典常量
import { dateFilterOptions } from '~/constants/chart'
import { formatCurrency } from '~/utils/format'

interface ChartCardData {
  code: string
  name: string
  sector: string | null // 板块字段
  attentionLevel: number // 关注度
  strategy: string
  data: RsiChartData | { history: HoldingHistoryPoint[], signals: any[], transactions?: any[] } // transactions 支持
  holdingAmount: number | null
  percentageChange: number | null
  todayEstimateProfitLoss: number | null
}

const props = defineProps<{
  fund: ChartCardData
  activeDateFilter: string
}>()

const emit = defineEmits(['update-attention'])

const dayjs = useDayjs()
const { getLabel } = useDictStore() // 引入获取字典标签的方法

function toggleAttention() {
  // 1 -> 2 -> 3 -> 1 循环切换
  const nextLevel = props.fund.attentionLevel >= 3 ? 1 : props.fund.attentionLevel + 1
  emit('update-attention', props.fund.code, nextLevel)
}

// --- 辅助函数 ---
function getChangeClass(value: number | null | undefined) {
  if (value === undefined || value === null)
    return 'text-gray'
  if (value > 0)
    return 'text-red-500 dark:text-red-400'
  if (value < 0)
    return 'text-green-500 dark:text-green-400'
  return 'text-gray'
}

// 在卡片组件内部根据全量数据和筛选器，计算出需要传递给图表的数据切片
const slicedData = computed(() => {
  const period = props.activeDateFilter
  const isRsi = props.fund.strategy === 'rsi'

  // 1. 获取全量日期和数据
  const fullData = props.fund.data
  const allDates = isRsi
    ? (fullData as RsiChartData).dates
    : (fullData as { history: HoldingHistoryPoint[] }).history.map(p => p.date)

  if (!allDates || allDates.length === 0)
    return isRsi ? { dates: [], netValues: [], rsiValues: [], signals: { buy: [], sell: [] }, config: (fullData as RsiChartData).config } : { history: [], signals: [] }

  // 2. 计算起始索引
  const totalPoints = allDates.length
  let startIndex = 0
  if (period !== 'all') {
    const filter = dateFilterOptions.find(f => f.value === period)
    if (filter?.unit) {
      const targetDate = dayjs(allDates[totalPoints - 1]).subtract(filter.amount, filter.unit as any)
      const foundIndex = allDates.findIndex((d: string) => dayjs(d).isAfter(targetDate))
      if (foundIndex !== -1)
        startIndex = foundIndex
    }
  }

  // 3. 根据起始索引切片数据
  if (isRsi) {
    const rsiData = fullData as RsiChartData
    return {
      ...rsiData,
      dates: rsiData.dates.slice(startIndex),
      netValues: rsiData.netValues.slice(startIndex),
      rsiValues: rsiData.rsiValues.slice(startIndex),
    }
  }
  else {
    const genericData = fullData as { history: HoldingHistoryPoint[], signals: any[], transactions?: any[] }
    return {
      ...genericData,
      history: genericData.history.slice(startIndex),
    }
  }
})
</script>

<template>
  <div
    class="border-t-4 card flex flex-col transition-all duration-300 overflow-hidden"
    :class="[
      // 根据是否持有显示不同的背景
      fund.holdingAmount !== null
        ? 'bg-white dark:bg-gray-800'
        : '!bg-slate-50 dark:!bg-gray-900/60 shadow-inner',
      // 根据关注度显示顶部边框高亮
      fund.attentionLevel >= 3 ? 'border-red-500'
      : fund.attentionLevel === 2 ? 'border-orange-400'
        : 'border-transparent',
    ]"
  >
    <!-- 头部：基金名称 -->
    <div class="p-3 border-b flex gap-2 items-center justify-between dark:border-gray-700">
      <div class="flex gap-2 items-center overflow-hidden">
        <!-- 关注度图标交互 -->
        <button
          type="button"
          class="icon-btn flex-shrink-0 transition-transform active:scale-90"
          :title="['普通关注 (点击升级)', '重点关注 (点击升级)', '核心关注 (点击降级)'][fund.attentionLevel - 1] || '设置关注度'"
          @click.prevent="toggleAttention"
        >
          <div v-if="fund.attentionLevel >= 3" class="i-carbon-fire text-red-500" />
          <div v-else-if="fund.attentionLevel === 2" class="i-carbon-star-filled text-orange-400" />
          <div v-else class="i-carbon-star text-gray-300 dark:text-gray-600 hover:text-orange-400" />
        </button>

        <!-- 板块标签 -->
        <span v-if="fund.sector" class="text-[10px] text-gray-500 px-1.5 py-0.5 rounded bg-gray-100 flex-shrink-0 whitespace-nowrap dark:text-gray-400 dark:bg-gray-700/50">
          {{ getLabel(SECTOR_DICT_TYPE, fund.sector) || '未设置' }}
        </span>

        <NuxtLink :to="`/fund/${fund.code}`" :title="fund.code" class="text-sm font-semibold truncate transition-colors hover:text-primary">
          {{ fund.name }}
        </NuxtLink>

        <!-- 仅关注徽章 -->
        <span v-if="fund.holdingAmount === null" class="text-[10px] text-gray-400 px-1 py-px border border-gray-200 rounded flex-shrink-0 dark:border-gray-600">仅关注</span>
      </div>
    </div>

    <!-- 图表区域 -->
    <div class="h-40">
      <template v-if="fund.strategy === 'rsi'">
        <MiniRsiChart :data="slicedData as RsiChartData" />
      </template>
      <template v-else-if="fund.strategy === ''">
        <!-- 基础走势：包含交易记录 -->
        <MiniFundChart
          :history="(slicedData as any).history"
          :signals="(slicedData as any).signals"
          :transactions="(slicedData as any).transactions"
        />
      </template>
      <template v-else>
        <!-- 其他策略 (如布林带)：保持纯粹，不混入交易记录 -->
        <MiniFundChart
          :history="(slicedData as any).history"
          :signals="(slicedData as any).signals"
        />
      </template>
    </div>

    <!-- 底部持仓信息 -->
    <div class="text-xs p-3 border-t flex items-center justify-between dark:border-gray-700">
      <div class="flex flex-col items-start">
        <span class="text-gray-500 dark:text-gray-400">持仓市值</span>
        <span class="font-mono font-semibold tabular-nums">
          {{ fund.holdingAmount !== null ? formatCurrency(fund.holdingAmount) : '--' }}
        </span>
      </div>
      <div class="flex flex-col items-center">
        <span class="text-gray-500 dark:text-gray-400">今日涨跌</span>
        <span class="font-mono font-semibold tabular-nums" :class="getChangeClass(fund.percentageChange)">
          {{ fund.percentageChange !== null ? `${fund.percentageChange > 0 ? '+' : ''}${fund.percentageChange.toFixed(2)}%` : '-' }}
        </span>
      </div>
      <div class="flex flex-col items-end">
        <span class="text-gray-500 dark:text-gray-400">预估盈亏</span>
        <span class="font-mono font-semibold tabular-nums" :class="fund.holdingAmount !== null ? getChangeClass(fund.todayEstimateProfitLoss) : ''">
          {{ fund.holdingAmount !== null ? formatCurrency(fund.todayEstimateProfitLoss) : '--' }}
        </span>
      </div>
    </div>
  </div>
</template>
