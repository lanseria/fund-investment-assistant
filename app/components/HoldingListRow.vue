<script setup lang="ts">
import type { Holding } from '~/types/holding'
import { format, isSameDay } from 'date-fns'
import { SECTOR_DICT_TYPE } from '~/constants'
import { formatCurrency, getChangeColorClass } from '~/utils/format'

const props = defineProps<{
  holding: Holding
  showActions: boolean
  targetUserId?: number
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
  'update-attention',
])

// 切换关注度逻辑
function toggleAttention() {
  const nextLevel = props.holding.attentionLevel >= 3 ? 1 : props.holding.attentionLevel + 1
  emit('update-attention', props.holding.code, nextLevel)
}

// --- 赎回费率与持有期状态（费率档位匹配、最近买入安全性、badge 配色） ---
const {
  redemptionFeeTags,
  lastRedemptionTag,
  feesDialogOpen,
  lastBuyStatus,
  holdingBadgeClass,
  holdingBadgeIcon,
  dialogHoldingStatusClass,
} = useRedemptionFees(toRef(props, 'holding'))

const { getLabel } = useDictStore()

// --- 辅助函数 ---

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

function getSignalTagClass(signal: string) {
  if (signal.includes('买入'))
    return 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300'
  if (signal.includes('卖出'))
    return 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300'
  return 'bg-gray-100 text-gray-800 dark:bg-gray-700/50 dark:text-gray-300'
}

// 板块主力行为集合：抢筹/建仓/洗盘/出货（base 标签位优先展示主力行为）
const MAIN_ACTIONS = ['抢筹', '建仓', '洗盘', '出货']

// base 标签位：若为板块主力行为则返回该行为，否则返回 null（回退到基础走势信号展示）
const baseMainAction = computed<string | null>(() => {
  const v = props.holding.signals?.base
  return v && MAIN_ACTIONS.includes(v) ? v : null
})

// 主力行为 badge 配色：抢筹/建仓 偏多（红橙），洗盘 警示（琥珀），出货 偏空（绿）
// 注意：洗盘用琥珀色，以与回退的"基础走势"（中性灰）区分开
function getMainActionClass(action: string) {
  switch (action) {
    case '抢筹':
      return 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300'
    case '建仓':
      return 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300'
    case '洗盘':
      return 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
    case '出货':
      return 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300'
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-700/50 dark:text-gray-300'
  }
}

function getBiasTagClass(bias: number) {
  if (bias > 0)
    return 'bg-red-50 text-red-600 border border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800/50'
  return 'bg-green-50 text-green-600 border border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800/50'
}

// 循环渲染的策略标签（base 已单独处理，优先展示板块主力行为）
const strategiesForTags = {
  rsi: 'RSI',
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
  <tr
    class="border-b transition-colors dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-800/50"
    :class="holding.holdingAmount === null ? 'bg-slate-50/50 dark:bg-gray-900/30' : ''"
  >
    <!-- 1. 基金名称与信号 -->
    <td
      class="font-semibold p-4 border-l-4 transition-colors"
      :class="[
        holding.attentionLevel >= 3 ? 'border-l-red-500'
        : holding.attentionLevel === 2 ? 'border-l-orange-400'
          : 'border-l-transparent',
      ]"
    >
      <div class="mb-1 flex gap-2 items-center">
        <!-- 关注度图标交互 -->
        <button
          type="button"
          class="icon-btn flex-shrink-0 transition-transform active:scale-90"
          :title="['普通关注 (点击升级)', '重点关注 (点击升级)', '核心关注 (点击降级)'][holding.attentionLevel - 1] || '设置关注度'"
          @click.prevent="toggleAttention"
        >
          <div v-if="holding.attentionLevel >= 3" class="i-carbon-fire text-red-500" />
          <div v-else-if="holding.attentionLevel === 2" class="i-carbon-star-filled text-orange-400" />
          <div v-else class="i-carbon-star text-gray-300 dark:text-gray-600 hover:text-orange-400" />
        </button>

        <button class="text-xs font-medium px-2 py-0.5 rounded-full flex-none transition-colors" :class="holding.sector ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300 hover:bg-blue-200' : 'bg-gray-100 text-gray-500 dark:bg-gray-700/50 dark:text-gray-400 hover:bg-gray-200'" @click="emit('edit-sector', holding)">
          {{ getLabel(SECTOR_DICT_TYPE, holding.sector) || '未设置' }}
        </button>
        <NuxtLink :to="targetUserId ? `/fund/${holding.code}?userId=${targetUserId}` : `/fund/${holding.code}`" class="truncate transition-colors hover:text-primary-hover">
          {{ holding.name }}
        </NuxtLink>
      </div>

      <!-- 优化后的基金代码与交易状态行 -->
      <div class="flex gap-3 h-5 items-center">
        <!-- 基金代码 -->
        <div class="text-xs text-gray-400 font-mono font-normal tabular-nums dark:text-gray-500">
          {{ holding.code }}
        </div>

        <!-- 分隔线 (持有期提示或赎回费率存在时显示) -->
        <div
          v-if="(holding.holdingAmount !== null && holding.recentTransactions?.some(t => t.type === 'buy' || t.type === 'convert_in')) || lastRedemptionTag"
          class="bg-gray-300 h-3 w-[1px] dark:bg-gray-600"
        />

        <!-- 持有期提示 (按当前适用赎回费率着色:≥1% 红、>0% 黄、0% 灰) -->
        <div
          v-if="holding.holdingAmount !== null && holding.recentTransactions?.some(t => t.type === 'buy' || t.type === 'convert_in')"
          class="text-[10px] px-1.5 py-0.5 border rounded flex gap-1 cursor-help items-center"
          :class="holdingBadgeClass"
          :title="lastBuyStatus.title"
        >
          <div :class="holdingBadgeIcon" />
          <span class="font-bold">{{ lastBuyStatus.label }}</span>
          <span v-if="lastBuyStatus.rate" class="font-mono">{{ lastBuyStatus.rate }}</span>
        </div>

        <!-- 赎回费率提示 (默认仅显示最后一档,点击弹出完整费率详情对话框) -->
        <span
          v-if="lastRedemptionTag"
          class="text-[10px] font-mono px-1.5 py-0.5 border rounded inline-flex gap-1 cursor-pointer transition-opacity items-center hover:opacity-70"
          :class="lastRedemptionTag.colorClass"
          title="点击查看完整费率详情"
          @click="feesDialogOpen = true"
        >
          <div class="i-carbon-currency text-xs" />
          {{ lastRedemptionTag.text }}
        </span>
      </div>

      <!-- 交易热点图 + 待确认交易 -->
      <div
        v-if="holding.recentTransactions?.length || (holding.pendingTransactions && holding.pendingTransactions.length > 0)"
        class="mt-2 flex flex-wrap gap-x-2 gap-y-1 items-center"
      >
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
              <!-- 左对齐(从圆点左缘向右展开):避免悬浮左侧圆点时 Tooltip 居中向左溢出被表格 overflow-x-auto 裁切 -->
              <div class="mb-2 opacity-0 pointer-events-none whitespace-pre translate-y-1 transform transition-all bottom-full left-0 absolute z-50 group-hover:opacity-100 group-hover:translate-y-0">
                <div class="text-xs text-white p-2 rounded bg-gray-800/90 shadow-lg backdrop-blur-sm dark:text-gray-900 dark:bg-white/90">
                  {{ getTransactionTooltip(tx) }}
                </div>
                <!-- 小三角 (对准 10px 宽圆点的中心，避免随 tooltip 宽度漂移) -->
                <div class="border-4 border-transparent border-t-gray-800/90 h-0 w-0 bottom-[-8px] left-[5px] absolute dark:border-t-white/90 -translate-x-1/2" />
              </div>
            </div>
          </div>
        </div>

        <!-- 待确认交易标签 -->
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
          <span class="font-mono tabular-nums">
            {{ (tx.type === 'buy' || tx.type === 'convert_in') ? (tx.orderAmount ? formatCurrency(tx.orderAmount) : '等待确认') : `${tx.orderShares}份` }}
          </span>

          <span class="ml-1 opacity-75">({{ tx.status === 'draft' ? '预操作' : '待处理' }})</span>

          <!-- 删除图标 (转入时不显示或显示禁用状态) -->
          <div v-if="tx.type !== 'convert_in'" class="i-carbon-close-filled ml-1 opacity-0 transition-opacity group-hover:opacity-100" />
        </div>
      </div>

      <!-- 策略信号 -->
      <div v-if="holding.signals" class="mt-2 flex flex-wrap gap-1.5 items-center">
        <!-- base 标签位：优先展示板块主力行为(完整文字+专用配色)，否则回退到基础走势信号 -->
        <span
          v-if="baseMainAction"
          class="text-xs font-medium px-2 py-0.5 rounded-full cursor-help"
          :class="getMainActionClass(baseMainAction)"
          title="板块主力行为（每日收盘快照）"
          @mouseenter="handleMouseEnter($event, 'base')"
          @mouseleave="emit('hide-strategy-tooltip')"
        >
          {{ baseMainAction }}
        </span>
        <span
          v-else
          class="text-xs text-gray-800 font-medium px-2 py-0.5 rounded-full bg-gray-100 cursor-pointer dark:text-gray-300 dark:bg-gray-700/50"
          title="板块主力行为（每日收盘快照）"
          @mouseenter="handleMouseEnter($event, 'base')"
          @mouseleave="emit('hide-strategy-tooltip')"
        >
          基础走势
        </span>
        <!-- rsi / bollinger_bands 策略信号 -->
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
          class="text-xs font-medium font-mono px-2 py-0.5 rounded-full cursor-help tabular-nums"
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
        <div class="font-mono font-semibold tabular-nums">
          {{ formatCurrency(holding.holdingAmount) }}
        </div>
        <div class="text-xs text-gray-500 font-mono tabular-nums dark:text-gray-400">
          {{ holding.shares?.toFixed(4) }} 份
        </div>
        <div class="text-xs text-gray-500 font-mono tabular-nums dark:text-gray-400">
          {{ holding.yesterdayNav }}
        </div>
      </template>
      <template v-else>
        <span class="text-sm text-gray-400">仅关注</span>
      </template>
    </td>

    <!-- 3. 持有收益 / 收益率 -->
    <td class="font-mono p-4 text-right" :class="getChangeColorClass(holding.holdingProfitAmount)">
      <template v-if="holding.holdingProfitRate !== null">
        <div class="font-mono font-semibold tabular-nums">
          {{ formatCurrency(holding.holdingProfitAmount) }}
        </div>
        <div class="text-xs font-mono tabular-nums">
          {{ `${holding.holdingProfitRate > 0 ? '+' : ''}${holding.holdingProfitRate!.toFixed(2)}%` }}
        </div>
        <div class="text-xs text-gray-500 font-mono tabular-nums dark:text-gray-400">
          {{ holding.costPrice }}
        </div>
      </template>
      <template v-else>
        <span class="text-gray-400">-</span>
      </template>
    </td>

    <!-- 4. 估算涨跌 / 收益 -->
    <td class="font-mono p-4 text-right" :class="getChangeColorClass(holding.percentageChange)">
      <div class="font-mono font-semibold tabular-nums">
        {{ holding.percentageChange !== null ? `${holding.percentageChange > 0 ? '+' : ''}${holding.percentageChange.toFixed(2)}%` : '-' }}
      </div>
      <div v-if="holding.todayEstimateAmount !== null && holding.holdingAmount !== null" class="text-xs font-mono tabular-nums">
        {{ formatCurrency(holding.todayEstimateAmount - holding.holdingAmount) }}
      </div>
      <div v-else class="text-xs font-mono tabular-nums">
        -
      </div>
      <div class="text-xs text-gray-500 font-mono tabular-nums dark:text-gray-400">
        {{ holding.todayEstimateNav !== null ? holding.todayEstimateNav : '-' }}
      </div>
    </td>

    <!-- 5. 更新时间 -->
    <td class="text-sm text-gray-500 font-mono p-4 text-right tabular-nums">
      <template v-if="holding.todayEstimateUpdateTime">
        <div>
          {{ format(holding.todayEstimateUpdateTime, 'HH:mm:ss') }}
        </div>
        <div
          class="text-10px"
          :class="!isSameDay(holding.todayEstimateUpdateTime, new Date()) ? 'text-orange-500 font-medium' : 'opacity-60'"
        >
          {{ format(holding.todayEstimateUpdateTime, 'yyyy-MM-dd') }}
        </div>
      </template>

      <template v-else>
        <span>-</span>
      </template>
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

  <!-- 费率详情对话框 (Teleport 至 body,避免表格内非法 DOM 结构) -->
  <Teleport to="body">
    <Modal v-model="feesDialogOpen" :title="`费率详情 · ${holding.name}`">
      <div v-if="holding.fees" class="space-y-4">
        <!-- 基金标识 -->
        <div class="text-xs text-gray-500 font-mono dark:text-gray-400">
          {{ holding.code }}
        </div>

        <!-- 持有期状态提示 (按当前适用费率着色) -->
        <div
          v-if="holding.holdingAmount !== null && holding.recentTransactions?.some(t => t.type === 'buy' || t.type === 'convert_in')"
          class="text-xs px-3 py-2 border rounded flex gap-2 items-center"
          :class="dialogHoldingStatusClass"
        >
          <div :class="lastBuyStatus.isSafe ? 'i-carbon-shield-check' : 'i-carbon-warning-alt'" />
          <span>
            最近买入于 <span class="font-mono font-semibold">{{ lastBuyStatus.date }}</span>,
            已持有 <span class="font-bold">{{ lastBuyStatus.days }}</span> 天,
            当前适用赎回费率 <span class="font-bold font-mono">{{ lastBuyStatus.rate || '未知' }}</span>。
          </span>
        </div>

        <!-- 赎回费阶梯表 -->
        <div v-if="redemptionFeeTags && redemptionFeeTags.length">
          <div class="text-sm font-semibold mb-2">
            赎回费阶梯
          </div>
          <div class="flex flex-col gap-1.5">
            <div
              v-for="(tag, i) in redemptionFeeTags"
              :key="i"
              class="text-xs font-mono px-3 py-1.5 border rounded flex items-center justify-between tabular-nums"
              :class="tag.colorClass"
            >
              <span>{{ tag.holdingPeriod }}</span>
              <span class="font-bold">{{ tag.rate }}</span>
            </div>
          </div>
        </div>

        <!-- 其他费用 -->
        <div class="text-xs flex flex-wrap gap-x-6 gap-y-2">
          <div v-if="holding.fees.purchaseFee">
            <span class="text-gray-500 dark:text-gray-400">申购费</span>
            <span class="font-mono font-semibold ml-1.5">{{ holding.fees.purchaseFee }}</span>
          </div>
          <div v-if="holding.fees.managementFee">
            <span class="text-gray-500 dark:text-gray-400">管理费</span>
            <span class="font-mono font-semibold ml-1.5">{{ holding.fees.managementFee }}</span>
          </div>
          <div v-if="holding.fees.custodyFee">
            <span class="text-gray-500 dark:text-gray-400">托管费</span>
            <span class="font-mono font-semibold ml-1.5">{{ holding.fees.custodyFee }}</span>
          </div>
        </div>

        <!-- 原始费率说明文本 -->
        <details v-if="holding.fees.rawText" class="text-xs text-gray-500 dark:text-gray-400">
          <summary class="cursor-pointer select-none">
            原始费率说明
          </summary>
          <pre class="font-mono mt-2 p-2 rounded bg-gray-50 whitespace-pre-wrap dark:bg-gray-900/50">{{ holding.fees.rawText }}</pre>
        </details>
      </div>
      <div v-else class="text-sm text-gray-400 py-4 text-center">
        暂无费率信息
      </div>
    </Modal>
  </Teleport>
</template>
