<script setup lang="ts">
import type { Holding } from '~/types/holding'
import { format } from 'date-fns'
import { SECTOR_DICT_TYPE } from '~/constants'
import { formatCurrency } from '~/utils/format'

/**
 * 基金详情总览卡：基金信息头 + 费率 / 核心行情指标 / 我的持仓(含待确认交易)。
 */
const props = defineProps<{
  /** 基金详情 (/api/fund/holdings/[code]/detail) */
  detail: any
  /** 当前用户在该基金的持仓（查看他人持仓时为空） */
  holding?: Holding | null
}>()

const dictStore = useDictStore()
</script>

<template>
  <div class="mb-4 card overflow-hidden">
    <!-- 基金信息头 -->
    <div class="p-5 from-white to-gray-50 bg-gradient-to-br dark:from-gray-800 dark:to-gray-800/80">
      <div class="flex gap-3 items-center">
        <span class="text-xl font-bold">{{ props.detail.name }}</span>
        <span class="text-sm text-gray-500 font-mono px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-700">{{ props.detail.code }}</span>
      </div>
      <div class="text-xs text-gray-400 mt-2 flex flex-wrap gap-x-4 gap-y-1">
        <span>类型: {{ props.detail.fundType === 'qdii_lof' ? '场内/LOF' : '场外基金' }}</span>
        <span v-if="props.detail.sector">板块: {{ dictStore.getLabel(SECTOR_DICT_TYPE, props.detail.sector) }}</span>
        <span>更新时间: {{ props.detail.todayEstimateUpdateTime ? format(props.detail.todayEstimateUpdateTime, 'yyyy-MM-dd HH:mm:ss') : '-' }}</span>
      </div>
      <!-- 基金费率信息(仅展示) -->
      <FundFeesCard :fees="props.detail.fees" />
    </div>

    <!-- 核心行情指标 -->
    <div class="p-5 border-t border-gray-100 dark:border-gray-700/60">
      <div class="gap-4 grid grid-cols-2 md:grid-cols-4">
        <StatCard
          label="最新净值"
          :value="props.detail.todayEstimateNav || props.detail.yesterdayNav || '-'"
          value-class="!text-xl"
        />
        <StatCard
          label="估算涨跌"
          :value="props.detail.percentageChange !== null ? `${(props.detail.percentageChange > 0 ? '+' : '') + props.detail.percentageChange.toFixed(2)}%` : '-'"
          :colored="true"
          value-class="!text-xl"
        />
        <StatCard
          label="持仓市值"
          :value="props.detail.holdingAmount !== null ? formatCurrency(props.detail.holdingAmount) : '--'"
          value-class="!text-xl"
        />
        <div class="p-2 flex flex-col gap-1">
          <span class="text-xs text-gray-500 dark:text-gray-400">持仓收益</span>
          <div class="flex gap-1 items-baseline">
            <span
              class="text-xl font-bold font-mono tabular-nums"
              :class="props.detail.holdingProfitAmount > 0 ? 'text-red-500 dark:text-red-400' : (props.detail.holdingProfitAmount < 0 ? 'text-green-500 dark:text-green-400' : 'text-gray-500 dark:text-gray-400')"
            >
              {{ props.detail.holdingProfitAmount !== null ? (props.detail.holdingProfitAmount > 0 ? '+' : '') + formatCurrency(props.detail.holdingProfitAmount) : '--' }}
            </span>
            <span
              v-if="props.detail.holdingProfitRate !== null"
              class="text-sm font-mono tabular-nums"
              :class="props.detail.holdingProfitRate > 0 ? 'text-red-500 dark:text-red-400' : (props.detail.holdingProfitRate < 0 ? 'text-green-500 dark:text-green-400' : 'text-gray-500 dark:text-gray-400')"
            >
              ({{ props.detail.holdingProfitRate > 0 ? '+' : '' }}{{ props.detail.holdingProfitRate.toFixed(2) }}%)
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- 我的持仓 -->
    <div v-if="props.holding" class="p-5 border-t border-gray-100 dark:border-gray-700/60">
      <div class="gap-4 grid grid-cols-2 md:grid-cols-5">
        <StatCard
          label="持有份额"
          :value="props.holding.shares !== null ? `${Number(props.holding.shares).toFixed(2)} 份` : '-'"
        />
        <StatCard
          label="成本价"
          :value="props.holding.costPrice !== null ? `¥${Number(props.holding.costPrice).toFixed(4)}` : '-'"
        />
        <StatCard
          label="乖离率 BIAS20"
          :value="props.holding.bias20 !== null ? `${props.holding.bias20 > 0 ? '+' : ''}${props.holding.bias20.toFixed(2)}%` : '-'"
          :colored="true"
          hint="正偏高估/负偏低估"
        />
        <StatCard
          label="关注度"
          :value="['', '普通', '重点', '核心'][props.holding.attentionLevel] || '-'"
        />
        <StatCard
          label="待确认交易"
          :value="(props.holding.pendingTransactions?.length || 0)"
          :hint="(props.holding.pendingTransactions?.length || 0) > 0 ? '有进行中的交易' : '无'"
        />
      </div>

      <!-- 待确认交易列表（可撤销） -->
      <div
        v-if="props.holding.pendingTransactions && props.holding.pendingTransactions.length > 0"
        class="mt-4 p-3 border border-amber-100 rounded-md bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20"
      >
        <p class="text-xs text-amber-700 font-semibold mb-2 dark:text-amber-300">
          待确认交易 ({{ props.holding.pendingTransactions.length }}笔)
        </p>
        <div class="space-y-1.5">
          <div
            v-for="tx in props.holding.pendingTransactions"
            :key="tx.id"
            class="text-xs flex gap-3 items-center"
          >
            <span class="px-1.5 py-0.5 border rounded" :class="tx.type === 'buy' ? 'text-red-600 border-red-200 bg-red-50 dark:text-red-400 dark:border-red-800 dark:bg-red-900/20' : 'text-green-600 border-green-200 bg-green-50 dark:text-green-400 dark:border-green-800 dark:bg-green-900/20'">
              {{ tx.type === 'buy' ? '买入' : tx.type === 'sell' ? '卖出' : tx.type === 'convert_in' ? '转入' : '转出' }}
            </span>
            <span class="text-gray-500">{{ tx.orderDate }}</span>
            <span class="text-gray-700 font-mono dark:text-gray-300">
              {{ tx.orderAmount ? formatCurrency(tx.orderAmount) : `${Number(tx.orderShares).toFixed(2)} 份` }}
            </span>
            <span class="text-gray-400">{{ tx.status === 'draft' ? '(预操作)' : '(待确认)' }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
