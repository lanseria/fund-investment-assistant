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

// 常见 metrics key 的中文映射（未命中的回退为原 key）
const METRIC_LABELS: Record<string, string> = {
  rsi6: 'RSI(6)',
  rsi12: 'RSI(12)',
  rsi24: 'RSI(24)',
  rsi14: 'RSI(14)',
  ma5: 'MA5',
  ma10: 'MA10',
  ma20: 'MA20',
  ma120: 'MA120',
  upper_band: '布林上轨',
  middle_band: '布林中轨',
  lower_band: '布林下轨',
  bandwidth: '带宽',
  percent_b: '%B',
  bias20: 'BIAS20',
}

function metricLabel(key: string): string {
  return METRIC_LABELS[key] || key
}

function formatMetricValue(value: any): string {
  if (typeof value === 'number')
    return value.toFixed(4)
  return String(value ?? '-')
}
</script>

<template>
  <div v-if="signal" class="space-y-4">
    <div class="p-4 rounded-md bg-gray-100 dark:bg-gray-700">
      <div class="flex items-baseline justify-between">
        <span class="text-xl font-bold" :class="signalColorClass">{{ signal.signal }}</span>
        <span class="text-sm text-gray-500 dark:text-gray-400">{{ signal.latestDate }}</span>
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
          <span class="text-gray-500 dark:text-gray-400">{{ metricLabel(String(key)) }}</span>
          <span class="font-mono">{{ formatMetricValue(value) }}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-gray-500 dark:text-gray-400">最新净值</span>
          <span class="font-mono">{{ (+signal.latestClose).toFixed(4) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
