<!-- eslint-disable no-alert -->
<script setup lang="ts">
import type { FundFees } from '~/types/holding'
import BigNumber from 'bignumber.js'
import { matchRateForHoldingDays } from '~~/shared/redemptionFee'
import { useDayjs } from '#imports'

const props = defineProps<{
  fundCode: string
  fundName: string
  type: 'buy' | 'sell'
  // 卖出时需要知道当前持有份额
  currentShares?: number
  // 卖出时需要知道当前预估市值(仅做参考)
  currentMarketValue?: number
  // 接收交易记录用于计算 FIFO
  recentTransactions?: any[]
  // 基金费率信息(含赎回费阶梯),用于按真实阶梯估算赎回费
  fees?: FundFees | null
  loading?: boolean
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

const rateTiers = computed(() => props.fees?.redemptionFees ?? null)

// 赎回费估算的单一费率档明细
interface FeeTierBreakdown {
  rate: number // 费率数值(如 1.5)
  shares: number // 该档份额
  fee: number // 该档预估费用
}

/**
 * 按真实赎回费阶梯,基于 FIFO 估算本次卖出各档份额与费用。
 * 注意:recentTransactions 仅有最近 7 笔,此结果为「估算」,实际以确认时后端计算为准。
 */
const feeAnalysis = computed(() => {
  const empty = { tiers: [] as FeeTierBreakdown[], totalFee: 0, totalFeeedShares: 0, safeShares: 0 }
  if (props.type !== 'sell' || !formData.date)
    return empty

  const sellDate = dayjs(formData.date)
  const tiers = rateTiers.value

  // 估算净值:用市值/份额,无则按 1.0
  const estimatedNav = props.currentMarketValue && props.currentShares
    ? props.currentMarketValue / props.currentShares
    : 1.0

  // 重建 FIFO 买入批次队列(仅基于可见的近期交易,按时间正序)
  const buyLots = (props.recentTransactions || [])
    .filter(t => (t.type === 'buy' || t.type === 'convert_in') && Number(t.shares) > 0)
    .map(t => ({ date: t.date, shares: Number(t.shares) }))
    .sort((a, b) => dayjs(a.date).valueOf() - dayjs(b.date).valueOf())

  // 若无可见买入记录但有持仓,无法估算,直接返回空
  if (buyLots.length === 0)
    return empty

  let sharesToSell = new BigNumber(formData.shares || 0)
  const tierMap = new Map<number, { shares: BigNumber, fee: BigNumber }>()
  let safeShares = new BigNumber(0)

  for (const lot of buyLots) {
    if (sharesToSell.lte(0))
      break

    const take = BigNumber.min(lot.shares, sharesToSell)
    const diffDays = sellDate.diff(dayjs(lot.date), 'day')

    if (tiers && tiers.length > 0) {
      // 有阶梯:按持有天数匹配档位
      const matchedRate = matchRateForHoldingDays(tiers, diffDays)
      const rate = matchedRate !== null ? matchedRate : 0 // 未命中视为免赎回费
      if (rate > 0) {
        const item = tierMap.get(rate) || { shares: new BigNumber(0), fee: new BigNumber(0) }
        item.shares = item.shares.plus(take)
        item.fee = item.fee.plus(take.multipliedBy(estimatedNav).multipliedBy(rate / 100))
        tierMap.set(rate, item)
      }
      else {
        safeShares = safeShares.plus(take)
      }
    }
    else {
      // 无阶梯数据:回退硬编码(<7天 1.5%)
      if (diffDays < 7) {
        const rate = 1.5
        const item = tierMap.get(rate) || { shares: new BigNumber(0), fee: new BigNumber(0) }
        item.shares = item.shares.plus(take)
        item.fee = item.fee.plus(take.multipliedBy(estimatedNav).multipliedBy(0.015))
        tierMap.set(rate, item)
      }
      else {
        safeShares = safeShares.plus(take)
      }
    }

    sharesToSell = sharesToSell.minus(take)
  }

  // 聚合各档(按费率降序排列)
  const tierBreakdown: FeeTierBreakdown[] = [...tierMap.entries()]
    .map(([rate, v]) => ({ rate, shares: v.shares.toNumber(), fee: v.fee.toNumber() }))
    .sort((a, b) => b.rate - a.rate)

  const totalFee = tierBreakdown.reduce((sum, t) => sum + t.fee, 0)
  const totalFeeedShares = tierBreakdown.reduce((sum, t) => sum + t.shares, 0)

  return {
    tiers: tierBreakdown,
    totalFee,
    totalFeeedShares,
    safeShares: safeShares.toNumber(),
  }
})

// 是否存在需收费份额
const hasFee = computed(() => feeAnalysis.value.totalFeeedShares > 0.0001)

// 快捷比例按钮 (仅卖出)
const sellRatios = [
  { label: '1/4', value: 0.25 },
  { label: '1/2', value: 0.5 },
  { label: '3/4', value: 0.75 },
  { label: '全部', value: 1 },
]

// 支持传入具体数值或比例
function setSellShares(ratio: number | 'safe') {
  if (!props.currentShares)
    return

  let val = 0
  if (ratio === 'safe') {
    val = feeAnalysis.value.safeShares
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
    // 赎回费二次确认(有需收费份额时)
    if (hasFee.value) {
      const feeStr = feeAnalysis.value.totalFee.toFixed(2)
      const detailStr = feeAnalysis.value.tiers
        .map(t => `${t.shares.toFixed(2)}份×${t.rate}%`)
        .join('、')
      if (!confirm(`⚠️ 赎回费提示：本次卖出中约 ${detailStr} 将产生赎回费。\n\n预计赎回费合计约 ¥${feeStr}。\n\n(估算,实际以确认时计算为准)\n\n确定要继续吗？`))
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

      <!-- 赎回费分档提示 (基于近期交易 FIFO 估算) -->
      <div
        v-if="type === 'sell' && hasFee"
        class="text-xs text-amber-800 p-3 border border-amber-200 rounded bg-amber-50 dark:text-amber-300 dark:border-amber-800 dark:bg-amber-900/20"
      >
        <div class="font-bold flex gap-2 items-center">
          <div i-carbon-currency />
          赎回费估算 (FIFO · 近期交易)
        </div>
        <!-- 各费率档明细 -->
        <div class="mt-2 space-y-1">
          <div
            v-for="(t, i) in feeAnalysis.tiers"
            :key="i"
            class="flex items-center justify-between"
            :class="t.rate >= 1 ? 'text-red-700 dark:text-red-400' : ''"
          >
            <span>
              <b>{{ t.shares.toFixed(2) }}</b> 份 ×
              <span class="font-bold font-mono">{{ t.rate }}%</span>
            </span>
            <span class="font-mono">-¥{{ t.fee.toFixed(2) }}</span>
          </div>
        </div>
        <!-- 合计 -->
        <div class="font-bold mt-2 pt-2 border-t border-amber-200 flex items-center justify-between dark:border-amber-800">
          <span>预估赎回费合计</span>
          <span class="font-mono">-¥{{ feeAnalysis.totalFee.toFixed(2) }}</span>
        </div>
        <p class="text-[10px] text-amber-600 mt-1 opacity-80 dark:text-amber-500">
          * 基于近期交易估算,实际以确认时后端计算为准。
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
          <!-- 免手续费按钮 -->
          <button
            v-if="feeAnalysis.safeShares > 0 && feeAnalysis.safeShares < (currentShares || 0)"
            type="button"
            class="text-xs text-green-700 px-2 py-1 border border-green-200 rounded bg-green-50 transition-colors dark:text-green-300 dark:border-green-800 dark:bg-green-900/30 hover:bg-green-100 dark:hover:bg-green-900/50"
            title="卖出持有已免赎回费的份额"
            @click="setSellShares('safe')"
          >
            免赎回费 ({{ feeAnalysis.safeShares.toFixed(2) }})
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
        :disabled="loading"
        @click="emit('cancel')"
      >
        取消
      </button>
      <button
        type="submit"
        class="btn flex items-center justify-center"
        :class="type === 'buy' ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600'"
        :disabled="!canSubmit || loading"
      >
        <span v-if="loading" class="flex gap-2 items-center">
          <div class="i-carbon-circle-dash animate-spin" />
          提交中...
        </span>
        <span v-else>确认{{ type === 'buy' ? '买入' : '卖出' }}</span>
      </button>
    </div>
  </form>
</template>
