<!-- eslint-disable no-alert -->
<!-- app/components/ConvertForm.vue -->
<script setup lang="ts">
import type { FundFees, Holding } from '~/types/holding'
import BigNumber from 'bignumber.js'
import { matchRateForHoldingDays } from '~~/shared/redemptionFee'
import { useDayjs } from '#imports'

const props = defineProps<{
  fromCode: string
  fromName: string
  currentShares: number
  // 所有可选的目标基金（必须从已添加的基金中选）
  availableFunds: Holding[]
  // 交易记录
  recentTransactions?: any[]
  // 基金费率信息(含赎回费阶梯),用于按真实阶梯估算赎回费（与 TradeForm 保持一致）
  fees?: FundFees | null
  loading?: boolean
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

// 赎回费阶梯（来自真实费率数据，与 TradeForm 一致）
const rateTiers = computed(() => props.fees?.redemptionFees ?? null)

// 过滤掉源基金自己
const targetOptions = computed(() => {
  return props.availableFunds
    .filter(f => f.code !== props.fromCode)
    .map(f => ({
      value: f.code,
      label: `${f.name} (${f.code})`,
    }))
})

/**
 * 基于 FIFO 计算免赎回费的安全份额。
 * 与 TradeForm 保持一致：优先用真实费率阶梯判断，无阶梯时回退硬编码 7 天阈值。
 */
const safeShares = computed(() => {
  if (!props.currentShares || !formData.date)
    return 0

  const sellDate = dayjs(formData.date)
  const tiers = rateTiers.value

  // 重建 FIFO 买入批次队列(仅基于可见的近期交易,按时间正序)
  const buyLots = (props.recentTransactions || [])
    .filter(t => (t.type === 'buy' || t.type === 'convert_in') && Number(t.shares) > 0)
    .map(t => ({ date: t.date, shares: Number(t.shares) }))
    .sort((a, b) => dayjs(a.date).valueOf() - dayjs(b.date).valueOf())

  let safe = new BigNumber(0)
  for (const lot of buyLots) {
    const diffDays = sellDate.diff(dayjs(lot.date), 'day')
    if (tiers && tiers.length > 0) {
      // 有阶梯:按持有天数匹配档位，未命中档位或费率为 0 视为免赎回费
      const matchedRate = matchRateForHoldingDays(tiers, diffDays)
      if (matchedRate === null || matchedRate === 0)
        safe = safe.plus(lot.shares)
    }
    else {
      // 无阶梯数据:回退硬编码(<7天视为需收费)
      if (diffDays >= 7)
        safe = safe.plus(lot.shares)
    }
  }

  return BigNumber.min(safe.toNumber(), props.currentShares).toNumber()
})

// 赎回费档位明细（用于展示，与 TradeForm 一致）
interface FeeTierBreakdown {
  rate: number
  shares: number
}
const penaltyAnalysis = computed<{ isShortTerm: boolean, penaltyShares: number, tiers: FeeTierBreakdown[] }>(() => {
  if (!formData.date || !formData.shares)
    return { isShortTerm: false, penaltyShares: 0, tiers: [] }

  const sellDate = dayjs(formData.date)
  const tiers = rateTiers.value
  const sharesToSell = new BigNumber(formData.shares)

  // 用 FIFO 计算需收费的份额
  const buyLots = (props.recentTransactions || [])
    .filter(t => (t.type === 'buy' || t.type === 'convert_in') && Number(t.shares) > 0)
    .map(t => ({ date: t.date, shares: Number(t.shares) }))
    .sort((a, b) => dayjs(a.date).valueOf() - dayjs(b.date).valueOf())

  const tierMap = new Map<number, BigNumber>()
  let remaining = sharesToSell

  for (const lot of buyLots) {
    if (remaining.lte(0))
      break
    const take = BigNumber.min(lot.shares, remaining)
    const diffDays = sellDate.diff(dayjs(lot.date), 'day')

    if (tiers && tiers.length > 0) {
      const matchedRate = matchRateForHoldingDays(tiers, diffDays)
      const rate = matchedRate !== null ? matchedRate : 0
      if (rate > 0) {
        const prev = tierMap.get(rate) || new BigNumber(0)
        tierMap.set(rate, prev.plus(take))
      }
    }
    else {
      // 无阶梯回退
      if (diffDays < 7) {
        const prev = tierMap.get(1.5) || new BigNumber(0)
        tierMap.set(1.5, prev.plus(take))
      }
    }
    remaining = remaining.minus(take)
  }

  const tierBreakdown = [...tierMap.entries()]
    .map(([rate, shares]) => ({ rate, shares: shares.toNumber() }))
    .sort((a, b) => b.rate - a.rate)
  const totalPenalty = tierBreakdown.reduce((sum, t) => sum + t.shares, 0)

  return {
    isShortTerm: totalPenalty > 0.0001,
    penaltyShares: totalPenalty,
    tiers: tierBreakdown,
  }
})

// 快捷比例
const ratios = [
  { label: '1/4', value: 0.25 },
  { label: '1/2', value: 0.5 },
  { label: '全部', value: 1 },
]

// 支持 safe 模式
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
    // 赎回费二次确认（展示真实费率档位）
    if (penaltyAnalysis.value.isShortTerm) {
      const tierText = penaltyAnalysis.value.tiers
        .map(t => `${t.rate}% 费率档: ${t.shares.toFixed(2)} 份`)
        .join('\n')
      if (!confirm(`⚠️ 警告：检测到转出份额中有 ${penaltyAnalysis.value.penaltyShares.toFixed(2)} 份将产生赎回费！\n\n${tierText}\n\n确定要继续转换吗？`))
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

      <!-- 赎回费提示（基于真实费率阶梯） -->
      <div
        v-if="penaltyAnalysis.isShortTerm"
        class="text-xs text-red-700 p-3 border border-red-200 rounded bg-red-50 animate-pulse dark:text-red-300 dark:border-red-800 dark:bg-red-900/20"
      >
        <div class="font-bold flex gap-2 items-center">
          <div i-carbon-warning-filled />
          持有期警告 (FIFO)
        </div>
        <p class="mt-1">
          有 <b>{{ penaltyAnalysis.penaltyShares.toFixed(2) }}</b> 份将产生赎回费：
        </p>
        <ul class="ml-4 mt-1 list-disc">
          <li v-for="(t, i) in penaltyAnalysis.tiers" :key="i">
            {{ t.rate }}% 费率档: {{ t.shares.toFixed(2) }} 份
          </li>
        </ul>
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
          <!-- 免手续费按钮 -->
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
        :disabled="loading"
        @click="emit('cancel')"
      >
        取消
      </button>
      <button
        type="submit"
        class="btn text-white bg-blue-600 flex items-center justify-center hover:bg-blue-700"
        :disabled="!canSubmit || loading"
      >
        <span v-if="loading" class="flex gap-2 items-center">
          <div class="i-carbon-circle-dash animate-spin" />
          转换中...
        </span>
        <span v-else>确认转换</span>
      </button>
    </div>
  </form>
</template>
