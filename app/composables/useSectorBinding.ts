/* eslint-disable no-alert */
import type { Ref } from 'vue'
import type { SectorBinding, SectorCapitalItem, SectorType } from '~/types/sector'
import { SECTOR_DICT_TYPE } from '~/constants'
import { apiFetch } from '~/utils/api'

/**
 * 板块绑定流程：绑定关系加载、sectorCode → binding 映射、
 * 绑定/解绑模态框状态与提交、项目板块下拉选项与占用提示。
 */
export function useSectorBinding(sectorType: Ref<SectorType>) {
  const dictStore = useDictStore()

  // 加载所有绑定关系，构造 sectorCode → binding 映射
  const { data: bindingsData, refresh: refreshBindings } = useAsyncData(
    'sector-bindings',
    () => apiFetch<SectorBinding[]>('/api/sectors/bindings'),
  )

  const bindingMap = computed<Map<string, SectorBinding>>(() => {
    const map = new Map<string, SectorBinding>()
    for (const b of bindingsData.value ?? [])
      map.set(b.sectorCode, b)
    return map
  })

  // 项目板块下拉选项（含「解绑」选项）
  const sectorOptions = computed(() => [
    { value: null, label: '-- 解绑 / 不绑定 --' },
    ...dictStore.getDictData(SECTOR_DICT_TYPE).map(opt => ({
      value: opt.value,
      label: `${opt.label} (${opt.value})`,
    })),
  ])

  // 已被其他东财板块占用的 dictValue（避免重复绑定提示）
  const occupiedDictValues = computed(() => {
    const set = new Set<string>()
    for (const b of bindingsData.value ?? [])
      set.add(b.dictValue)
    return set
  })

  // 当前正在编辑绑定的东财板块
  const editingBindingSector = ref<SectorCapitalItem | null>(null)
  const selectedDictValue = ref<string | null>(null)
  const isBindingModalOpen = ref(false)
  const isBindingSubmitting = ref(false)

  function openBindingModal(sector: SectorCapitalItem) {
    editingBindingSector.value = sector
    // 预填当前已绑定的 dictValue
    selectedDictValue.value = bindingMap.value.get(sector.code)?.dictValue ?? null
    isBindingModalOpen.value = true
  }

  async function handleBindingSubmit() {
    const sector = editingBindingSector.value
    if (!sector)
      return

    isBindingSubmitting.value = true
    try {
      const existing = bindingMap.value.get(sector.code)
      const newDictValue = selectedDictValue.value

      if (newDictValue === null) {
        // 解绑
        if (existing) {
          await apiFetch(`/api/admin/sector-bindings/${existing.dictValue}`, { method: 'DELETE' })
        }
      }
      else if (existing) {
        // 已有绑定 → 修改（重新绑定到新东财板块）
        await apiFetch(`/api/admin/sector-bindings/${existing.dictValue}`, {
          method: 'PUT',
          body: {
            sectorCode: sector.code,
            sectorType: sectorType.value,
            sectorName: sector.name,
          },
        })
      }
      else {
        // 新建绑定
        await apiFetch('/api/admin/sector-bindings', {
          method: 'POST',
          body: {
            dictValue: newDictValue,
            sectorCode: sector.code,
            sectorType: sectorType.value,
            sectorName: sector.name,
          },
        })
      }

      isBindingModalOpen.value = false
      await refreshBindings()
    }
    catch (error: any) {
      alert(`绑定失败: ${error.data?.statusMessage || '未知错误'}`)
    }
    finally {
      isBindingSubmitting.value = false
    }
  }

  return {
    bindingMap,
    sectorOptions,
    occupiedDictValues,
    editingBindingSector,
    selectedDictValue,
    isBindingModalOpen,
    isBindingSubmitting,
    openBindingModal,
    handleBindingSubmit,
  }
}
