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
  // [新增] 接收交易记录用于计算 FIFO
  recentTransactions?: any[]
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

// [新增] 计算安全份额 (持有 > 7天，免赎回费)
const safeShares = computed(() => {
  if (!props.currentShares)
    return 0
  if (!formData.date)
    return 0 // 如果日期无效，暂时无法计算

  const sellDate = dayjs(formData.date)

  // 1. 找出最近 7 天内的所有买入/转入份额总和
  const recentBuysWithin7Days = (props.recentTransactions || [])
    .filter((t) => {
      const isBuy = t.type === 'buy' || t.type === 'convert_in'
      if (!isBuy)
        return false
      const diff = sellDate.diff(dayjs(t.date), 'day')
      return diff < 7
    })
    .reduce((sum, t) => sum + (Number(t.shares) || 0), 0)

  // 2. 安全份额 = 当前总持仓 - 最近7天买入的
  return Math.max(0, (props.currentShares || 0) - recentBuysWithin7Days)
})

// [修改] 计算 FIFO 下的短期持有惩罚
const penaltyAnalysis = computed(() => {
  if (props.type !== 'sell' || !formData.date || !formData.shares)
    return { isShortTerm: false, fee: 0, penaltyShares: 0 }

  // 3. 计算本次卖出中有多少份额落在“惩罚区”
  // 只有当 卖出份额 > 安全份额 时，溢出部分才受罚
  const sharesSubjectToPenalty = Math.max(0, formData.shares - safeShares.value)

  if (sharesSubjectToPenalty <= 0.0001) {
    return { isShortTerm: false, fee: 0, penaltyShares: 0 }
  }

  // 4. 估算费用
  const estimatedNav = props.currentMarketValue && props.currentShares
    ? props.currentMarketValue / props.currentShares
    : 1.0

  const estimatedPenaltyAmount = sharesSubjectToPenalty * estimatedNav
  const fee = estimatedPenaltyAmount * 0.015

  return {
    isShortTerm: true,
    fee,
    penaltyShares: sharesSubjectToPenalty,
  }
})

// 快捷比例按钮 (仅卖出)
const sellRatios = [
  { label: '1/4', value: 0.25 },
  { label: '1/2', value: 0.5 },
  { label: '3/4', value: 0.75 },
  { label: '全部', value: 1 },
]

// [修改] 支持传入具体数值或比例
function setSellShares(ratio: number | 'safe') {
  if (!props.currentShares)
    return

  let val = 0
  if (ratio === 'safe') {
    val = safeShares.value
  }
  else {
    val = new BigNumber(props.currentShares).times(ratio).toNumber()
  }

  // 保留4位小数 -> 向下取整
  formData.shares = +(new BigNumber(val).toFixed(4, BigNumber.ROUND_DOWN))
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
    // [修改] 7天惩罚二次确认
    if (penaltyAnalysis.value.isShortTerm) {
      const feeStr = penaltyAnalysis.value.fee.toFixed(2)
      const sharesStr = penaltyAnalysis.value.penaltyShares.toFixed(2)
      if (!confirm(`⚠️ 警告：根据 FIFO 原则，您本次卖出的份额中有 ${sharesStr} 份持有不足 7 天！\n\n预计将产生约 ¥${feeStr} (1.5%) 的惩罚性手续费。\n\n确定要继续吗？`))
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

      <!-- [修改] 7天惩罚提示 -->
      <div
        v-if="type === 'sell' && penaltyAnalysis.isShortTerm"
        class="text-xs text-red-700 p-3 border border-red-200 rounded bg-red-50 animate-pulse dark:text-red-300 dark:border-red-800 dark:bg-red-900/20"
      >
        <div class="font-bold flex gap-2 items-center">
          <div i-carbon-warning-filled />
          持有期警告 (FIFO)
        </div>
        <p class="mt-1">
          检测到有 <b>{{ penaltyAnalysis.penaltyShares.toFixed(2) }}</b> 份持仓不足7天。
          <br>该部分将收取 <span class="font-bold">1.5%</span> 惩罚性费率。
        </p>
        <p v-if="penaltyAnalysis.fee > 0" class="font-bold mt-1">
          预估惩罚手续费: -¥{{ penaltyAnalysis.fee.toFixed(2) }}
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
        <div class="mt-2 flex flex-wrap gap-2">
          <!-- [新增] 免手续费按钮 -->
          <button
            v-if="safeShares > 0 && safeShares < (currentShares || 0)"
            type="button"
            class="text-xs text-green-700 px-2 py-1 border border-green-200 rounded bg-green-50 transition-colors dark:text-green-300 dark:border-green-800 dark:bg-green-900/30 hover:bg-green-100 dark:hover:bg-green-900/50"
            title="卖出持有超过7天的份额，不产生惩罚性手续费"
            @click="setSellShares('safe')"
          >
            免赎回费 ({{ safeShares.toFixed(2) }})
          </button>

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
