<script setup lang="ts">
import type { FundHoldingStock } from '~/types/realtime'
import { CHANGE_LEGEND, formatChange, getChangeColorClass } from '~/utils/format'

/**
 * 基金重仓股持仓明细面板。
 * 数据来自 /api/fund/realtime/{code} 的 holdings 字段:
 * 持仓占比取自基金定期报告(holdingsDate 报告期),股价行情为最新交易日快照(quote_date)。
 */
const props = defineProps<{
  /** 重仓股列表(按占净值比降序) */
  holdings: FundHoldingStock[]
  /** 持仓报告期(yyyy-mm-dd) */
  holdingsDate: string | null
}>()

// pct 为带 % 的字符串(如 "10.82%"),parseFloat 会忽略尾部 % 得到数值;异常值按 0 处理
function parsePct(pct: string): number {
  const num = parseFloat(pct)
  return Number.isNaN(num) ? 0 : num
}

// 占比条以列表中最大占比为基准缩放,直观对比个股集中度
const maxPct = computed(() => {
  return Math.max(...props.holdings.map(h => parsePct(h.pct)), 0)
})

function barWidth(pct: string): string {
  return maxPct.value > 0 ? `${(parsePct(pct) / maxPct.value) * 100}%` : '0%'
}

// 前十大重仓股合计占净值比
const totalPct = computed(() => {
  const sum = props.holdings.reduce((acc, h) => acc + parsePct(h.pct), 0)
  return sum > 0 ? sum.toFixed(2) : null
})

// pct 原值已带 %,直接展示;空值兜底为 '-'
function formatPct(pct: string): string {
  return pct || '-'
}

// quote_date + quote_time 组合为行情更新时间,缺一时退化为另一者
function formatQuoteTime(date: string | null, time: string | null): string {
  if (date && time)
    return `${date} ${time}`
  return date || time || '-'
}

// 默认收起,点击面板头部切换展开/收起
const expanded = ref(false)
</script>

<template>
  <div class="mt-4 card overflow-hidden">
    <div
      class="p-5 flex flex-wrap gap-2 cursor-pointer select-none transition-colors items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/30"
      :class="expanded ? 'border-b border-gray-100 dark:border-gray-700/60' : ''"
      @click="expanded = !expanded"
    >
      <div class="flex gap-2 items-center">
        <div class="i-carbon-data-table text-primary" />
        <h2 class="text-base font-bold">
          重仓股持仓明细
        </h2>
        <span class="text-xs text-gray-500 dark:text-gray-400">
          报告期: {{ holdingsDate || '-' }}
        </span>
      </div>
      <div class="flex gap-3 items-center">
        <span v-if="totalPct" class="text-xs text-gray-500 font-mono dark:text-gray-400">
          合计占比 {{ totalPct }}%
        </span>
        <div
          class="i-carbon-chevron-down text-gray-400 transition-transform duration-200"
          :class="expanded ? 'rotate-180' : ''"
        />
      </div>
    </div>

    <div v-if="expanded" class="overflow-x-auto">
      <table class="text-sm text-left w-full">
        <thead class="border-b bg-gray-50 dark:border-gray-700 dark:bg-gray-700/50">
          <tr>
            <th class="text-xs text-gray-600 font-semibold p-2.5 w-10 dark:text-gray-300">
              #
            </th>
            <th class="text-xs text-gray-600 font-semibold p-2.5 dark:text-gray-300">
              股票
            </th>
            <th class="text-xs text-gray-600 font-semibold p-2.5 text-right dark:text-gray-300">
              占净值比
            </th>
            <th class="text-xs text-gray-600 font-semibold p-2.5 text-right dark:text-gray-300">
              最新价
            </th>
            <th class="text-xs text-gray-600 font-semibold p-2.5 text-right w-20 dark:text-gray-300">
              涨跌幅
            </th>
            <th class="text-xs text-gray-600 font-semibold p-2.5 text-right whitespace-nowrap dark:text-gray-300">
              更新时间
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(stock, index) in holdings"
            :key="stock.code"
            class="border-b border-gray-100 last:border-0 dark:border-gray-700/60"
          >
            <td class="text-gray-400 font-mono p-2.5 tabular-nums">
              {{ index + 1 }}
            </td>
            <td class="p-2.5">
              <div class="font-medium">
                {{ stock.name }}
              </div>
              <div class="text-xs text-gray-400 font-mono">
                {{ stock.code }}
              </div>
            </td>
            <td class="p-2.5 text-right">
              <div class="font-mono tabular-nums">
                {{ formatPct(stock.pct) }}
              </div>
              <div class="ml-auto mt-1 rounded-full bg-gray-100 h-1 w-16 overflow-hidden dark:bg-gray-700">
                <div class="rounded-full bg-primary h-full" :style="{ width: barWidth(stock.pct) }" />
              </div>
            </td>
            <td class="font-mono p-2.5 text-right tabular-nums">
              {{ stock.price ?? '-' }}
            </td>
            <td class="font-mono p-2.5 text-right tabular-nums" :class="getChangeColorClass(stock.change_pct)">
              {{ formatChange(stock.change_pct) }}
            </td>
            <td class="text-xs text-gray-400 font-mono p-2.5 text-right whitespace-nowrap">
              {{ formatQuoteTime(stock.quote_date, stock.quote_time) }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <p v-if="expanded" class="text-xs text-gray-400 px-5 py-3 border-t border-gray-100 dark:border-gray-700/60">
      持仓占比披露于基金定期报告(季度更新);股价行情为最新交易日快照,{{ CHANGE_LEGEND }}。
    </p>
  </div>
</template>
