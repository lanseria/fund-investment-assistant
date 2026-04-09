<script setup lang="ts">
import MiniFundChart from '~/components/charts/MiniFundChart.vue'
import { apiFetch } from '~/utils/api'

const props = defineProps<{
  fundCode: string
}>()

const { data: chartData, pending, error } = useAsyncData(
  `base-strategy-tooltip-${props.fundCode}`,
  async () => {
    return await apiFetch(`/api/fund/holdings/${props.fundCode}/history`, {
      params: {
        ma: [5, 20, 120],
      },
    })
  },
  {
    watch: [() => props.fundCode],
  },
)

const slicedChartData = computed(() => {
  if (!chartData.value)
    return null

  const fullData = chartData.value as any
  const history = fullData.history || []
  if (!history.length)
    return fullData

  const dayjs = useDayjs()
  const totalPoints = history.length
  const lastDate = history[totalPoints - 1]?.date
  const targetDate = dayjs(lastDate).subtract(3, 'months')
  let startIndex = history.findIndex((p: any) => dayjs(p.date).isAfter(targetDate))
  if (startIndex === -1)
    startIndex = 0

  return {
    ...fullData,
    history: history.slice(startIndex),
    transactions: Array.isArray(fullData.transactions)
      ? fullData.transactions.filter((tx: any) => {
          const startDate = history[startIndex]?.date
          const endDate = history.at(-1)?.date
          if (!startDate || !endDate || !tx?.orderDate)
            return false
          return tx.orderDate >= startDate && tx.orderDate <= endDate
        })
      : fullData.transactions,
  }
})
</script>

<template>
  <div class="p-2 border card bg-white h-40 w-64 shadow-lg dark:bg-gray-800">
    <div v-if="pending" class="flex h-full items-center justify-center">
      <div i-carbon-circle-dash class="text-2xl text-primary animate-spin" />
    </div>
    <div v-else-if="error" class="text-xs text-red-500 text-center flex h-full items-center justify-center">
      加载失败: {{ error.message }}
    </div>
    <div v-else-if="slicedChartData" class="h-full w-full">
      <MiniFundChart
        :history="(slicedChartData as any).history"
        :signals="(slicedChartData as any).signals"
        :transactions="(slicedChartData as any).transactions"
      />
    </div>
  </div>
</template>
