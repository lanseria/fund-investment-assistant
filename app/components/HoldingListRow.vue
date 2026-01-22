<script setup lang="ts">
import type { Holding } from '~/types/holding'
import { SECTOR_DICT_TYPE } from '~/constants'
import { formatCurrency } from '~/utils/format'

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
  'show-strategy-tooltip',
  'hide-strategy-tooltip',
])

const { getLabel } = useDictStore()
const dayjs = useDayjs()

// --- 辅助函数 ---

// [新增] 计算最近一次买入的持有状态
const lastBuyStatus = computed(() => {
  const txs = props.holding.recentTransactions
  if (!txs || txs.length === 0)
    return { isSafe: true, label: '无近买', days: 7 }

  // 找到最近的一笔买入交易（包含普通买入和转换转入）
  const lastBuy = txs.find(t => t.type === 'buy' || t.type === 'convert_in')

  // 如果最近7笔没有买入，说明买入很久了，肯定是安全的
  if (!lastBuy)
    return { isSafe: true, label: '7天+', days: 8, date: null }

  const buyDate = dayjs(lastBuy.date)
  // 计算持有天数 (今天 - 买入日期)
  // 注意：基金持有天数通常包含周末，从确认日开始算。
  // 这里做简单计算：当前日期 - 订单日期。如果刚好卡在临界点，建议用户去券商APP确认。
  const diffDays = dayjs().diff(buyDate, 'day')

  return {
    isSafe: diffDays >= 7,
    label: diffDays >= 7 ? '7天+' : `${diffDays}天`,
    days: diffDays,
    date: lastBuy.date,
  }
})

// [优化] 格式化交易详情 tooltip
function getTransactionTooltip(tx: any) {
  let typeStr = ''
  if (tx.type === 'buy')
    typeStr = '买入'
  else if (tx.type === 'sell')
    typeStr = '卖出'
  else if (tx.type === 'convert_out')
    typeStr = '转出'
  else if (tx.type === 'convert_in')
    typeStr = '转入'

  const dateStr = tx.date
  let detailStr = ''

  if ((tx.type === 'buy' || tx.type === 'convert_in') && tx.amount)
    detailStr = `金额: ¥${Number(tx.amount).toLocaleString()}`
  else if ((tx.type === 'sell' || tx.type === 'convert_out') && tx.shares)
    detailStr = `份额: ${Number(tx.shares).toFixed(2)}`

  const navStr = tx.nav ? ` (净值: ${Number(tx.nav).toFixed(4)})` : ''
  return `${dateStr} ${typeStr}\n${detailStr}${navStr}`
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
      <div class="mb-1 flex items-center">
        <button class="text-xs font-medium mr-2 px-2 py-0.5 rounded-full flex-none transition-colors" :class="holding.sector ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300 hover:bg-blue-200' : 'bg-gray-100 text-gray-500 dark:bg-gray-700/50 dark:text-gray-400 hover:bg-gray-200'" @click="emit('edit-sector', holding)">
          {{ getLabel(SECTOR_DICT_TYPE, holding.sector) || '未设置' }}
        </button>
        <NuxtLink :to="`/fund/${holding.code}`" class="transition-colors hover:text-primary-hover">
          {{ holding.name }}
        </NuxtLink>
      </div>

      <!-- 优化后的基金代码与交易状态行 -->
      <div class="flex gap-3 h-5 items-center">
        <!-- 基金代码 -->
        <div class="text-xs text-gray-400 font-normal font-numeric dark:text-gray-500">
          {{ holding.code }}
        </div>

        <!-- 分隔线 -->
        <div v-if="holding.recentTransactions?.length" class="bg-gray-300 h-3 w-[1px] dark:bg-gray-600" />

        <!-- 7天持有期提示 (仅在有近期买入且不足7天时高亮) -->
        <div
          v-if="holding.recentTransactions?.some(t => t.type === 'buy' || t.type === 'convert_in')"
          class="text-[10px] px-1.5 py-0.5 border rounded flex gap-1 cursor-help items-center"
          :class="lastBuyStatus.isSafe
            ? 'border-gray-200 text-gray-400 bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-500' // 安全状态：低调显示
            : 'border-amber-200 text-amber-600 bg-amber-50 animate-pulse dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-400' // 警告状态：高亮显示
          "
          :title="lastBuyStatus.isSafe
            ? `安全: 最近买入于 ${lastBuyStatus.date}，已持有 ${lastBuyStatus.days} 天。赎回费率较低。`
            : `警告: 最近买入于 ${lastBuyStatus.date}，仅持有 ${lastBuyStatus.days} 天！现在卖出可能面临 1.5% 惩罚性费率。`
          "
        >
          <div :class="lastBuyStatus.isSafe ? 'i-carbon-shield-check' : 'i-carbon-hourglass'" />
          <span class="font-bold">{{ lastBuyStatus.label }}</span>
        </div>

        <!-- 交易热点图 (Visual Timeline) -->
        <div v-if="holding.recentTransactions?.length" class="flex flex-row-reverse gap-[-2px] items-center">
          <div
            v-for="(tx, idx) in holding.recentTransactions"
            :key="tx.id"
            class="group relative"
            :style="{ zIndex: 10 - idx }"
          >
            <!-- 交易圆点 -->
            <div
              class="rounded-full h-2.5 w-2.5 cursor-pointer ring-1 ring-white transition-all dark:ring-gray-800 hover:scale-125 hover:z-20"
              :class="[
                // 买入/转入为红/紫，卖出/转出为绿/蓝
                (tx.type === 'buy' || tx.type === 'convert_in')
                  ? (tx.type === 'convert_in' ? 'bg-purple-500 dark:bg-purple-400' : 'bg-red-500 dark:bg-red-400')
                  : (tx.type === 'convert_out' ? 'bg-blue-500 dark:bg-blue-400' : 'bg-green-500 dark:bg-green-400'),
                idx === 0 ? 'ring-2 !ring-offset-1 !ring-offset-transparent' : '', // 最新一笔加粗圈
              ]"
            >
              <!-- 悬浮 Tooltip (纯CSS实现，比 title 更快) -->
              <div class="mb-2 opacity-0 pointer-events-none whitespace-pre translate-y-1 transform transition-all bottom-full left-1/2 absolute z-50 group-hover:opacity-100 -translate-x-1/2 group-hover:translate-y-0">
                <div class="text-xs text-white p-2 rounded bg-gray-800/90 shadow-lg backdrop-blur-sm dark:text-gray-900 dark:bg-white/90">
                  {{ getTransactionTooltip(tx) }}
                </div>
                <!-- 小三角 -->
                <div class="border-4 border-transparent border-t-gray-800/90 h-0 w-0 bottom-[-8px] left-1/2 absolute dark:border-t-white/90 -translate-x-1/2" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 待确认交易展示区 -->
      <div v-if="holding.pendingTransactions && holding.pendingTransactions.length > 0" class="mt-2 space-y-1">
        <div
          v-for="tx in holding.pendingTransactions"
          :key="tx.id"
          class="group text-xs px-2 py-0.5 border rounded inline-flex transition-colors items-center"
          :class="{
            'text-amber-800 border-amber-200 bg-amber-100 dark:text-amber-300 dark:border-amber-800/50 dark:bg-amber-900/30 hover:bg-amber-200': tx.type === 'buy' || tx.type === 'sell',
            'text-indigo-800 border-indigo-200 bg-indigo-100 dark:text-indigo-300 dark:border-indigo-800/50 dark:bg-indigo-900/30 hover:bg-indigo-200': tx.type === 'convert_out' || tx.type === 'convert_in',
            'cursor-pointer': tx.type !== 'convert_in', // 转入不能直接点击删除
            'cursor-not-allowed opacity-80': tx.type === 'convert_in',
          }"
          :title="tx.type === 'convert_in' ? '请删除对应的 [转出] 记录以撤销' : '点击撤销此交易申请'"
          @click.stop="tx.type !== 'convert_in' && emit('delete-transaction', tx)"
        >
          <div class="i-carbon-time mr-1 animate-pulse" />

          <!-- 类型标签 -->
          <span class="font-bold mr-1">
            {{ tx.type === 'buy' ? '买入' : (tx.type === 'sell' ? '卖出' : (tx.type === 'convert_out' ? '转出' : '转入')) }}
          </span>

          <!-- 金额/份额 -->
          <span class="font-numeric">
            {{ (tx.type === 'buy' || tx.type === 'convert_in') ? (tx.orderAmount ? formatCurrency(tx.orderAmount) : '等待确认') : `${tx.orderShares}份` }}
          </span>

          <span class="ml-1 opacity-75">(待确认)</span>

          <!-- 删除图标 (转入时不显示或显示禁用状态) -->
          <div v-if="tx.type !== 'convert_in'" class="i-carbon-close-filled ml-1 opacity-0 transition-opacity group-hover:opacity-100" />
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

    <!-- ... (后续的 td: 市值、收益、涨跌、更新时间、操作 保持不变) -->
    <!-- 2. 持有市值 / 份额 -->
    <td class="font-mono p-4 text-right">
      <template v-if="holding.holdingAmount !== null">
        <div class="font-numeric font-semibold">
          {{ formatCurrency(holding.holdingAmount) }}
        </div>
        <div class="text-xs text-gray-500 font-numeric dark:text-gray-400">
          {{ holding.shares?.toFixed(4) }} 份
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

    <!-- 6. 操作 -->
    <td v-if="showActions" class="p-4 text-right align-middle">
      <div class="flex gap-x-3 items-center justify-end">
        <!-- 左列：交易操作 -->
        <div class="flex flex-col gap-y-1 items-center">
          <!-- 买入 -->
          <button class="icon-btn text-red-500/80 transition-transform hover:text-red-500" title="买入" @click="emit('trade', holding, 'buy')">
            <div class="font-bold">
              买入
            </div>
          </button>
          <!-- 转换按钮 (仅当有持仓时显示) -->
          <button
            v-if="holding.holdingAmount !== null"
            class="icon-btn text-blue-500/80 transition-transform hover:text-blue-500"
            title="转换 (Switch)"
            @click="emit('trade', holding, 'convert')"
          >
            <!-- 两个水平箭头图标 -->
            <div i-carbon-arrows-horizontal class="text-lg font-bold" />
          </button>
          <!-- 卖出 (仅持仓时显示) -->
          <button v-if="holding.holdingAmount !== null" class="icon-btn text-green-500/80 transition-transform hover:text-green-500" title="卖出" @click="emit('trade', holding, 'sell')">
            <div class="font-bold">
              卖出
            </div>
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
