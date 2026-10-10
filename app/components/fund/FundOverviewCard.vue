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

// --- 样式与文案常量：一次定义，模板复用 ---
/** 区块小标题 */
const sectionTitle = 'text-xs font-medium tracking-wide color-fade flex gap-1.5 items-center mb-3'
/** 涨跌着色：正红 / 负绿 / 零灰（A股口径） */
function profitColor(v: number | null | undefined) {
  if (v === null || v === undefined || v === 0)
    return 'text-gray-500 dark:text-gray-400'
  return v > 0 ? 'text-red-500 dark:text-red-400' : 'text-green-500 dark:text-green-400'
}

/** 基金类型元信息 */
const fundTypeMeta: Record<string, { label: string, icon: string }> = {
  open: { label: '场外基金', icon: 'i-carbon-currency' },
  qdii_lof: { label: '场内/LOF', icon: 'i-carbon-chart-line' },
}
const fundType = computed(() => fundTypeMeta[props.detail.fundType] ?? fundTypeMeta.open)

/** 待确认交易类型 → 文案与徽章配色（买入红 / 卖出绿，A股口径） */
const txTypeMeta: Record<string, { label: string, cls: string }> = {
  buy: { label: '买入', cls: 'text-red-600 border-red-200 bg-red-50 dark:text-red-400 dark:border-red-800 dark:bg-red-900/20' },
  sell: { label: '卖出', cls: 'text-green-600 border-green-200 bg-green-50 dark:text-green-400 dark:border-green-800 dark:bg-green-900/20' },
  convert_in: { label: '转入', cls: 'text-blue-600 border-blue-200 bg-blue-50 dark:text-blue-400 dark:border-blue-800 dark:bg-blue-900/20' },
  convert_out: { label: '转出', cls: 'text-blue-600 border-blue-200 bg-blue-50 dark:text-blue-400 dark:border-blue-800 dark:bg-blue-900/20' },
}

const pendingCount = computed(() => props.holding?.pendingTransactions?.length ?? 0)
const attentionMeta = ['', '普通', '重点', '核心']
</script>

<template>
  <div class="mb-4 card overflow-hidden">
    <!-- 基金信息头 -->
    <div class="p-5 relative from-primary/10 to-transparent bg-gradient-to-br dark:from-primary/15">
      <div class="flex flex-wrap gap-x-3 gap-y-1.5 items-center">
        <span class="text-xl font-bold">{{ props.detail.name }}</span>
        <span class="text-sm color-fade font-mono px-2 py-0.5 rounded-md bg-secondary">{{ props.detail.code }}</span>
        <span class="text-xs text-primary px-2 py-0.5 rounded-md bg-primary/10 flex gap-1 items-center">
          <div :class="fundType.icon" />
          {{ fundType.label }}
        </span>
      </div>
      <div class="text-xs color-fade mt-2.5 flex flex-wrap gap-x-4 gap-y-1 items-center">
        <span v-if="props.detail.sector" class="flex gap-1 items-center">
          <div class="i-carbon-tag" />
          板块: {{ dictStore.getLabel(SECTOR_DICT_TYPE, props.detail.sector) }}
        </span>
        <span class="flex gap-1 items-center">
          <div class="i-carbon-time" />
          更新时间: {{ props.detail.todayEstimateUpdateTime ? format(props.detail.todayEstimateUpdateTime, 'yyyy-MM-dd HH:mm:ss') : '-' }}
        </span>
      </div>
      <!-- 基金费率信息(仅展示) -->
      <FundFeesCard :fees="props.detail.fees" />
    </div>

    <!-- 核心行情指标 -->
    <div class="p-5 border-t border-base">
      <div :class="sectionTitle">
        <span class="i-carbon-activity" />
        核心行情
      </div>
      <div class="gap-4 grid grid-cols-2 md:grid-cols-4">
        <StatCard
          label="最新净值"
          :value="props.detail.todayEstimateNav || props.detail.yesterdayNav || '-'"
          value-class="!text-xl"
        />
        <StatCard
          label="今日估算"
          :value="props.detail.percentageChange !== null ? props.detail.percentageChange : null"
          :colored="true"
          hint="重仓股行情加权自算;黄金基金按金价,场内基金按场内价"
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
              :class="profitColor(props.detail.holdingProfitAmount)"
            >
              {{ props.detail.holdingProfitAmount !== null ? (props.detail.holdingProfitAmount > 0 ? '+' : '') + formatCurrency(props.detail.holdingProfitAmount) : '--' }}
            </span>
            <span
              v-if="props.detail.holdingProfitRate !== null"
              class="text-sm font-mono tabular-nums"
              :class="profitColor(props.detail.holdingProfitRate)"
            >
              ({{ props.detail.holdingProfitRate > 0 ? '+' : '' }}{{ props.detail.holdingProfitRate.toFixed(2) }}%)
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- 我的持仓 -->
    <div v-if="props.holding" class="p-5 border-t border-base">
      <div :class="sectionTitle">
        <span class="i-carbon-portfolio" />
        我的持仓
      </div>
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
          :value="attentionMeta[props.holding.attentionLevel] || '-'"
        />
        <StatCard
          label="待确认交易"
          :value="pendingCount"
          :hint="pendingCount > 0 ? '有进行中的交易' : '无'"
        />
      </div>

      <!-- 待确认交易列表（可撤销） -->
      <div
        v-if="pendingCount > 0"
        class="mt-4 p-3 border border-amber-200/60 rounded-lg bg-amber-50/80 dark:border-amber-800/60 dark:bg-amber-900/20"
      >
        <p class="text-xs text-amber-700 font-semibold mb-2.5 flex gap-1.5 items-center dark:text-amber-300">
          <span class="i-carbon-hourglass" />
          待确认交易
          <span class="font-mono px-1.5 py-px rounded-full bg-amber-500/20 tabular-nums">{{ pendingCount }}笔</span>
        </p>
        <div class="space-y-1.5">
          <div
            v-for="tx in props.holding.pendingTransactions"
            :key="tx.id"
            class="text-xs p-1.5 rounded flex flex-wrap gap-x-3 gap-y-1 transition-colors items-center hover:bg-amber-500/10"
          >
            <span class="font-medium px-1.5 py-0.5 border rounded" :class="txTypeMeta[tx.type]?.cls ?? txTypeMeta.sell?.cls">
              {{ txTypeMeta[tx.type]?.label ?? tx.type }}
            </span>
            <span class="color-fade font-mono tabular-nums">{{ tx.orderDate }}</span>
            <span class="text-gray-700 font-mono tabular-nums dark:text-gray-300">
              {{ tx.orderAmount ? formatCurrency(tx.orderAmount) : `${Number(tx.orderShares).toFixed(2)} 份` }}
            </span>
            <span
              class="px-1.5 py-px rounded"
              :class="tx.status === 'draft' ? 'text-amber-600 dark:text-amber-400 bg-amber-500/10' : 'color-fade bg-secondary'"
            >
              {{ tx.status === 'draft' ? '预操作' : '待确认' }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
