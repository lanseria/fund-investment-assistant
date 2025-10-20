<script setup lang="ts">
// 我们将直接接收一个完整的信号对象
const props = defineProps<{
  signal: Record<string, any> | null
}>()

const signalColorClass = computed(() => {
  if (!props.signal)
    return ''
  if (props.signal.signal === '买入')
    return 'text-red-500'
  if (props.signal.signal === '卖出')
    return 'text-green-500'
  return 'text-gray-500'
})
</script>

<template>
  <div v-if="signal" class="space-y-4">
    <div class="p-4 rounded-md bg-gray-100 dark:bg-gray-700">
      <div class="flex items-baseline justify-between">
        <span class="text-xl font-bold" :class="signalColorClass">{{ signal.signal }}</span>
        <span class="text-sm text-gray-500 dark:text-gray-400">{{ signal.latest_date }}</span>
      </div>
      <p class="text-gray-700 mt-2 dark:text-gray-300">
        {{ signal.reason }}
      </p>
    </div>

    <div>
      <h4 class="font-semibold mb-2">
        策略指标
      </h4>
      <div class="text-sm p-3 border rounded-md space-y-2 dark:border-gray-600">
        <div v-for="(value, key) in signal.metrics" :key="key" class="flex justify-between">
          <span class="text-gray-500 dark:text-gray-400">{{ key }}</span>
          <span class="font-mono">{{ typeof value === 'number' ? value.toFixed(4) : value }}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-gray-500 dark:text-gray-400">latest_close</span>
          <span class="font-mono">{{ (+signal.latestClose).toFixed(4) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
