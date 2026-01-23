/* eslint-disable no-alert */
import type { Holding, HoldingSummary } from '~/types/holding'
import { acceptHMRUpdate, defineStore } from 'pinia'

export const useHoldingStore = defineStore('holding', () => {
  // --- State ---
  const holdings = ref<Holding[]>([])
  const summary = ref<HoldingSummary | null>(null)
  const isLoading = ref(false)
  const isRefreshing = ref(false)

  // SSE 相关状态
  const sseStatus = ref<'OPEN' | 'CONNECTING' | 'CLOSED'>('CLOSED')
  let sse: ReturnType<typeof useEventSource> | null = null

  // --- Actions ---

  /**
   * 从后端获取所有持仓数据并更新 state
   */
  async function fetchHoldings() {
    isLoading.value = true
    try {
      const data = await apiFetch<{ holdings: Holding[], summary: HoldingSummary }>('/api/fund/holdings/')
      holdings.value = data.holdings
      summary.value = data.summary
      return data // [重要] 返回获取到的数据
    }
    catch (error) {
      console.error('获取持仓数据失败:', error)
      holdings.value = []
      summary.value = null
      return null // [重要] 出错时也返回一个值
    }
    finally {
      isLoading.value = false
    }
  }

  /**
   * 启动 SSE 实时更新
   */
  function startSseUpdates() {
    // 防止重复连接
    if (sse && sse.status.value !== 'CLOSED')
      return

    console.warn('[SSE] Initializing connection...')
    sse = useEventSource('/api/sse/holdings', [], { withCredentials: true })

    // 监听状态变化
    watch(sse.status, (newStatus) => {
      sseStatus.value = newStatus
      console.warn('[SSE] Status changed:', newStatus)
    }, { immediate: true })

    // 监听数据更新
    watch(sse.data, (newData: any) => {
      if (newData) {
        try {
          const updatedData = JSON.parse(newData) as { holdings: Holding[], summary: HoldingSummary }
          console.warn('[SSE] Received data update:', updatedData)
          holdings.value = updatedData.holdings
          summary.value = updatedData.summary
        }
        catch (e) {
          console.error('[SSE] Failed to parse message data:', e)
        }
      }
    })
  }

  /**
   * 停止 SSE 实时更新
   */
  function stopSseUpdates() {
    if (sse) {
      sse.close()
      console.warn('[SSE] Connection closed by store action.')
    }
  }

  /**
   * 添加一个新的持仓基金
   */
  async function addHolding(newHolding: { code: string, shares?: number | null, costPrice?: number | null, fundType: 'open' | 'qdii_lof' }) {
    try {
    // 请求体现在会包含 fundType
      await apiFetch('/api/fund/holdings/', {
        method: 'POST',
        body: newHolding,
      })
      await fetchHoldings()
    }
    catch (error) {
      console.error('添加基金失败:', error)
      throw error
    }
  }

  /**
   * 更新持仓金额
   */
  async function updateHolding(code: string, data: { shares?: number | null, costPrice?: number | null }) {
    try {
      await apiFetch(`/api/fund/holdings/${code}`, {
        method: 'PUT',
        body: data,
      })
      await fetchHoldings()
    }
    catch (error) {
      console.error('更新基金失败:', error)
      throw error
    }
  }

  /**
   * 删除一个持仓基金
   */
  async function deleteHolding(code: string) {
    try {
      await apiFetch(`/api/fund/holdings/${code}`, {
        method: 'DELETE',
      })
      await fetchHoldings()
    }
    catch (error) {
      console.error('删除基金失败:', error)
      throw error
    }
  }
  /**
   * 仓一个基金，转为仅关注
   */
  async function clearHoldingPosition(code: string) {
    try {
      await apiFetch(`/api/fund/holdings/${code}/clear-position`, {
        method: 'POST',
      })
      await fetchHoldings()
    }
    catch (error) {
      console.error('清仓基金失败:', error)
      throw error
    }
  }
  /**
   * 刷新所有基金的实时估值
   */
  async function refreshAllEstimates() {
    isRefreshing.value = true
    try {
      await apiFetch('/api/fund/utils/refresh-estimates', {
        method: 'POST',
      })
      await fetchHoldings()
    }
    catch (error) {
      console.error('刷新估值失败:', error)
      alert('刷新估值失败，请查看控制台！')
    }
    finally {
      isRefreshing.value = false
    }
  }

  // --- Getters---
  const totalCost = computed(() => holdings.value.reduce((sum, h) => sum + (h.holdingAmount ?? 0), 0))

  /**
   * 导出持仓数据
   */
  async function exportHoldings() {
    try {
      const blob = await apiFetch('/api/fund/utils/export', {
        responseType: 'blob',
      })

      // eslint-disable-next-line ts/ban-ts-comment
      // @ts-expect-error
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'fund_holdings_export.json'
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      a.remove()
    }
    catch (error) {
      console.error('导出数据失败:', error)
      alert('导出失败，请查看控制台！')
    }
  }

  /**
   * 导入持仓数据
   * @param file - 用户选择的 JSON 文件
   * @param overwrite - 是否覆盖现有数据
   */
  async function importHoldings(file: File, overwrite: boolean) {
    isLoading.value = true
    const formData = new FormData()
    formData.append('file', file)
    formData.append('overwrite', String(overwrite))

    try {
      const result = await apiFetch<{ message: string, imported: number, skipped: number }>('/api/fund/utils/import', {
        method: 'POST',
        body: formData,
      })
      await fetchHoldings()
      return result
    }
    catch (error: any) {
      console.error('导入数据失败:', error)
      const detail = error.data?.detail || '发生未知错误'
      alert(`导入失败: ${detail}`)
      throw error
    }
    finally {
      isLoading.value = false
    }
  }

  /**
   * 提交基金买入/卖出交易
   */
  async function submitTrade(payload: { fundCode: string, type: 'buy' | 'sell', amount?: number, shares?: number, date: string }) {
    try {
      await apiFetch('/api/fund/transactions', {
        method: 'POST',
        body: payload,
      })
      // 这里不刷新持仓 fetchHoldings()，因为交易只是记录，尚未成交，不会改变持仓份额
      // 可以选择给用户一个提示
      return true
    }
    catch (error: any) {
      console.error('提交交易失败:', error)
      const detail = error.data?.statusMessage || '发生未知错误'
      alert(`交易提交失败: ${detail}`)
      throw error
    }
  }
  /**
   * 提交基金转换申请
   */
  async function submitConversion(payload: { fromCode: string, toCode: string, shares: number, date: string }) {
    try {
      await apiFetch('/api/fund/convert', {
        method: 'POST',
        body: payload,
      })
      // 转换是异步的，无需立即刷新持仓
      return true
    }
    catch (error: any) {
      console.error('提交转换失败:', error)
      const detail = error.data?.statusMessage || '发生未知错误'
      alert(`转换提交失败: ${detail}`)
      throw error
    }
  }
  // 撤销/删除待确认的交易
  async function deleteTransaction(transactionId: number) {
    try {
      await apiFetch(`/api/fund/transactions/${transactionId}`, {
        method: 'DELETE',
      })
      // 删除成功后刷新持仓列表，以便 UI 移除该标签
      await fetchHoldings()
    }
    catch (error: any) {
      console.error('撤销交易失败:', error)
      const detail = error.data?.statusMessage || '发生未知错误'
      alert(`撤销失败: ${detail}`)
      throw error
    }
  }

  /**
   * 手动触发单个基金的所有策略分析
   * @param code 基金代码
   */
  async function runStrategiesForFund(code: string) {
    try {
      const result = await apiFetch(`/api/fund/holdings/${code}/run-strategies`, {
        method: 'POST',
      })
      alert(`策略分析完成！\n成功: ${result.success}, 失败: ${result.failed}`)
      return result
    }
    catch (error: any) {
      console.error(`为基金 ${code} 执行策略分析失败:`, error)
      const detail = error.data?.statusMessage || '发生未知错误'
      alert(`执行失败: ${detail}`)
      throw error
    }
  }

  /**
   * 手动同步单个基金的历史净值
   * @param code 基金代码
   */
  async function syncHistory(code: string) {
    try {
      const result = await apiFetch(`/api/fund/holdings/${code}/sync-history`, {
        method: 'POST',
      })
      alert(result.message)
      return result
    }
    catch (error: any) {
      console.error(`同步基金 ${code} 历史数据失败:`, error)
      const detail = error.data?.statusMessage || '发生未知错误'
      alert(`同步失败: ${detail}`)
      throw error
    }
  }

  return {
    holdings,
    summary,
    isLoading,
    isRefreshing,
    sseStatus,
    totalCost,
    fetchHoldings,
    startSseUpdates,
    stopSseUpdates,
    addHolding,
    updateHolding,
    deleteHolding,
    clearHoldingPosition,
    exportHoldings,
    importHoldings,
    refreshAllEstimates,
    syncHistory,
    runStrategiesForFund,
    submitTrade,
    deleteTransaction,
    submitConversion,
  }
})

if (import.meta.hot)
  import.meta.hot.accept(acceptHMRUpdate(useHoldingStore, import.meta.hot))
