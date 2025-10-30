<script setup lang="ts">
import type { RsiChartData } from '~/types/chart'

defineProps<{
  chartData: RsiChartData
  title: string
  dataZoomStart: number
  dataZoomEnd: number
}>()
</script>

<template>
  <div class="p-4 card">
    <RsiDetailChart
      :data="chartData"
      :title="title"
      :data-zoom-start="dataZoomStart"
      :data-zoom-end="dataZoomEnd"
    />
  </div>
</template>
