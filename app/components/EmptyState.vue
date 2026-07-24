<script setup lang="ts">
/**
 * 统一的空状态组件，规范全站无数据/无结果/错误态的展示。
 * 替代各页面自行实现的临时 div。
 */
withDefaults(defineProps<{
  /** 图标（carbon iconify 类名），默认搜索图标 */
  icon?: string
  /** 主文案 */
  message: string
  /** 副文案/说明 */
  description?: string
}>(), {
  icon: 'i-carbon-search',
})

defineEmits<{
  (e: 'action'): void
}>()
</script>

<template>
  <div class="text-gray-500 py-16 text-center flex flex-col gap-3 items-center">
    <div :class="icon" class="text-5xl op-40" />
    <p class="font-medium">
      {{ message }}
    </p>
    <p v-if="description" class="text-sm text-gray-400 max-w-md">
      {{ description }}
    </p>
    <slot />
  </div>
</template>
