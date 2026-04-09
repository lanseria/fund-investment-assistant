<script setup lang="ts">
import type { Holding, SortableKey } from '~/types/holding'
import BaseStrategyTooltip from '~/components/BaseStrategyTooltip.vue'
import StrategyChartTooltip from '~/components/StrategyChartTooltip.vue'
import HoldingListRow from './HoldingListRow.vue'
import SectorEditModal from './SectorEditModal.vue'

const props = withDefaults(defineProps<{
  data: Holding[]
  sortKey: SortableKey | null
  sortOrder: 'asc' | 'desc'
  showActions?: boolean
  targetUserId?: number
}>(), {
  showActions: true,
})

const emit = defineEmits([
  'edit',
  'delete',
  'set-sort',
  'clear-position',
  'trade',
  'delete-transaction',
  'update-attention',
])

function setSort(key: SortableKey) {
  emit('set-sort', key)
}

// --- 板块编辑弹窗逻辑 ---
const sectorEditModal = ref(false)
const editingFund = ref<{ code: string, name: string, sector: string | null } | null>(null)

function handleEditSector(holding: Holding) {
  editingFund.value = {
    code: holding.code,
    name: holding.name,
    sector: holding.sector,
  }
  sectorEditModal.value = true
}

function handleSectorEditSuccess(result: { code: string, newSector: string | null }) {
  // 更新本地数据
  const fund = props.data.find(h => h.code === result.code)
  if (fund) {
    fund.sector = result.newSector
  }
  sectorEditModal.value = false
  editingFund.value = null
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

        <tbody>
          <HoldingListRow
            v-for="h in data"
            :key="h.code"
            :holding="h"
            :show-actions="showActions"
            :target-user-id="targetUserId"
            @edit="emit('edit', $event)"
            @delete="emit('delete', $event)"
            @clear-position="emit('clear-position', $event)"
            @edit-sector="handleEditSector"
            @trade="(h, type) => emit('trade', h, type)"
            @delete-transaction="emit('delete-transaction', $event)"
            @show-strategy-tooltip="handleShowTooltip"
            @hide-strategy-tooltip="handleHideTooltip"
            @update-attention="(code, level) => emit('update-attention', code, level)"
          />
        </tbody>
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
          <BaseStrategyTooltip v-if="hoveredStrategyKey === 'base'" :fund-code="hoveredFundCode" />
          <StrategyChartTooltip v-else :fund-code="hoveredFundCode" :strategy-key="hoveredStrategyKey" />
        </div>
      </Transition>
    </Teleport>

    <!-- 板块编辑弹窗 -->
    <Teleport to="body">
      <Transition name="fade">
        <div
          v-if="sectorEditModal && editingFund"
          class="bg-black/50 flex items-center inset-0 justify-center fixed z-50"
          @click.self="sectorEditModal = false"
        >
          <div class="p-6 rounded-lg bg-white max-w-md w-full shadow-xl dark:bg-gray-800" @click.stop>
            <h3 class="text-lg font-semibold mb-4">
              编辑板块
            </h3>
            <SectorEditModal
              fund-code="editingFund.code"
              fund-name="editingFund.name"
              current-sector="editingFund.sector"
              @success="handleSectorEditSuccess"
              @cancel="sectorEditModal = false"
            />
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>
