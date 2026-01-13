<script setup lang="ts">
import { useDayjs } from '#imports'
import BigNumber from 'bignumber.js'

const props = defineProps<{
  fundCode: string
  fundName: string
  type: 'buy' | 'sell'
  // 卖出时需要知道当前持有份额
  currentShares?: number
  // 卖出时需要知道当前预估市值(仅做参考)
  currentMarketValue?: number
}>()

const emit = defineEmits(['submit', 'cancel'])

const dayjs = useDayjs()
const now = dayjs()
const defaultDate = now.hour() >= 15 ? now.format('YYYY-MM-DD') : now.format('YYYY-MM-DD')

const formData = reactive({
  date: defaultDate,
  amount: null as number | null, // 买入金额
  shares: null as number | null, // 卖出份额
})

// 快捷比例按钮 (仅卖出)
const sellRatios = [
  { label: '1/4', value: 0.25 },
  { label: '1/2', value: 0.5 },
  { label: '3/4', value: 0.75 },
  { label: '全部', value: 1 },
]

function setSellShares(ratio: number) {
  if (props.currentShares) {
    // 逻辑：(currentShares * ratio) -> 保留4位小数 -> 向下取整
    formData.shares = +(new BigNumber(props.currentShares)
      .times(ratio)
      .toFixed(4, BigNumber.ROUND_DOWN))
  }
}

const canSubmit = computed(() => {
  if (!formData.date)
    return false
  if (props.type === 'buy') {
    return (formData.amount ?? 0) > 0
  }
  else {
    return (formData.shares ?? 0) > 0 && (formData.shares ?? 0) <= (props.currentShares ?? 0)
  }
})

function handleSubmit() {
  if (canSubmit.value) {
    emit('submit', {
      fundCode: props.fundCode,
      type: props.type,
      date: formData.date,
      amount: formData.amount,
      shares: formData.shares,
    })
  }
}
</script>

<template>
  <form @submit.prevent="handleSubmit">
    <div class="space-y-4">
      <div class="text-sm p-3 rounded bg-gray-50 dark:bg-gray-700">
        <p><span class="text-gray-500 mr-2">基金:</span>{{ fundName }} ({{ fundCode }})</p>
        <p class="text-lg font-bold mt-1" :class="type === 'buy' ? 'text-red-500' : 'text-green-500'">
          {{ type === 'buy' ? '买入' : '卖出' }}
        </p>
        <p v-if="type === 'sell'" class="text-xs text-gray-500 mt-1">
          可用份额: {{ currentShares }} 份
          <span v-if="currentMarketValue">(≈ ¥{{ currentMarketValue.toFixed(2) }})</span>
        </p>
      </div>

      <!-- 日期 -->
      <div>
        <label class="text-sm font-medium mb-1 block">交易日期 (申报日)</label>
        <input
          v-model="formData.date"
          type="date"
          class="input-base"
          required
        >
        <p class="text-xs text-gray-500 mt-1">
          15:00 前为T日，15:00 后请选择T+1日。
        </p>
      </div>

      <!-- 买入金额 -->
      <div v-if="type === 'buy'">
        <label class="text-sm font-medium mb-1 block">买入金额 (元)</label>
        <div class="relative">
          <span class="text-gray-500 left-3 top-2 absolute">¥</span>
          <input
            v-model.number="formData.amount"
            type="number"
            step="0.0001"
            min="0.0001"
            class="input-base pl-7"
            placeholder="请输入买入金额"
            autofocus
          >
        </div>
      </div>

      <!-- 卖出份额 -->
      <div v-if="type === 'sell'">
        <label class="text-sm font-medium mb-1 block">卖出份额 (份)</label>
        <input
          v-model.number="formData.shares"
          type="number"
          step="0.0001"
          min="0.0001"
          :max="currentShares"
          class="input-base"
          placeholder="请输入卖出份额"
          autofocus
        >
        <!-- 快捷比例 -->
        <div class="mt-2 flex gap-2">
          <button
            v-for="r in sellRatios"
            :key="r.value"
            type="button"
            class="text-xs px-2 py-1 rounded bg-gray-100 transition-colors dark:bg-gray-600 hover:bg-gray-200 dark:hover:bg-gray-500"
            @click="setSellShares(r.value)"
          >
            {{ r.label }}
          </button>
        </div>
      </div>
    </div>

    <div class="mt-6 flex justify-end space-x-3">
      <button
        type="button"
        class="text-sm text-gray-700 font-medium px-4 py-2 rounded-md bg-gray-100 dark:text-gray-200 dark:bg-gray-600 hover:bg-gray-200 dark:hover:bg-gray-500"
        @click="emit('cancel')"
      >
        取消
      </button>
      <button
        type="submit"
        class="btn"
        :class="type === 'buy' ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600'"
        :disabled="!canSubmit"
      >
        确认{{ type === 'buy' ? '买入' : '卖出' }}
      </button>
    </div>
  </form>
</template>
