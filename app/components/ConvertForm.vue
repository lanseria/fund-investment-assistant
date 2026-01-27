<!-- eslint-disable no-alert -->
<!-- app/components/ConvertForm.vue -->
<script setup lang="ts">
import type { Holding } from '~/types/holding'
import { useDayjs } from '#imports'
import BigNumber from 'bignumber.js'

const props = defineProps<{
  fromCode: string
  fromName: string
  currentShares: number
  // 所有可选的目标基金（必须从已添加的基金中选）
  availableFunds: Holding[]
  // [新增] 交易记录
  recentTransactions?: any[]
}>()

const emit = defineEmits(['submit', 'cancel'])

const dayjs = useDayjs()
// 默认 T
const now = dayjs()
const defaultDate = now.hour() >= 15 ? now.format('YYYY-MM-DD') : now.format('YYYY-MM-DD')

const formData = reactive({
  date: defaultDate,
  shares: null as number | null,
  toCode: null as string | null,
})

// 过滤掉源基金自己
const targetOptions = computed(() => {
  return props.availableFunds
    .filter(f => f.code !== props.fromCode)
    .map(f => ({
      value: f.code,
      label: `${f.name} (${f.code})`,
    }))
})

// [新增] 安全份额计算
const safeShares = computed(() => {
  if (!props.currentShares)
    return 0
  if (!formData.date)
    return 0

  const sellDate = dayjs(formData.date)
  const recentBuysWithin7Days = (props.recentTransactions || [])
    .filter((t) => {
      const isBuy = t.type === 'buy' || t.type === 'convert_in'
      if (!isBuy)
        return false
      const diff = sellDate.diff(dayjs(t.date), 'day')
      return diff < 7
    })
    .reduce((sum, t) => sum + (Number(t.shares) || 0), 0)

  return Math.max(0, props.currentShares - recentBuysWithin7Days)
})

// [修改] 计算 FIFO 惩罚
const penaltyAnalysis = computed(() => {
  if (!formData.date || !formData.shares)
    return { isShortTerm: false, penaltyShares: 0 }

  const sharesSubjectToPenalty = Math.max(0, formData.shares - safeShares.value)

  return {
    isShortTerm: sharesSubjectToPenalty > 0.0001,
    penaltyShares: sharesSubjectToPenalty,
  }
})

// 快捷比例
const ratios = [
  { label: '1/4', value: 0.25 },
  { label: '1/2', value: 0.5 },
  { label: '全部', value: 1 },
]

// [修改] 支持 safe 模式
function setShares(ratio: number | 'safe') {
  let val = 0
  if (ratio === 'safe') {
    val = safeShares.value
  }
  else {
    val = new BigNumber(props.currentShares).times(ratio).toNumber()
  }
  // 逻辑：(val) -> 保留4位小数 -> 向下取整
  formData.shares = +(new BigNumber(val).toFixed(4, BigNumber.ROUND_DOWN))
}

const canSubmit = computed(() => {
  return (
    formData.date
    && formData.toCode
    && (formData.shares ?? 0) > 0
    && (formData.shares ?? 0) <= props.currentShares
  )
})

function handleSubmit() {
  if (canSubmit.value) {
    // [修改] 7天惩罚二次确认
    if (penaltyAnalysis.value.isShortTerm) {
      if (!confirm(`⚠️ 警告：检测到转出份额中有 ${penaltyAnalysis.value.penaltyShares.toFixed(2)} 份持有不足 7 天！\n\n转出将扣除 1.5% 的惩罚性手续费。\n\n确定要继续转换吗？`))
        return
    }

    emit('submit', {
      fromCode: props.fromCode,
      toCode: formData.toCode,
      shares: formData.shares,
      date: formData.date,
    })
  }
}
</script>

<template>
  <form @submit.prevent="handleSubmit">
    <div class="space-y-4">
      <!-- 头部信息 -->
      <div class="text-sm text-blue-800 p-3 rounded bg-blue-50 dark:text-blue-300 dark:bg-blue-900/20">
        <div class="mb-1 flex gap-2 items-center">
          <div i-carbon-shuffle class="text-lg" />
          <span class="font-bold">基金转换 (Switching)</span>
        </div>
        <p class="text-xs opacity-80">
          卖出 A 基金，用所得资金自动买入 B 基金。
        </p>
      </div>

      <!-- [修改] 7天惩罚提示 -->
      <div
        v-if="penaltyAnalysis.isShortTerm"
        class="text-xs text-red-700 p-3 border border-red-200 rounded bg-red-50 animate-pulse dark:text-red-300 dark:border-red-800 dark:bg-red-900/20"
      >
        <div class="font-bold flex gap-2 items-center">
          <div i-carbon-warning-filled />
          持有期警告 (FIFO)
        </div>
        <p class="mt-1">
          有 <b>{{ penaltyAnalysis.penaltyShares.toFixed(2) }}</b> 份不足7天。
          转出将扣除 <span class="font-bold">1.5%</span> 费用，导致实际转入金额减少。
        </p>
      </div>

      <!-- 源基金 -->
      <div>
        <label class="text-sm font-medium mb-1 block">转出基金 (Source)</label>
        <div class="input-base bg-gray-100 opacity-70 flex cursor-not-allowed justify-between dark:bg-gray-700">
          <span>{{ fromName }} ({{ fromCode }})</span>
          <span class="text-xs text-gray-500 flex items-center">
            可用: {{ currentShares }} 份
          </span>
        </div>
      </div>

      <!-- 目标基金 -->
      <div>
        <label class="text-sm font-medium mb-1 block">转入基金 (Target)</label>
        <CustomSelect
          v-model="formData.toCode"
          :options="targetOptions"
          placeholder="请选择目标基金"
        />
        <p class="text-xs text-gray-500 mt-1">
          仅限从已添加的观察列表/持仓中选择。
        </p>
      </div>

      <!-- 日期 -->
      <div>
        <label class="text-sm font-medium mb-1 block">转换日期 (申报日)</label>
        <input
          v-model="formData.date"
          type="date"
          class="input-base"
          required
        >
      </div>

      <!-- 份额 -->
      <div>
        <label class="text-sm font-medium mb-1 block">转换份额</label>
        <input
          v-model.number="formData.shares"
          type="number"
          step="0.0001"
          min="0.0001"
          :max="currentShares"
          class="input-base"
          placeholder="请输入转出份额"
        >
        <div class="mt-2 flex flex-wrap gap-2">
          <!-- [新增] 免手续费按钮 -->
          <button
            v-if="safeShares > 0 && safeShares < currentShares"
            type="button"
            class="text-xs text-green-700 px-2 py-1 border border-green-200 rounded bg-green-50 transition-colors dark:text-green-300 dark:border-green-800 dark:bg-green-900/30 hover:bg-green-100 dark:hover:bg-green-900/50"
            title="转出持有超过7天的份额，不产生惩罚性手续费"
            @click="setShares('safe')"
          >
            免赎回费 ({{ safeShares.toFixed(2) }})
          </button>

          <button
            v-for="r in ratios"
            :key="r.value"
            type="button"
            class="text-xs px-2 py-1 rounded bg-gray-100 transition-colors dark:bg-gray-600 hover:bg-gray-200 dark:hover:bg-gray-500"
            @click="setShares(r.value)"
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
        class="btn text-white bg-blue-600 hover:bg-blue-700"
        :disabled="!canSubmit"
      >
        确认转换
      </button>
    </div>
  </form>
</template>
