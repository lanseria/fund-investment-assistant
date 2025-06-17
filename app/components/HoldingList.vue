<script setup lang="ts">
import type { Holding } from '~/types/holding'

defineProps<{
  holdings: Holding[]
}>()

const emit = defineEmits(['edit', 'delete'])

function getChangeClass(holding: Holding) {
  if (!holding.today_estimate_nav)
    return 'text-gray'
  const change = holding.today_estimate_nav - holding.yesterday_nav
  if (change > 0)
    return 'text-red-500'
  if (change < 0)
    return 'text-green-500'
  return 'text-gray'
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY' }).format(value)
}
</script>

<template>
  <div class="overflow-x-auto">
    <table class="w-full text-left table-auto">
      <thead class="border-b dark:border-gray-700">
        <tr>
          <th class="p-4">
            基金名称
          </th>
          <th class="p-4 text-right">
            持有金额
          </th>
          <th class="p-4 text-right">
            昨日净值
          </th>
          <th class="p-4 text-right">
            今日估值
          </th>
          <th class="p-4 text-right">
            操作
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="h in holdings" :key="h.code" class="border-b dark:border-gray-700">
          <td class="p-4 font-bold">
            <NuxtLink :to="`/fund/${h.code}`" class="hover:underline">
              {{ h.name }} <span class="text-sm font-normal text-gray-500">{{ h.code }}</span>
            </NuxtLink>
          </td>
          <td class="p-4 text-right">
            {{ formatCurrency(h.holding_amount) }}
          </td>
          <td class="p-4 text-right">
            {{ h.yesterday_nav.toFixed(4) }}
          </td>
          <td class="p-4 text-right font-mono" :class="getChangeClass(h)">
            {{ h.today_estimate_nav?.toFixed(4) || '-' }}
          </td>
          <td class="p-4 text-right space-x-2">
            <button class="icon-btn" title="修改" @click="emit('edit', h)">
              <div i-carbon-edit />
            </button>
            <button class="icon-btn hover:text-red-500" title="删除" @click="emit('delete', h)">
              <div i-carbon-trash-can />
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>