/* eslint-disable no-alert */
import type { Holding } from '~/types/holding'

/**
 * 基金详情页的 买入/卖出/转换 模态框编排：
 * 目标持仓、可用份额计算、提交与关闭。
 */
export function useTradeModals() {
  const holdingStore = useHoldingStore()

  const isTradeModalOpen = ref(false)
  const isConvertModalOpen = ref(false)
  const tradeTarget = ref<Holding | null>(null)
  const tradeType = ref<'buy' | 'sell'>('buy')
  const availableShares = ref(0)
  const tradeTargetTransactions = ref<any[]>([])

  // 可用份额 = 持有份额 - 待确认的卖出/转出冻结份额
  function calculateAvailableShares(holding: Holding) {
    const currentShares = holding.shares || 0
    if (!holding.pendingTransactions)
      return currentShares
    const frozenShares = holding.pendingTransactions
      .filter(t => t.type === 'sell' || t.type === 'convert_out')
      .reduce((sum, t) => sum + (Number(t.orderShares) || 0), 0)
    return Math.max(0, currentShares - frozenShares)
  }

  function openTradeModal(holding: Holding, type: 'buy' | 'sell' | 'convert') {
    tradeTarget.value = holding
    availableShares.value = calculateAvailableShares(holding)
    tradeTargetTransactions.value = holding.recentTransactions || []

    if (type === 'convert') {
      isConvertModalOpen.value = true
    }
    else {
      tradeType.value = type
      isTradeModalOpen.value = true
    }
  }

  // 处理转换提交
  async function handleConvertSubmit(payload: any) {
    try {
      await holdingStore.submitConversion(payload)
      isConvertModalOpen.value = false
      alert('转换申请已提交！\n将在卖出确认后自动处理买入。')
    }
    catch (e) {
      console.error(e)
    }
  }

  async function handleTradeSubmit(payload: any) {
    try {
      await holdingStore.submitTrade(payload)
      isTradeModalOpen.value = false
      alert('交易请求已记录！将在下一交易日净值更新后生效。')
    }
    catch (e) {
      console.error(e)
    }
  }

  return {
    isTradeModalOpen,
    isConvertModalOpen,
    tradeTarget,
    tradeType,
    availableShares,
    tradeTargetTransactions,
    openTradeModal,
    handleConvertSubmit,
    handleTradeSubmit,
  }
}
