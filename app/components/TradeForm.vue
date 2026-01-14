<!-- eslint-disable no-alert -->
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
  // [新增] 最近一次买入日期 (用于计算7天惩罚)
  lastBuyDate?: string | null
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

// [新增] 检查是否由短期持有 (少于7天)
const shortTermCheck = computed(() => {
  if (props.type !== 'sell' || !props.lastBuyDate || !formData.date)
    return { isShortTerm: false, days: 0 }

  const sellDate = dayjs(formData.date)
  const buyDate = dayjs(props.lastBuyDate)
  const diff = sellDate.diff(buyDate, 'day')

  return {
    isShortTerm: diff < 7,
    days: diff,
  }
})

// [新增] 预估惩罚性手续费
const estimatedFee = computed(() => {
  if (!shortTermCheck.value.isShortTerm || !formData.shares || !props.currentShares || !props.currentMarketValue)
    return 0

  // 估算单价
  const estimatedNav = props.currentMarketValue / props.currentShares
  // 估算总额 = 卖出份额 * 估算单价
  const estimatedAmount = formData.shares * estimatedNav
  // 1.5% 手续费
  return estimatedAmount * 0.015
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
    // [新增] 如果触发惩罚，再次确认
    if (shortTermCheck.value.isShortTerm) {
      if (!confirm(`⚠️ 警告：检测到您持有该基金不足 7 天！\n\n卖出将产生约 ${estimatedFee.value.toFixed(2)} 元 (1.5%) 的惩罚性手续费。\n\n确定要继续吗？`))
        return
    }

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

      <!-- [新增] 7天惩罚提示 -->
      <div
        v-if="type === 'sell' && shortTermCheck.isShortTerm"
        class="text-xs text-red-700 p-3 border border-red-200 rounded bg-red-50 animate-pulse dark:text-red-300 dark:border-red-800 dark:bg-red-900/20"
      >
        <div class="font-bold flex gap-2 items-center">
          <div i-carbon-warning-filled />
          持有期警告 ({{ shortTermCheck.days }}天)
        </div>
        <p class="mt-1">
          最近一次买入于 {{ lastBuyDate }}，不足7天。
          卖出将收取 <span class="font-bold">1.5%</span> 惩罚性费率。
        </p>
        <p v-if="estimatedFee > 0" class="font-bold mt-1">
          预估手续费: -¥{{ estimatedFee.toFixed(2) }}
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
