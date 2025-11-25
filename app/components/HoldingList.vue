<script setup lang="ts">
import type { GroupedHolding, Holding, SortableKey } from '~/types/holding'
import StrategyChartTooltip from '~/components/StrategyChartTooltip.vue'
import { SECTOR_DICT_TYPE } from '~/constants'

withDefaults(defineProps<{
  data: Holding[] | GroupedHolding[] // 数据可以是扁平的或分组的
  isGrouped: boolean // 标志位，用于区分模式
  sortKey: SortableKey | null
  sortOrder: 'asc' | 'desc'
  showActions?: boolean // [新增] 控制是否显示操作列
}>(), {
  showActions: true, // 默认显示操作列
})

const emit = defineEmits(['edit', 'delete', 'set-sort', 'clear-position', 'edit-sector'])

const { getLabel } = useDictStore()

// --- [新增] 悬停图表逻辑 ---
const hoveredFundCode = ref<string | null>(null)
const hoveredStrategyKey = ref<string | null>(null)
const tooltipStyle = ref({ top: '0px', left: '0px', opacity: 0 })

function handleTagHover(event: MouseEvent, fundCode: string, strategyKey: string) {
  const target = event.currentTarget as HTMLElement
  if (!target)
    return

  const rect = target.getBoundingClientRect()
  hoveredFundCode.value = fundCode
  hoveredStrategyKey.value = strategyKey

  // Tooltip 尺寸预估 (基于 StrategyChartTooltip 组件的 h-40 w-64 + padding/border)
  // h-40(160px) + p-2(16px) + border(2px) ≈ 178px
  const TOOLTIP_HEIGHT = 180
  const GAP = 8

  // 获取视口高度
  const viewportHeight = window.innerHeight

  // 默认位置：在元素下方
  let top = rect.bottom + GAP

  // 智能判断：如果下方空间不足以容纳 tooltip，且上方空间充足，则显示在上方
  const spaceBelow = viewportHeight - rect.bottom
  if (spaceBelow < TOOLTIP_HEIGHT && rect.top > TOOLTIP_HEIGHT) {
    // 显示在上方：元素顶部 - tooltip高度 - 间距
    top = rect.top - TOOLTIP_HEIGHT - GAP
  }

  // 计算 Left (简单的右侧边界检查，防止溢出屏幕右侧)
  const TOOLTIP_WIDTH = 270 // w-64(256px) + padding + border
  const viewportWidth = window.innerWidth
  let left = rect.left
  if (left + TOOLTIP_WIDTH > viewportWidth) {
    left = viewportWidth - TOOLTIP_WIDTH - GAP
  }

  tooltipStyle.value = {
    top: `${top}px`,
    left: `${left}px`,
    opacity: 1,
  }
}

function handleTagLeave() {
  hoveredFundCode.value = null
  hoveredStrategyKey.value = null
  tooltipStyle.value.opacity = 0
}
// --- [结束] ---

function setSort(key: SortableKey) {
  emit('set-sort', key)
}

function getProfitClass(holding: { holdingProfitAmount: number | null }) {
  if (holding.holdingProfitAmount === null || holding.holdingProfitAmount === undefined)
    return 'text-gray-500'
  if (holding.holdingProfitAmount > 0)
    return 'text-red-500 dark:text-red-400'
  if (holding.holdingProfitAmount < 0)
    return 'text-green-500 dark:text-green-400'
  return 'text-gray-500'
}

function getChangeClass(holding: { percentageChange: number | null }) {
  if (holding.percentageChange === null || holding.percentageChange === undefined)
    return 'text-gray-500'
  if (holding.percentageChange > 0)
    return 'text-red-500 dark:text-red-400'
  if (holding.percentageChange < 0)
    return 'text-green-500 dark:text-green-400'
  return 'text-gray-500'
}

function formatCurrency(value: number | null | undefined) {
  if (value === null || value === undefined)
    return '-'
  return new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY' }).format(value)
}

// 获取信号标签样式的辅助函数
function getSignalTagClass(signal: string) {
  if (signal.includes('买入'))
    return 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300'
  if (signal.includes('卖出'))
    return 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300'
  // 默认为持有/观望/平仓等中性信号
  return 'bg-gray-100 text-gray-800 dark:bg-gray-700/50 dark:text-gray-300'
}

// 获取 BIAS 标签样式
function getBiasTagClass(bias: number) {
  // BIAS > 0 (价格在均线上方) -> 红色 (A股习惯)
  // BIAS < 0 (价格在均线下方) -> 绿色
  if (bias > 0)
    return 'bg-red-50 text-red-600 border border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800/50'
  return 'bg-green-50 text-green-600 border border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800/50'
}

// 定义要显示的策略及其简称
const strategiesForTags = {
  rsi: 'RSI',
  macd: 'MACD',
  bollinger_bands: '布林',
}
</script>

<template>
  <div class="card overflow-hidden">
    <div class="overflow-x-auto">
      <table class="text-left w-full table-fixed">
        <thead class="border-b bg-gray-50 dark:border-gray-700 dark:bg-gray-700/50">
          <tr>
            <th class="text-sm text-gray-600 font-semibold p-4 w-280px dark:text-gray-300">
              基金名称 / 策略信号
            </th>

            <!-- 合并 "持有金额" 和 "持有份额" 的表头，排序按 holdingAmount -->
            <th class="text-sm text-gray-600 font-semibold p-4 text-right w-36 cursor-pointer select-none dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700" @click="setSort('holdingAmount')">
              持有市值 / 份额
              <span v-if="sortKey === 'holdingAmount'" class="ml-1 align-middle inline-block">
                <div v-if="sortOrder === 'asc'" i-carbon-arrow-up />
                <div v-else i-carbon-arrow-down />
              </span>
            </th>

            <th class="text-sm text-gray-600 font-semibold p-4 text-right w-36 cursor-pointer select-none dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700" @click="setSort('holdingProfitRate')">
              持有收益 / 收益率
              <span v-if="sortKey === 'holdingProfitRate'" class="ml-1 align-middle inline-block">
                <div v-if="sortOrder === 'asc'" i-carbon-arrow-up /><div v-else i-carbon-arrow-down />
              </span>
            </th>

            <!-- 合并 "估算涨跌" 和 "估算金额" 的表头，排序按 percentageChange -->
            <th class="text-sm text-gray-600 font-semibold p-4 text-right w-36 cursor-pointer select-none dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700" @click="setSort('percentageChange')">
              估算涨跌 / 收益
              <span v-if="sortKey === 'percentageChange'" class="ml-1 align-middle inline-block">
                <div v-if="sortOrder === 'asc'" i-carbon-arrow-up />
                <div v-else i-carbon-arrow-down />
              </span>
            </th>

            <th class="text-sm text-gray-600 font-semibold p-4 text-right w-24 dark:text-gray-300">
              更新时间
            </th>
            <th v-if="showActions" class="text-sm text-gray-600 font-semibold p-4 text-right w-20 dark:text-gray-300">
              操作
            </th>
          </tr>
        </thead>
        <!-- 默认列表视图 -->
        <tbody v-if="!isGrouped">
          <tr v-for="h in (data as Holding[])" :key="h.code" class="border-b transition-colors dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-800/50">
            <td class="font-semibold p-4">
              <button class="text-xs font-medium mr-2 px-2 py-0.5 rounded-full transition-colors" :class="h.sector ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300 hover:bg-blue-200' : 'bg-gray-100 text-gray-500 dark:bg-gray-700/50 dark:text-gray-400 hover:bg-gray-200'" @click="emit('edit-sector', h)">
                {{ getLabel(SECTOR_DICT_TYPE, h.sector) || '未设置' }}
              </button>
              <NuxtLink :to="`/fund/${h.code}`" class="transition-colors hover:text-primary-hover">
                {{ h.name }}
              </NuxtLink>
              <div class="text-xs text-gray-400 font-normal font-numeric mt-1 dark:text-gray-500">
                {{ h.code }}
              </div>
              <div v-if="h.signals" class="mt-2 flex flex-wrap gap-1.5">
                <span
                  v-for="(name, key) in strategiesForTags"
                  :key="key"
                  class="text-xs font-medium px-2 py-0.5 rounded-full cursor-pointer"
                  :class="getSignalTagClass(h.signals[key] || '无信号')"
                  @mouseenter="handleTagHover($event, h.code, key as string)"
                  @mouseleave="handleTagLeave"
                >
                  {{ name }}: {{ h.signals[key] ? h.signals[key].slice(0, 1) : '-' }}
                </span>
                <!-- 实时 BIAS20 标签 (分组视图) -->
                <span
                  v-if="h.bias20 !== null && h.bias20 !== undefined"
                  class="text-xs font-medium font-numeric px-2 py-0.5 rounded-full cursor-help"
                  :class="getBiasTagClass(h.bias20)"
                  title="实时乖离率 (BIAS20): (现价 - MA20) / MA20"
                >
                  BIAS: {{ h.bias20 > 0 ? '+' : '' }}{{ h.bias20.toFixed(2) }}%
                </span>
              </div>
            </td>
            <td class="font-mono p-4 text-right">
              <template v-if="h.holdingAmount !== null">
                <div class="font-numeric font-semibold">
                  {{ formatCurrency(h.holdingAmount) }}
                </div>
                <div class="text-xs text-gray-500 font-numeric dark:text-gray-400">
                  {{ h.shares?.toFixed(2) }} 份
                </div>
                <div class="text-xs text-gray-500 font-numeric dark:text-gray-400">
                  {{ h.yesterdayNav }}
                </div>
              </template>
              <template v-else>
                <span class="text-sm text-gray-400">仅关注</span>
              </template>
            </td>
            <td class="font-mono p-4 text-right" :class="getProfitClass(h)">
              <template v-if="h.holdingProfitRate !== null">
                <div class="font-numeric font-semibold">
                  {{ formatCurrency(h.holdingProfitAmount) }}
                </div>
                <div class="text-xs font-numeric">
                  {{ `${h.holdingProfitRate > 0 ? '+' : ''}${h.holdingProfitRate.toFixed(2)}%` }}
                </div>
                <div class="text-xs text-gray-500 font-numeric dark:text-gray-400">
                  {{ h.costPrice }}
                </div>
              </template>
              <template v-else>
                <span class="text-gray-400">-</span>
              </template>
            </td>
            <td class="font-mono p-4 text-right" :class="getChangeClass(h)">
              <div class="font-numeric font-semibold">
                {{ h.percentageChange !== null ? `${h.percentageChange > 0 ? '+' : ''}${h.percentageChange.toFixed(2)}%` : '-' }}
              </div>
              <div v-if="h.todayEstimateAmount !== null && h.holdingAmount !== null" class="text-xs font-numeric">
                {{ formatCurrency(h.todayEstimateAmount - h.holdingAmount) }}
              </div>
              <div v-else class="text-xs font-numeric">
                -
              </div>
              <div class="text-xs text-gray-500 font-numeric dark:text-gray-400">
                {{ h.todayEstimateNav !== null ? h.todayEstimateNav : '-' }}
              </div>
            </td>
            <!-- 更新时间 -->
            <td class="text-sm text-gray-500 font-numeric p-4 text-right">
              {{ h.todayEstimateUpdateTime ? useDayjs()(h.todayEstimateUpdateTime).format('HH:mm:ss') : '-' }}
            </td>

            <!-- 操作 -->
            <td v-if="showActions" class="p-4 text-right">
              <div class="flex gap-2 justify-end">
                <button class="icon-btn" title="修改" @click="emit('edit', h)">
                  <div i-carbon-edit />
                </button>
                <button v-if="h.holdingAmount !== null" class="icon-btn hover:text-orange-500" title="清仓 (转为仅关注)" @click="emit('clear-position', h)">
                  <div i-carbon-shopping-cart-clear />
                </button>
                <button class="icon-btn hover:text-red-500" title="删除" @click="emit('delete', h)">
                  <div i-carbon-trash-can />
                </button>
              </div>
            </td>
          </tr>
        </tbody>
        <!-- 板块分组视图 -->
        <template v-if="isGrouped">
          <tbody v-for="group in (data as GroupedHolding[])" :key="group.sectorKey" class="border-b-2 border-gray-200 dark:border-gray-700">
            <!-- 分组头 -->
            <tr class="bg-gray-100 dark:bg-gray-700/50">
              <td class="font-semibold p-3" colspan="2">
                {{ group.sectorLabel }} ({{ group.holdingCount }})
              </td>
              <td class="font-mono p-3 text-right" colspan="2">
                <div class="font-numeric font-semibold">
                  {{ formatCurrency(group.groupTotalAmount) }}
                </div>
                <div class="text-xs text-gray-500 dark:text-gray-400">
                  板块市值
                </div>
              </td>
              <td class="font-mono p-3 text-right" :colspan="showActions ? 2 : 1">
                <div class="font-numeric font-semibold" :class="getChangeClass({ percentageChange: group.groupTotalProfitLoss })">
                  {{ formatCurrency(group.groupTotalProfitLoss) }}
                </div>
                <div class="text-xs text-gray-500 dark:text-gray-400">
                  今日预估盈亏
                </div>
              </td>
            </tr>
            <!-- 组内基金列表 -->
            <tr v-for="h in group.holdings" :key="h.code" class="border-t transition-colors dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-800/50">
              <!-- ... (基金行内容保持不变，直接复制) ... -->
              <td class="font-semibold p-4">
                <button class="text-xs font-medium mr-2 px-2 py-0.5 rounded-full transition-colors" :class="h.sector ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300 hover:bg-blue-200' : 'bg-gray-100 text-gray-500 dark:bg-gray-700/50 dark:text-gray-400 hover:bg-gray-200'" @click="emit('edit-sector', h)">
                  {{ getLabel(SECTOR_DICT_TYPE, h.sector) || '未设置' }}
                </button>
                <NuxtLink :to="`/fund/${h.code}`" class="transition-colors hover:text-primary-hover">
                  {{ h.name }}
                </NuxtLink>
                <div class="text-xs text-gray-400 font-normal font-numeric mt-1 dark:text-gray-500">
                  {{ h.code }}
                </div>
                <div v-if="h.signals" class="mt-2 flex flex-wrap gap-1.5">
                  <span
                    v-for="(name, key) in strategiesForTags"
                    :key="key"
                    class="text-xs font-medium px-2 py-0.5 rounded-full cursor-pointer"
                    :class="getSignalTagClass(h.signals[key] || '无信号')"
                    @mouseenter="handleTagHover($event, h.code, key as string)"
                    @mouseleave="handleTagLeave"
                  >
                    {{ name }}: {{ h.signals[key] ? h.signals[key].slice(0, 1) : '-' }}
                  </span>
                  <!-- 实时 BIAS20 标签 -->
                  <span
                    v-if="h.bias20 !== null && h.bias20 !== undefined"
                    class="text-xs font-medium font-numeric px-2 py-0.5 rounded-full cursor-help"
                    :class="getBiasTagClass(h.bias20)"
                    title="实时乖离率 (BIAS20): (现价 - MA20) / MA20"
                  >
                    BIAS: {{ h.bias20 > 0 ? '+' : '' }}{{ h.bias20.toFixed(2) }}%
                  </span>
                </div>
              </td>
              <td class="font-mono p-4 text-right">
                <template v-if="h.holdingAmount !== null">
                  <div class="font-numeric font-semibold">
                    {{ formatCurrency(h.holdingAmount) }}
                  </div>
                  <div class="text-xs text-gray-500 font-numeric dark:text-gray-400">
                    {{ h.shares?.toFixed(2) }} 份
                  </div>
                  <div class="text-xs text-gray-500 font-numeric dark:text-gray-400">
                    {{ h.yesterdayNav }}
                  </div>
                </template>
                <template v-else>
                  <span class="text-sm text-gray-400">仅关注</span>
                </template>
              </td>
              <td class="font-mono p-4 text-right" :class="getProfitClass(h)">
                <template v-if="h.holdingProfitRate !== null">
                  <div class="font-numeric font-semibold">
                    {{ formatCurrency(h.holdingProfitAmount) }}
                  </div>
                  <div class="text-xs font-numeric">
                    {{ `${h.holdingProfitRate > 0 ? '+' : ''}${h.holdingProfitRate.toFixed(2)}%` }}
                  </div>
                  <div class="text-xs text-gray-500 font-numeric dark:text-gray-400">
                    {{ h.costPrice }}
                  </div>
                </template>
                <template v-else>
                  <span class="text-gray-400">-</span>
                </template>
              </td>
              <td class="font-mono p-4 text-right" :class="getChangeClass(h)">
                <div class="font-numeric font-semibold">
                  {{ h.percentageChange !== null ? `${h.percentageChange > 0 ? '+' : ''}${h.percentageChange.toFixed(2)}%` : '-' }}
                </div>
                <div v-if="h.todayEstimateAmount !== null && h.holdingAmount !== null" class="text-xs font-numeric">
                  {{ formatCurrency(h.todayEstimateAmount - h.holdingAmount) }}
                </div>
                <div v-else class="text-xs font-numeric">
                  -
                </div>
                <div class="text-xs text-gray-500 font-numeric dark:text-gray-400">
                  {{ h.todayEstimateNav !== null ? h.todayEstimateNav : '-' }}
                </div>
              </td>
              <td class="text-sm text-gray-500 font-numeric p-4 text-right">
                {{ h.todayEstimateUpdateTime ? useDayjs()(h.todayEstimateUpdateTime).format('HH:mm:ss') : '-' }}
              </td>
              <td v-if="showActions" class="p-4 text-right">
                <div class="flex gap-2 justify-end">
                  <button class="icon-btn" title="修改" @click="emit('edit', h)">
                    <div i-carbon-edit />
                  </button>
                  <button v-if="h.holdingAmount !== null" class="icon-btn hover:text-orange-500" title="清仓 (转为仅关注)" @click="emit('clear-position', h)">
                    <div i-carbon-shopping-cart-clear />
                  </button>
                  <button class="icon-btn hover:text-red-500" title="删除" @click="emit('delete', h)">
                    <div i-carbon-trash-can />
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </template>
      </table>
    </div>
    <Teleport to="body">
      <Transition name="fade">
        <div
          v-if="hoveredFundCode && hoveredStrategyKey"
          class="pointer-events-none transition-opacity fixed z-50"
          :style="tooltipStyle"
        >
          <StrategyChartTooltip
            :fund-code="hoveredFundCode"
            :strategy-key="hoveredStrategyKey"
          />
        </div>
      </Transition>
    </Teleport>
  </div>
</template>
