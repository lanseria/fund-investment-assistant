<script setup lang="ts">
import type { HoldingHistoryPoint } from '~/types/holding'

defineProps<{
  history: HoldingHistoryPoint[]
  signals: any[]
  title: string
  dataZoomStart: number
  dataZoomEnd: number
}>()

const emit = defineEmits(['signal-click'])

function handleSignalClick(signal: any) {
  emit('signal-click', signal)
}
</script>

<template>
  <div class="p-4 card">
    <FundChart
      :history="history"
      :signals="signals"
      :title="title"
      :data-zoom-start="dataZoomStart"
      :data-zoom-end="dataZoomEnd"
      @signal-click="handleSignalClick"
    />
  </div>
</template>
