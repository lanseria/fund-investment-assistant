<script setup lang="ts">
import type { FundFees } from '~/types/holding'

defineProps<{
  fees: FundFees | null | undefined
}>()
</script>

<template>
  <div v-if="fees" class="text-xs text-gray-400 mt-2 flex flex-wrap gap-x-4 gap-y-1">
    <span v-if="fees.purchaseFee">申购费: {{ fees.purchaseFee }}</span>
    <span v-if="fees.managementFee">管理费: {{ fees.managementFee }}</span>
    <span v-if="fees.custodyFee">托管费: {{ fees.custodyFee }}</span>
    <span
      v-if="fees.redemptionFees && fees.redemptionFees.length"
      class="inline-flex gap-1 items-center"
      :title="fees.redemptionFees.map(r => `${r.holdingPeriod} ${r.rate}`).join(' / ')"
    >
      赎回费:
      <span
        v-for="(r, i) in fees.redemptionFees"
        :key="i"
        class="font-mono"
      >
        {{ r.holdingPeriod }}{{ r.rate }}<span v-if="i < fees.redemptionFees!.length - 1"> ·</span>
      </span>
    </span>
  </div>
</template>
