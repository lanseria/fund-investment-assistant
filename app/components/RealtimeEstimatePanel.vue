<script setup lang="ts">
import type { FundRealtimeDetail } from '~/types/realtime'
import { formatChange, getChangeColorClass } from '~/utils/format'

/**
 * 基金实时估值展示面板。
 * 在 /realtime 独立页与 /fund/[code] 详情页复用,展示 powercloud 聚合接口的完整数据。
 */
const props = defineProps<{
  data: FundRealtimeDetail
  /** 是否显示标题栏(独立页通常 true,详情页内嵌可 false) */
  showHeader?: boolean
}>()

const showHeader = computed(() => props.showHeader !== false)

// 涨跌幅优先取已确认官方值(收盘后),否则取估算值
const growthRate = computed(() => props.data.publishedGrowthRate ?? props.data.estimateGrowthRate)
// 净值优先取已确认官方值(收盘后),否则取估算值
const displayNav = computed(() => props.data.publishedNav ?? props.data.estimateNav)
const isPublished = computed(() => props.data.publishedNav !== null && props.data.publishedNav !== undefined)

// 数据来源徽标样式
const sourceBadge = computed(() => {
  switch (props.data.quoteSource) {
    case 'realtime':
      return { label: '盘中实时估算', class: 'text-red-600 border-red-200 bg-red-50 dark:text-red-400 dark:border-red-800 dark:bg-red-900/20', icon: 'i-carbon-pulse' }
    case 'history_fallback':
      return { label: '历史回退净值', class: 'text-amber-600 border-amber-200 bg-amber-50 dark:text-amber-400 dark:border-amber-800 dark:bg-amber-900/20', icon: 'i-carbon-time' }
    default:
      return null
  }
})

// 净值显示(4 位小数,占位符统一显示为 -)
function formatNav(v: string | null | undefined): string {
  if (v === null || v === undefined || v === '')
    return '-'
  const num = Number(v)
  return Number.isNaN(num) ? '-' : num.toFixed(4)
}
</script>

<template>
  <div class="p-5 card">
    <!-- 标题栏 -->
    <div v-if="showHeader" class="mb-4 flex flex-wrap gap-3 items-center justify-between">
      <div class="flex gap-3 items-center">
        <span class="text-xl font-bold">{{ data.name }}</span>
        <span class="text-sm text-gray-500 font-mono px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-700">{{ data.code }}</span>
      </div>
      <!-- 数据来源徽标 -->
      <div v-if="sourceBadge" class="text-xs px-2.5 py-1 border rounded-full flex gap-1.5 items-center" :class="sourceBadge.class">
        <div :class="sourceBadge.icon" />
        {{ sourceBadge.label }}
      </div>
    </div>

    <!-- message 说明(如 QDII 提示) -->
    <div v-if="data.message" class="text-xs text-gray-500 mb-4 px-3 py-2 border-l-2 rounded bg-gray-50 dark:text-gray-400 dark:border-gray-600 dark:bg-gray-700/30">
      {{ data.message }}
    </div>

    <!-- 净值核心展示区 -->
    <div class="mb-5 gap-6 grid grid-cols-2 md:grid-cols-4">
      <div class="flex flex-col gap-1">
        <span class="text-xs text-gray-500 dark:text-gray-400">{{ isPublished ? '已确认净值' : '估算净值' }}</span>
        <span class="text-2xl font-bold font-mono tabular-nums">{{ formatNav(displayNav) }}</span>
        <span class="text-xs text-gray-400">估值日期: {{ data.estimateDate || '-' }}</span>
      </div>

      <div class="flex flex-col gap-1">
        <span class="text-xs text-gray-500 dark:text-gray-400">{{ isPublished ? '已确认涨跌' : '估算涨跌' }}</span>
        <span class="text-2xl font-bold font-mono tabular-nums" :class="getChangeColorClass(growthRate)">
          {{ formatChange(growthRate) }}
        </span>
        <span v-if="!isPublished && data.estimateGrowthRate !== null" class="text-xs text-gray-400">盘中实时估算</span>
      </div>

      <div class="flex flex-col gap-1">
        <span class="text-xs text-gray-500 dark:text-gray-400">昨日净值</span>
        <span class="text-lg font-mono font-semibold tabular-nums">{{ formatNav(data.yesterdayNav) }}</span>
        <span class="text-xs text-gray-400">日期: {{ data.yesterdayDate || '-' }}</span>
      </div>

      <div class="flex flex-col gap-1">
        <span class="text-xs text-gray-500 dark:text-gray-400">官方净值</span>
        <span class="text-lg font-mono font-semibold tabular-nums" :class="data.publishedNav ? getChangeColorClass(data.publishedGrowthRate) : 'text-gray-400'">
          {{ data.publishedNav ? formatNav(data.publishedNav) : '-' }}
        </span>
        <span class="text-xs text-gray-400">{{ data.publishedNav ? `涨跌 ${formatChange(data.publishedGrowthRate)}` : '盘前未公布' }}</span>
      </div>
    </div>

    <!-- 分时图 -->
    <div class="pt-4 border-t dark:border-gray-700">
      <h3 class="text-sm text-gray-500 font-semibold mb-2 dark:text-gray-400">
        盘中分时估值
      </h3>
      <IntradayChart :intraday="data.intraday" :yesterday-nav="data.yesterdayNav" />
    </div>
  </div>
</template>
