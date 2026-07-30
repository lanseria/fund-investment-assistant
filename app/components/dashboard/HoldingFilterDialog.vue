<script setup lang="ts">
import type { HoldingFilters } from '~/composables/useDashboardData'

const props = defineProps<{
  filters: HoldingFilters
  activeFilterCount: number
}>()

const emit = defineEmits(['reset'])

// 控制显隐
const open = defineModel<boolean>('open', { default: false })

// 筛选选项定义：标签 + 选中态配色（与 HoldingListRow badge 语义保持一致）
interface FilterOption {
  label: string
  // 选中时的配色（与列表内对应标签一致）
  activeClass: string
}

// 主力行为：抢筹(红)/建仓(橙)/洗盘(琥珀)/出货(绿)/基础走势(灰)
const mainActionOptions: FilterOption[] = [
  { label: '抢筹', activeClass: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300' },
  { label: '建仓', activeClass: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300' },
  { label: '洗盘', activeClass: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' },
  { label: '出货', activeClass: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' },
  { label: '基础走势', activeClass: 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300' },
]

// RSI / 布林 通用分桶配色：买入(红)/卖出(绿)/其他(灰)
const signalOptions: FilterOption[] = [
  { label: '买入', activeClass: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300' },
  { label: '卖出', activeClass: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' },
  { label: '其他', activeClass: 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300' },
]

// 未选中态通用样式
const idleClass = 'border border-gray-300 text-gray-500 dark:border-gray-600 dark:text-gray-400'

// 切换某分组内的某个值（选中则移除、未选则加入）
function toggle(group: keyof HoldingFilters, value: string) {
  const arr = props.filters[group]
  const idx = arr.indexOf(value)
  if (idx === -1)
    arr.push(value)
  else
    arr.splice(idx, 1)
}
</script>

<template>
  <Modal v-model="open" title="筛选基金">
    <div class="space-y-5">
      <!-- 顶部：已选计数 + 重置 -->
      <div class="text-sm flex items-center justify-between">
        <span class="text-gray-500 dark:text-gray-400">
          已选 <span class="text-gray-700 font-bold dark:text-gray-200">{{ activeFilterCount }}</span> 项 · 组内为「或」，组间为「与」
        </span>
        <button
          class="text-primary hover:text-primary-hover disabled:opacity-40 disabled:cursor-not-allowed"
          :disabled="activeFilterCount === 0"
          @click="emit('reset')"
        >
          重置
        </button>
      </div>

      <!-- 主力行为（板块主力行为每日收盘快照） -->
      <div>
        <h4 class="text-sm text-gray-700 font-semibold mb-2 dark:text-gray-200">
          板块主力行为
        </h4>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="opt in mainActionOptions"
            :key="opt.label"
            type="button"
            class="text-xs font-medium px-3 py-1 rounded-full transition-colors"
            :class="filters.mainActions.includes(opt.label) ? opt.activeClass : idleClass"
            @click="toggle('mainActions', opt.label)"
          >
            {{ opt.label }}
          </button>
        </div>
      </div>

      <!-- RSI 信号 -->
      <div>
        <h4 class="text-sm text-gray-700 font-semibold mb-2 dark:text-gray-200">
          RSI 信号
        </h4>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="opt in signalOptions"
            :key="opt.label"
            type="button"
            class="text-xs font-medium px-3 py-1 rounded-full transition-colors"
            :class="filters.rsi.includes(opt.label) ? opt.activeClass : idleClass"
            @click="toggle('rsi', opt.label)"
          >
            {{ opt.label }}
          </button>
        </div>
      </div>

      <!-- 布林信号 -->
      <div>
        <h4 class="text-sm text-gray-700 font-semibold mb-2 dark:text-gray-200">
          布林信号
        </h4>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="opt in signalOptions"
            :key="opt.label"
            type="button"
            class="text-xs font-medium px-3 py-1 rounded-full transition-colors"
            :class="filters.bollinger.includes(opt.label) ? opt.activeClass : idleClass"
            @click="toggle('bollinger', opt.label)"
          >
            {{ opt.label }}
          </button>
        </div>
      </div>
    </div>
  </Modal>
</template>
