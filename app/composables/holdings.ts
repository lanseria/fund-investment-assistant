// File: app/composables/holdings.ts

/* eslint-disable no-alert */
import type { Holding, HoldingSummary } from '~/types/holding' // [修改] 导入新类型
import { acceptHMRUpdate, defineStore } from 'pinia'

export const useHoldingStore = defineStore('holding', () => {
  // --- State ---
  const holdings = ref<Holding[]>([])
  const summary = ref<HoldingSummary | null>(null) // [新增] summary state
  const isLoading = ref(false)
  const isRefreshing = ref(false)

  // --- Actions ---

  /**
   * 从后端获取所有持仓数据并更新 state
   */
  async function fetchHoldings() {
    isLoading.value = true
    try {
      // [修改] API 现在返回一个包含 holdings 和 summary 的对象
      const data = await apiFetch<{ holdings: Holding[], summary: HoldingSummary }>('/api/fund/holdings/')
      holdings.value = data.holdings
      summary.value = data.summary // [新增] 更新 summary
    }
    catch (error) {
      console.error('获取持仓数据失败:', error)
    }
    finally {
      isLoading.value = false
    }
  }

  /**
   * 添加一个新的持仓基金
   */
  async function addHolding(newHolding: { code: string, name?: string, holdingAmount: number, holdingProfitRate?: number | null }) {
    try {
      await apiFetch('/api/fund/holdings/', {
        method: 'POST',
        body: newHolding,
      })
      await fetchHoldings()
    }
    catch (error) {
      console.error('添加基金失败:', error)
      // 可以在此处理错误，例如显示一个错误消息
      throw error // 重新抛出错误，以便调用方可以处理
    }
  }

  /**
   * 更新持仓金额
   */
  async function updateHolding(code: string, data: { holdingAmount: number, holdingProfitRate?: number | null }) {
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
      // 删除成功后，从本地列表中移除，避免重新请求网络
      // holdings.value = holdings.value.filter(h => h.code !== code)
      // [修改] 删除后也需要刷新，以更新汇总信息
      await fetchHoldings()
    }
    catch (error) {
      console.error('删除基金失败:', error)
      throw error
    }
  }
  /**
   * [新增] 刷新所有基金的实时估值
   */
  async function refreshAllEstimates() {
    isRefreshing.value = true
    try {
      // 调用新创建的后端 API
      await apiFetch('/api/fund/utils/refresh-estimates', {
        method: 'POST',
      })
      // 成功后，重新获取整个列表以更新UI
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

  // --- Getters (Computed) ---
  const totalCost = computed(() => holdings.value.reduce((sum, h) => sum + h.holdingAmount, 0))

  /**
   * 导出持仓数据
   */
  async function exportHoldings() {
    try {
      // apiFetch 返回的是一个 Blob 对象
      const blob = await apiFetch('/api/fund/utils/export', {
        responseType: 'blob',
      })

      // 创建一个临时的 URL 来触发浏览器下载
      // eslint-disable-next-line ts/ban-ts-comment
      // @ts-ignore
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'fund_holdings_export.json' // 设置下载的文件名
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
    formData.append('overwrite', String(overwrite)) // 布尔值需要转为字符串

    try {
      const result = await apiFetch<{ message: string, imported: number, skipped: number }>('/api/fund/utils/import', {
        method: 'POST',
        body: formData,
      })
      // 导入成功后，刷新列表
      await fetchHoldings()
      return result
    }
    catch (error: any) {
      console.error('导入数据失败:', error)
      // 尝试从错误中获取后端的详细信息
      const detail = error.data?.detail || '发生未知错误'
      alert(`导入失败: ${detail}`)
      throw error
    }
    finally {
      isLoading.value = false
    }
  }
  /**
   * [修改] 手动触发单个基金的所有策略分析
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
   * [新增] 手动同步单个基金的历史净值
   * @param code 基金代码
   */
  async function syncHistory(code: string) {
    try {
      const result = await apiFetch(`/api/fund/holdings/${code}/sync-history`, {
        method: 'POST',
      })
      alert(result.message) // 简单的成功提示
      return result
    }
    catch (error: any) {
      console.error(`同步基金 ${code} 历史数据失败:`, error)
      const detail = error.data?.statusMessage || '发生未知错误'
      alert(`同步失败: ${detail}`) // 简单的失败提示
      throw error
    }
  }

  return {
    holdings,
    summary, // [新增] 导出 summary
    isLoading,
    totalCost,
    isRefreshing,
    fetchHoldings,
    addHolding,
    updateHolding,
    deleteHolding,
    exportHoldings,
    importHoldings,
    refreshAllEstimates,
    syncHistory,
    runStrategiesForFund,
  }
})

if (import.meta.hot)
  import.meta.hot.accept(acceptHMRUpdate(useHoldingStore, import.meta.hot))
