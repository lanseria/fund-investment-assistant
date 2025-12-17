<script setup lang="ts">
import type { Holding } from '~/types/holding'
import { SECTOR_DICT_TYPE } from '~/constants'

const props = defineProps<{
  holding: Holding
  showActions: boolean
}>()

const emit = defineEmits([
  'edit',
  'delete',
  'clear-position',
  'edit-sector',
  'trade',
  'delete-transaction',
  'show-strategy-tooltip', // [新增] 通知父组件显示 tooltip
  'hide-strategy-tooltip', // [新增] 通知父组件隐藏 tooltip
])

const { getLabel } = useDictStore()
const dayjs = useDayjs()

// --- 辅助函数 (从父组件移动过来) ---
function formatCurrency(value: number | null | undefined) {
  if (value === null || value === undefined)
    return '-'
  return new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY' }).format(value)
}

function getProfitClass(h: Holding) {
  if (h.holdingProfitAmount === null || h.holdingProfitAmount === undefined)
    return 'text-gray-500'
  if (h.holdingProfitAmount > 0)
    return 'text-red-500 dark:text-red-400'
  if (h.holdingProfitAmount < 0)
    return 'text-green-500 dark:text-green-400'
  return 'text-gray-500'
}

function getChangeClass(h: Holding) {
  if (h.percentageChange === null || h.percentageChange === undefined)
    return 'text-gray-500'
  if (h.percentageChange > 0)
    return 'text-red-500 dark:text-red-400'
  if (h.percentageChange < 0)
    return 'text-green-500 dark:text-green-400'
  return 'text-gray-500'
}

function getSignalTagClass(signal: string) {
  if (signal.includes('买入'))
    return 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300'
  if (signal.includes('卖出'))
    return 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300'
  return 'bg-gray-100 text-gray-800 dark:bg-gray-700/50 dark:text-gray-300'
}

function getBiasTagClass(bias: number) {
  if (bias > 0)
    return 'bg-red-50 text-red-600 border border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800/50'
  return 'bg-green-50 text-green-600 border border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800/50'
}

const strategiesForTags = {
  rsi: 'RSI',
  macd: 'MACD',
  bollinger_bands: '布林',
}

// 处理悬停事件，向父组件发送相关信息（DOM元素和数据）
function handleMouseEnter(event: MouseEvent, strategyKey: string) {
  emit('show-strategy-tooltip', {
    event,
    fundCode: props.holding.code,
    strategyKey,
  })
}
</script>

<template>
  <tr class="border-b transition-colors dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-800/50">
    <!-- 1. 基金名称与信号 -->
    <td class="font-semibold p-4">
      <button class="text-xs font-medium mr-2 px-2 py-0.5 rounded-full transition-colors" :class="holding.sector ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300 hover:bg-blue-200' : 'bg-gray-100 text-gray-500 dark:bg-gray-700/50 dark:text-gray-400 hover:bg-gray-200'" @click="emit('edit-sector', holding)">
        {{ getLabel(SECTOR_DICT_TYPE, holding.sector) || '未设置' }}
      </button>
      <NuxtLink :to="`/fund/${holding.code}`" class="transition-colors hover:text-primary-hover">
        {{ holding.name }}
      </NuxtLink>
      <div class="text-xs text-gray-400 font-normal font-numeric mt-1 dark:text-gray-500">
        {{ holding.code }}
      </div>

      <!-- 待确认交易展示区 -->
      <div v-if="holding.pendingTransactions && holding.pendingTransactions.length > 0" class="mt-1.5 space-y-1">
        <div
          v-for="tx in holding.pendingTransactions"
          :key="tx.id"
          class="group text-xs text-amber-800 px-2 py-0.5 border border-amber-200 rounded bg-amber-100 inline-flex cursor-pointer transition-colors items-center dark:text-amber-300 dark:border-amber-800/50 dark:bg-amber-900/30 hover:bg-amber-200 dark:hover:bg-amber-900/50"
          title="点击撤销此交易申请"
          @click.stop="emit('delete-transaction', tx)"
        >
          <div class="i-carbon-time mr-1 animate-pulse" />
          <span class="font-bold mr-1">{{ tx.type === 'buy' ? '买入' : '卖出' }}</span>
          <span class="font-numeric">
            {{ tx.type === 'buy' ? formatCurrency(tx.orderAmount) : `${tx.orderShares}份` }}
          </span>
          <span class="ml-1 opacity-75">(待确认)</span>
          <div class="i-carbon-close-filled text-amber-600 ml-1 opacity-0 transition-opacity group-hover:opacity-100" />
        </div>
      </div>

      <!-- 策略信号 -->
      <div v-if="holding.signals" class="mt-2 flex flex-wrap gap-1.5">
        <span
          v-for="(name, key) in strategiesForTags"
          :key="key"
          class="text-xs font-medium px-2 py-0.5 rounded-full cursor-pointer"
          :class="getSignalTagClass(holding.signals[key] || '无信号')"
          @mouseenter="handleMouseEnter($event, key as string)"
          @mouseleave="emit('hide-strategy-tooltip')"
        >
          {{ name }}: {{ holding.signals[key] ? holding.signals[key].slice(0, 1) : '-' }}
        </span>
        <span
          v-if="holding.bias20 !== null && holding.bias20 !== undefined"
          class="text-xs font-medium font-numeric px-2 py-0.5 rounded-full cursor-help"
          :class="getBiasTagClass(holding.bias20)"
          title="实时乖离率 (BIAS20): (现价 - MA20) / MA20"
        >
          BIAS: {{ holding.bias20 > 0 ? '+' : '' }}{{ holding.bias20.toFixed(2) }}%
        </span>
      </div>
    </td>

    <!-- 2. 持有市值 / 份额 -->
    <td class="font-mono p-4 text-right">
      <template v-if="holding.holdingAmount !== null">
        <div class="font-numeric font-semibold">
          {{ formatCurrency(holding.holdingAmount) }}
        </div>
        <div class="text-xs text-gray-500 font-numeric dark:text-gray-400">
          {{ holding.shares?.toFixed(2) }} 份
        </div>
        <div class="text-xs text-gray-500 font-numeric dark:text-gray-400">
          {{ holding.yesterdayNav }}
        </div>
      </template>
      <template v-else>
        <span class="text-sm text-gray-400">仅关注</span>
      </template>
    </td>

    <!-- 3. 持有收益 / 收益率 -->
    <td class="font-mono p-4 text-right" :class="getProfitClass(holding)">
      <template v-if="holding.holdingProfitRate !== null">
        <div class="font-numeric font-semibold">
          {{ formatCurrency(holding.holdingProfitAmount) }}
        </div>
        <div class="text-xs font-numeric">
          {{ `${holding.holdingProfitRate > 0 ? '+' : ''}${holding.holdingProfitRate!.toFixed(2)}%` }}
        </div>
        <div class="text-xs text-gray-500 font-numeric dark:text-gray-400">
          {{ holding.costPrice }}
        </div>
      </template>
      <template v-else>
        <span class="text-gray-400">-</span>
      </template>
    </td>

    <!-- 4. 估算涨跌 / 收益 -->
    <td class="font-mono p-4 text-right" :class="getChangeClass(holding)">
      <div class="font-numeric font-semibold">
        {{ holding.percentageChange !== null ? `${holding.percentageChange > 0 ? '+' : ''}${holding.percentageChange.toFixed(2)}%` : '-' }}
      </div>
      <div v-if="holding.todayEstimateAmount !== null && holding.holdingAmount !== null" class="text-xs font-numeric">
        {{ formatCurrency(holding.todayEstimateAmount - holding.holdingAmount) }}
      </div>
      <div v-else class="text-xs font-numeric">
        -
      </div>
      <div class="text-xs text-gray-500 font-numeric dark:text-gray-400">
        {{ holding.todayEstimateNav !== null ? holding.todayEstimateNav : '-' }}
      </div>
    </td>

    <!-- 5. 更新时间 -->
    <td class="text-sm text-gray-500 font-numeric p-4 text-right">
      {{ holding.todayEstimateUpdateTime ? dayjs(holding.todayEstimateUpdateTime).format('HH:mm:ss') : '-' }}
    </td>

    <!-- 6. 操作 (明确分行布局) -->
    <!-- 6. 操作 (两列纵向布局) -->
    <td v-if="showActions" class="p-4 text-right align-middle">
      <div class="flex gap-x-3 items-center justify-end">
        <!-- 左列：交易操作 (图标加大 text-xl) -->
        <div class="flex flex-col gap-y-3 items-center">
          <!-- 买入 -->
          <button class="icon-btn text-red-500/80 transition-transform hover:text-red-500 hover:scale-110" title="买入" @click="emit('trade', holding, 'buy')">
            <div i-si-glyph-button-buy class="text-xl" />
          </button>

          <!-- 卖出 (仅持仓时显示) -->
          <button v-if="holding.holdingAmount !== null" class="icon-btn text-green-500/80 transition-transform hover:text-green-500 hover:scale-110" title="卖出" @click="emit('trade', holding, 'sell')">
            <div i-si-glyph-button-sell class="text-xl" />
          </button>
        </div>

        <!-- 右列：管理操作 -->
        <div class="flex flex-col gap-y-2 items-center">
          <!-- 修改 -->
          <button class="icon-btn" title="修改" @click="emit('edit', holding)">
            <div i-carbon-edit />
          </button>

          <!-- 清仓 (仅持仓时显示) -->
          <button v-if="holding.holdingAmount !== null" class="icon-btn hover:text-orange-500" title="清仓 (转为仅关注)" @click="emit('clear-position', holding)">
            <div i-carbon-shopping-cart-clear />
          </button>

          <!-- 删除 -->
          <button class="icon-btn hover:text-red-500" title="删除" @click="emit('delete', holding)">
            <div i-carbon-trash-can />
          </button>
        </div>
      </div>
    </td>
  </tr>
</template>
