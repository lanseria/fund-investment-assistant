/* eslint-disable no-alert */
import type { DcaPlan, DcaPlanPayload } from '~/types/dcaPlan'
import { acceptHMRUpdate, defineStore } from 'pinia'

export const useDcaPlanStore = defineStore('dcaPlan', () => {
  // --- State ---
  const plans = ref<DcaPlan[]>([])
  const isLoading = ref(false)

  // --- Actions ---

  /** 获取当前用户的定投计划列表 */
  async function fetchPlans() {
    isLoading.value = true
    try {
      plans.value = await apiFetch<DcaPlan[]>('/api/fund/dca-plans')
      return plans.value
    }
    catch (error) {
      console.error('获取定投计划失败:', error)
      plans.value = []
      return null
    }
    finally {
      isLoading.value = false
    }
  }

  /** 提取接口错误文案 */
  function errorMessage(error: any) {
    return error?.data?.statusMessage || '发生未知错误'
  }

  /** 创建定投计划 */
  async function createPlan(payload: DcaPlanPayload) {
    try {
      await apiFetch('/api/fund/dca-plans', { method: 'POST', body: payload })
      await fetchPlans()
      return true
    }
    catch (error: any) {
      console.error('创建定投计划失败:', error)
      alert(`创建失败: ${errorMessage(error)}`)
      throw error
    }
  }

  /** 更新定投计划 (金额/频率/扣款日/启停) */
  async function updatePlan(id: number, patch: DcaPlanPayload) {
    try {
      await apiFetch(`/api/fund/dca-plans/${id}`, { method: 'PUT', body: patch })
      await fetchPlans()
      return true
    }
    catch (error: any) {
      console.error('更新定投计划失败:', error)
      alert(`更新失败: ${errorMessage(error)}`)
      throw error
    }
  }

  /** 删除定投计划 */
  async function deletePlan(id: number) {
    try {
      await apiFetch(`/api/fund/dca-plans/${id}`, { method: 'DELETE' })
      await fetchPlans()
      return true
    }
    catch (error: any) {
      console.error('删除定投计划失败:', error)
      alert(`删除失败: ${errorMessage(error)}`)
      throw error
    }
  }

  return {
    plans,
    isLoading,
    fetchPlans,
    createPlan,
    updatePlan,
    deletePlan,
  }
})

if (import.meta.hot)
  import.meta.hot.accept(acceptHMRUpdate(useDcaPlanStore, import.meta.hot))
