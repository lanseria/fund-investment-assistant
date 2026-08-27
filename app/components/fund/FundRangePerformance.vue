<script setup lang="ts">
/**
 * 基金区间涨跌幅：按时间区间展示涨跌幅按钮组。
 * 按钮组的数据与选中态由父级传入，点击时抛出 select-range 事件。
 */
const props = defineProps<{
  /** 区间筛选选项（来自 useFundStrategyData） */
  filters: { label: string, value: string }[]
  /** 当前选中的区间 */
  activeFilter: string | null
  /** 区间涨跌幅数据（key 与 filters.value 对应） */
  performance: Record<string, number | null> | null | undefined
  /** 区间涨跌幅请求加载中 */
  performanceLoading: boolean
}>()

const emit = defineEmits<{
  (e: 'select-range', value: string): void
}>()

function formatPerformance(key: string) {
  const val = props.performance?.[key]
  if (val === null || val === undefined)
    return '--'
  return `${val > 0 ? '+' : ''}${val.toFixed(2)}%`
}

function getPerformanceClass(key: string) {
  const val = props.performance?.[key]
  if (val === null || val === undefined)
    return 'text-gray-400'
  if (val > 0)
    return 'text-red-500 dark:text-red-400'
  if (val < 0)
    return 'text-green-500 dark:text-green-400'
  return 'text-gray-500'
}
</script>

<template>
  <div class="mb-4 p-4 card">
    <div class="gap-2 grid grid-cols-3 md:grid-cols-7 sm:grid-cols-4">
      <button
        v-for="filter in props.filters"
        :key="filter.value"
        class="p-2 border rounded-lg flex flex-col transition-all duration-200 items-center justify-center"
        :class="[
          props.activeFilter === filter.value
            ? 'bg-primary/5 border-primary shadow-sm'
            : 'border-transparent bg-gray-50 hover:bg-gray-100 dark:bg-gray-700/30 dark:hover:bg-gray-700/60',
        ]"
        @click="emit('select-range', filter.value)"
      >
        <!-- 标签 -->
        <span
          class="text-xs mb-1"
          :class="props.activeFilter === filter.value ? 'text-primary font-bold' : 'text-gray-500 dark:text-gray-400'"
        >
          {{ filter.label }}
        </span>

        <!-- 数值 -->
        <div class="flex h-6 items-center justify-center">
          <span v-if="props.performance === undefined && props.performanceLoading" class="i-carbon-circle-dash text-xs text-gray-400 animate-spin" />
          <span v-else class="text-sm font-bold font-mono tabular-nums" :class="getPerformanceClass(filter.value)">
            {{ formatPerformance(filter.value) }}
          </span>
        </div>
      </button>
    </div>
  </div>
</template>
