import type { Ref } from 'vue'
import type { Holding } from '~/types/holding'
import { differenceInDays, parseISO } from 'date-fns'
import { matchRateForHoldingDays, parseRateValue } from '~~/shared/redemptionFee'

/**
 * 持仓赎回费率引擎：
 * 费率档位标签、按持有期天数阈值配色、最近一次买入的持有状态与 badge 配色。
 */
export function useRedemptionFees(holding: Ref<Holding>) {
  // 赎回费率提示(仅展示 redemptionFees),按持有期阈值着色:7天绿、30天黄、其余灰
  const redemptionFeeTags = computed(() => {
    const fees = holding.value.fees?.redemptionFees
    if (!fees || fees.length === 0)
      return null
    return fees.map((f) => {
      // 从 holdingPeriod 提取天数阈值(如"大于等于7天"→7、"小于30天"→30),用于配色
      const dayMatch = f.holdingPeriod.match(/(\d+)\s*天/)
      const days = dayMatch ? Number(dayMatch[1]) : null
      return { holdingPeriod: f.holdingPeriod, rate: f.rate, days, colorClass: tierColorClass(days, f.rate) }
    })
  })

  // 默认只展示最后一档(通常为 0.00% 免赎回费档),点击弹出完整费率详情对话框
  const lastRedemptionTag = computed(() => {
    const last = redemptionFeeTags.value?.at(-1)
    return last ? { ...last, text: `${last.holdingPeriod}${last.rate}` } : null
  })
  // 费率详情对话框显示状态
  const feesDialogOpen = ref(false)

  // 按持有期天数阈值着色:7天绿、30天黄、其余灰
  function tierColorClass(days: number | null, rate: string) {
    const rateVal = parseRateValue(rate)
    // 0.00% 档按天数阈值配色:7天绿、30天黄,其余默认灰
    if (rateVal === 0) {
      if (days === 7)
        return 'border-green-200 text-green-600 bg-green-50 dark:border-green-800/50 dark:text-green-400 dark:bg-green-900/20'
      if (days === 30)
        return 'border-amber-200 text-amber-600 bg-amber-50 dark:border-amber-800/50 dark:text-amber-400 dark:bg-amber-900/20'
    }
    return 'border-gray-200 text-gray-400 bg-gray-50 dark:border-gray-700 dark:text-gray-500 dark:bg-gray-800'
  }

  // 根据当前持有天数匹配赎回费率档位,返回该档 { rate(字符串), rateValue(数值), holdingPeriod }
  function matchRedemptionTier(diffDays: number): { rate: string, rateValue: number, holdingPeriod: string } | null {
    const tiers = holding.value.fees?.redemptionFees
    if (!tiers || tiers.length === 0)
      return null

    for (const t of tiers) {
      const rateValue = matchRateForHoldingDays([t], diffDays)
      if (rateValue !== null)
        return { rate: t.rate, rateValue, holdingPeriod: t.holdingPeriod }
    }
    return null
  }

  // 计算最近一次买入的持有状态
  const lastBuyStatus = computed(() => {
    const txs = holding.value.recentTransactions
    if (!txs || txs.length === 0)
      return { isSafe: true, label: '无近买', days: 7, rate: null, date: null, title: '无近期买入记录' }

    // 找到最近的一笔买入交易（包含普通买入和转换转入）
    const lastBuy = txs.find(t => t.type === 'buy' || t.type === 'convert_in')

    // 如果最近7笔没有买入，说明买入很久了，肯定是安全的
    if (!lastBuy)
      return { isSafe: true, label: '7天+', days: 8, rate: null, date: null, title: '近期无买入,持有期充足' }

    const buyDate = parseISO(lastBuy.date)
    // 计算持有天数 (今天 - 买入日期)
    // 注意：基金持有天数通常包含周末，从确认日开始算。
    // 这里做简单计算：当前日期 - 订单日期。如果刚好卡在临界点，建议用户去券商APP确认。
    const diffDays = differenceInDays(new Date(), buyDate)

    // 优先用真实赎回费率档位判定当前适用费率
    const matched = matchRedemptionTier(diffDays)
    if (matched) {
      // 0% 即视为安全(免赎回费)
      const isSafe = matched.rateValue === 0
      const label = `${diffDays}天`
      const title = isSafe
        ? `安全: 最近买入于 ${lastBuy.date},已持有 ${diffDays} 天,当前赎回费率 ${matched.rate} (免赎回费)`
        : `警告: 最近买入于 ${lastBuy.date},仅持有 ${diffDays} 天,当前赎回费率 ${matched.rate}!`
      return { isSafe, label, days: diffDays, rate: matched.rate, date: lastBuy.date, title }
    }

    // 无费率数据时回退到 7 天启发式
    const isSafe = diffDays >= 7
    const label = diffDays >= 7 ? '7天+' : `${diffDays}天`
    const title = isSafe
      ? `安全: 最近买入于 ${lastBuy.date},已持有 ${diffDays} 天。赎回费率较低。`
      : `警告: 最近买入于 ${lastBuy.date},仅持有 ${diffDays} 天!现在卖出可能面临 1.5% 惩罚性费率。`
    return { isSafe, label, days: diffDays, rate: null, date: lastBuy.date, title }
  })

  // 持有期提示标签的配色:按实际持有天数的固定阈值判断
  // < 7天(1.5%档)红、[7,30)天(0.5%档)黄、≥30天 灰
  const holdingBadgeClass = computed(() => {
    const { days, isSafe } = lastBuyStatus.value
    if (isSafe || days >= 30)
      return 'border-gray-200 text-gray-400 bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-500'
    if (days < 7)
      return 'border-red-200 text-red-600 bg-red-50 animate-pulse dark:border-red-800/50 dark:bg-red-900/20 dark:text-red-400'
    return 'border-amber-200 text-amber-600 bg-amber-50 animate-pulse dark:border-amber-800/50 dark:bg-amber-900/20 dark:text-amber-400'
  })
  const holdingBadgeIcon = computed(() =>
    lastBuyStatus.value.days >= 30 ? 'i-carbon-shield-check' : 'i-carbon-hourglass',
  )

  // 对话框内持有期提示配色(文字色加深,适合大区域显示)
  const dialogHoldingStatusClass = computed(() => {
    const { days, isSafe } = lastBuyStatus.value
    if (isSafe || days >= 30)
      return 'border-gray-200 text-gray-600 bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400'
    if (days < 7)
      return 'border-red-200 text-red-700 bg-red-50 dark:border-red-800/50 dark:bg-red-900/20 dark:text-red-400'
    return 'border-amber-200 text-amber-700 bg-amber-50 dark:border-amber-800/50 dark:bg-amber-900/20 dark:text-amber-400'
  })

  return {
    redemptionFeeTags,
    lastRedemptionTag,
    feesDialogOpen,
    lastBuyStatus,
    holdingBadgeClass,
    holdingBadgeIcon,
    dialogHoldingStatusClass,
  }
}
