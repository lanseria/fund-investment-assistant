<script setup lang="ts">
import type { GroupedHolding, Holding, SortableKey } from '~/types/holding'
import StrategyChartTooltip from '~/components/StrategyChartTooltip.vue'
// 导入新组件
import HoldingListRow from './HoldingListRow.vue'

withDefaults(defineProps<{
  data: Holding[] | GroupedHolding[]
  isGrouped: boolean
  sortKey: SortableKey | null
  sortOrder: 'asc' | 'desc'
  showActions?: boolean
}>(), {
  showActions: true,
})

const emit = defineEmits(['edit', 'delete', 'set-sort', 'clear-position', 'edit-sector', 'trade', 'delete-transaction'])

function setSort(key: SortableKey) {
  emit('set-sort', key)
}

function formatCurrency(value: number | null | undefined) {
  if (value === null || value === undefined)
    return '-'
  return new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY' }).format(value)
}

function getChangeClass(value: number | null) {
  if (value === null || value === undefined)
    return 'text-gray-500'
  if (value > 0)
    return 'text-red-500 dark:text-red-400'
  if (value < 0)
    return 'text-green-500 dark:text-green-400'
  return 'text-gray-500'
}

// --- Tooltip 逻辑 ---
const hoveredFundCode = ref<string | null>(null)
const hoveredStrategyKey = ref<string | null>(null)
const tooltipStyle = ref({ top: '0px', left: '0px', opacity: 0 })

// 接收子组件传来的显示 Tooltip 请求
function handleShowTooltip({ event, fundCode, strategyKey }: { event: MouseEvent, fundCode: string, strategyKey: string }) {
  const target = event.currentTarget as HTMLElement
  if (!target)
    return

  const rect = target.getBoundingClientRect()
  hoveredFundCode.value = fundCode
  hoveredStrategyKey.value = strategyKey

  // 计算位置逻辑 (保持不变)
  const TOOLTIP_HEIGHT = 180
  const GAP = 8
  const viewportHeight = window.innerHeight

  let top = rect.bottom + GAP
  const spaceBelow = viewportHeight - rect.bottom
  if (spaceBelow < TOOLTIP_HEIGHT && rect.top > TOOLTIP_HEIGHT) {
    top = rect.top - TOOLTIP_HEIGHT - GAP
  }

  const TOOLTIP_WIDTH = 270
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

function handleHideTooltip() {
  hoveredFundCode.value = null
  hoveredStrategyKey.value = null
  tooltipStyle.value.opacity = 0
}
</script>

<template>
  <div class="card overflow-hidden">
    <div class="overflow-x-auto">
      <table class="text-left w-full table-fixed">
        <thead class="border-b bg-gray-50 dark:border-gray-700 dark:bg-gray-700/50">
          <tr>
            <th class="text-sm text-gray-600 font-semibold p-4 w-310px dark:text-gray-300">
              基金名称 / 策略信号
            </th>

            <th class="text-sm text-gray-600 font-semibold p-4 text-right w-32 cursor-pointer select-none dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700" @click="setSort('holdingAmount')">
              持有市值 / 份额
              <span v-if="sortKey === 'holdingAmount'" class="ml-1 align-middle inline-block">
                <div v-if="sortOrder === 'asc'" i-carbon-arrow-up />
                <div v-else i-carbon-arrow-down />
              </span>
            </th>

            <th class="text-sm text-gray-600 font-semibold p-4 text-right w-32 cursor-pointer select-none dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700" @click="setSort('holdingProfitRate')">
              持有收益 / 收益率
              <span v-if="sortKey === 'holdingProfitRate'" class="ml-1 align-middle inline-block">
                <div v-if="sortOrder === 'asc'" i-carbon-arrow-up /><div v-else i-carbon-arrow-down />
              </span>
            </th>

            <th class="text-sm text-gray-600 font-semibold p-4 text-right w-32 cursor-pointer select-none dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700" @click="setSort('percentageChange')">
              估算涨跌 / 收益
              <span v-if="sortKey === 'percentageChange'" class="ml-1 align-middle inline-block">
                <div v-if="sortOrder === 'asc'" i-carbon-arrow-up />
                <div v-else i-carbon-arrow-down />
              </span>
            </th>

            <th class="text-sm text-gray-600 font-semibold p-4 text-right w-24 dark:text-gray-300">
              更新时间
            </th>
            <th v-if="showActions" class="text-sm text-gray-600 font-semibold p-4 text-right w-22 dark:text-gray-300">
              操作
            </th>
          </tr>
        </thead>

        <!-- 1. 默认列表视图 -->
        <tbody v-if="!isGrouped">
          <HoldingListRow
            v-for="h in (data as Holding[])"
            :key="h.code"
            :holding="h"
            :show-actions="showActions"
            @edit="emit('edit', $event)"
            @delete="emit('delete', $event)"
            @clear-position="emit('clear-position', $event)"
            @edit-sector="emit('edit-sector', $event)"
            @trade="(h, type) => emit('trade', h, type)"
            @delete-transaction="emit('delete-transaction', $event)"
            @show-strategy-tooltip="handleShowTooltip"
            @hide-strategy-tooltip="handleHideTooltip"
          />
        </tbody>

        <!-- 2. 板块分组视图 -->
        <template v-else>
          <tbody v-for="group in (data as GroupedHolding[])" :key="group.sectorKey" class="border-b-2 border-gray-200 dark:border-gray-700">
            <!-- 分组头 (保持不变，这部分不重复) -->
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
                <div class="font-numeric font-semibold" :class="getChangeClass(group.groupTotalProfitLoss)">
                  {{ formatCurrency(group.groupTotalProfitLoss) }}
                </div>
                <div class="text-xs text-gray-500 dark:text-gray-400">
                  今日预估盈亏
                </div>
              </td>
            </tr>

            <!-- 组内循环调用子组件 -->
            <HoldingListRow
              v-for="h in group.holdings"
              :key="h.code"
              :holding="h"
              :show-actions="showActions"
              @edit="emit('edit', $event)"
              @delete="emit('delete', $event)"
              @clear-position="emit('clear-position', $event)"
              @edit-sector="emit('edit-sector', $event)"
              @trade="(h, type) => emit('trade', h, type)"
              @delete-transaction="emit('delete-transaction', $event)"
              @show-strategy-tooltip="handleShowTooltip"
              @hide-strategy-tooltip="handleHideTooltip"
            />
          </tbody>
        </template>
      </table>
    </div>

    <!-- Tooltip 保持不变 -->
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
