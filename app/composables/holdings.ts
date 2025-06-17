// app/composables/holdings.ts
import { acceptHMRUpdate, defineStore } from 'pinia'
import type { Holding } from '~/types/holding'

export const useHoldingStore = defineStore('holding', () => {
  // --- State ---
  const holdings = ref<Holding[]>([])
  const isLoading = ref(false)

  // --- Actions ---

  /**
   * 从后端获取所有持仓数据并更新 state
   */
  async function fetchHoldings() {
    isLoading.value = true
    try {
      const data = await $fetch<Holding[]>('/api/fund/holdings/')
      holdings.value = data
    }
    catch (error) {
      console.error('获取持仓数据失败:', error)
      // 在这里可以添加错误提示，例如使用 nuxt-primevue 的 toast
    }
    finally {
      isLoading.value = false
    }
  }

  /**
   * 添加一个新的持仓基金
   * @param newHolding - 要添加的基金数据 { code, holding_amount }
   */
  async function addHolding(newHolding: { code: string, holding_amount: number, name?: string }) {
    try {
      await $fetch('/api/fund/holdings/', {
        method: 'POST',
        body: newHolding,
      })
      // 添加成功后，刷新整个列表以获取最新数据
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
  async function updateHolding(code: string, amount: number) {
    try {
      await $fetch(`/api/fund/holdings/${code}`, {
        method: 'PUT',
        body: { holding_amount: amount },
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
      await $fetch(`/api/fund/holdings/${code}`, {
        method: 'DELETE',
      })
      // 删除成功后，从本地列表中移除，避免重新请求网络
      holdings.value = holdings.value.filter(h => h.code !== code)
    }
    catch (error) {
      console.error('删除基金失败:', error)
      throw error
    }
  }

  // --- Getters (Computed) ---
  const totalCost = computed(() => holdings.value.reduce((sum, h) => sum + h.holding_amount, 0))

  return {
    holdings,
    isLoading,
    totalCost,
    fetchHoldings,
    addHolding,
    updateHolding,
    deleteHolding,
  }
})

if (import.meta.hot)
  import.meta.hot.accept(acceptHMRUpdate(useHoldingStore, import.meta.hot))