<script setup lang="ts">
import { computed } from 'vue'

/**
 * 通用统计指标卡，统一各页面的指标展示风格。
 * 支持涨跌着色、自定义后缀、紧凑模式。
 */
const props = withDefaults(defineProps<{
  /** 指标标签 */
  label: string
  /** 指标值（已格式化的字符串，或原始数字） */
  value: number | string | null | undefined
  /** 是否按涨跌着色（>0 红 / <0 绿 / 0 灰），默认 false */
  colored?: boolean
  /** 值的额外样式（用于覆盖默认大小） */
  valueClass?: string
  /** 副标题/说明 */
  hint?: string
  /** 图标 */
  icon?: string
}>(), {
  colored: false,
})

const displayValue = computed(() => {
  if (props.value === null || props.value === undefined)
    return '-'
  return String(props.value)
})

// 涨跌着色
const colorClass = computed(() => {
  if (!props.colored || props.value === null || props.value === undefined)
    return ''
  const num = Number(props.value)
  if (Number.isNaN(num) || num === 0)
    return 'text-gray-500 dark:text-gray-400'
  return num > 0 ? 'text-red-500 dark:text-red-400' : 'text-green-500 dark:text-green-400'
})

// 正数补加号（仅 colored 模式）
const displayValueWithSign = computed(() => {
  if (!props.colored || props.value === null || props.value === undefined)
    return displayValue.value
  const num = Number(props.value)
  if (Number.isNaN(num) || num <= 0)
    return displayValue.value
  return `+${displayValue.value}`
})
</script>

<template>
  <div class="p-2 flex flex-col gap-1">
    <div class="flex gap-1 items-center">
      <div v-if="icon" :class="icon" class="text-sm text-gray-400" />
      <span class="text-xs text-gray-500 dark:text-gray-400">{{ label }}</span>
    </div>
    <span
      class="text-xl font-bold font-mono tabular-nums"
      :class="[colorClass || 'text-gray-900 dark:text-white', valueClass]"
    >
      {{ displayValueWithSign }}
    </span>
    <span v-if="hint" class="text-[10px] text-gray-400">{{ hint }}</span>
  </div>
</template>
