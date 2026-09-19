<script setup lang="ts">
import type { FundStockHoldingsSummary } from '~/types/holding'
import { CHANGE_LEGEND, formatChange, getChangeColorClass } from '~/utils/format'

/**
 * 基金重仓股持仓明细面板。
 * 数据来自基金详情接口(/api/fund/holdings/[code]/detail)的 stockHoldings 字段:
 * 持仓占比为数据库中的季报口径数据,股价行情为接口实时补全的最新快照
 * (行情接口不可用时行情列显示 '-',持仓列表不受影响)。
 */
const props = defineProps<{
  /** 重仓股持仓汇总(按占净值比降序) */
  stockHoldings: FundStockHoldingsSummary
}>()

// 占比条以列表中最大占比为基准缩放,直观对比个股集中度
const maxPct = computed(() => {
  return Math.max(...props.stockHoldings.stocks.map(h => h.pct), 0)
})

function barWidth(pct: number): string {
  return maxPct.value > 0 ? `${(pct / maxPct.value) * 100}%` : '0%'
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
          报告期: {{ stockHoldings.reportDate || '-' }}
        </span>
      </div>
      <div class="flex gap-3 items-center">
        <span class="text-xs text-gray-500 font-mono dark:text-gray-400">
          合计占比 {{ stockHoldings.coverage }}%
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
            v-for="(stock, index) in stockHoldings.stocks"
            :key="stock.stockCode"
            class="border-b border-gray-100 dark:border-gray-700/60 last:border-0"
          >
            <td class="text-gray-400 font-mono p-2.5 tabular-nums">
              {{ index + 1 }}
            </td>
            <td class="p-2.5">
              <div class="font-medium">
                {{ stock.stockName }}
              </div>
              <div class="text-xs text-gray-400 font-mono">
                {{ stock.stockCode }}
              </div>
            </td>
            <td class="p-2.5 text-right">
              <div class="font-mono tabular-nums">
                {{ stock.pct.toFixed(2) }}%
              </div>
              <div class="ml-auto mt-1 rounded-full bg-gray-100 h-1 w-16 overflow-hidden dark:bg-gray-700">
                <div class="rounded-full bg-primary h-full" :style="{ width: barWidth(stock.pct) }" />
              </div>
            </td>
            <td class="font-mono p-2.5 text-right tabular-nums">
              {{ stock.price ?? '-' }}
            </td>
            <td class="font-mono p-2.5 text-right tabular-nums" :class="getChangeColorClass(stock.changePct)">
              {{ formatChange(stock.changePct) }}
            </td>
            <td class="text-xs text-gray-400 font-mono p-2.5 text-right whitespace-nowrap">
              {{ formatQuoteTime(stock.quoteDate, stock.quoteTime) }}
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
