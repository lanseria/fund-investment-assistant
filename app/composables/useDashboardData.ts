import type { Holding, SortableKey } from '~/types/holding'

export function useDashboardData(holdings: Ref<Holding[]>) {
  const router = useRouter()
  const route = useRoute()

  // 状态
  const isHeldOnly = ref(route.query.filter === 'held')
  const sortKey = ref<SortableKey | null>((route.query.sort as SortableKey) || 'holdingAmount')
  const sortOrder = ref<'asc' | 'desc'>((route.query.order as 'asc' | 'desc') || 'desc')

  // 辅助函数
  function getQueryParams() {
    const query: Record<string, string> = {}
    if (isHeldOnly.value)
      query.filter = 'held'
    return query
  }

  // Actions
  function handleSetSort(key: SortableKey) {
    if (sortKey.value === key) {
      sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc'
    }
    else {
      sortKey.value = key
      sortOrder.value = 'desc'
    }
    router.replace({ query: { ...getQueryParams(), sort: sortKey.value, order: sortOrder.value } })
  }

  function toggleHeldFilter() {
    isHeldOnly.value = !isHeldOnly.value
    const query: any = { ...route.query }
    if (isHeldOnly.value)
      query.filter = 'held'
    else
      delete query.filter
    router.replace({ query })
  }

  // Computed
  const displayData = computed(() => {
    let sourceHoldings = holdings.value || []
    if (isHeldOnly.value) {
      sourceHoldings = sourceHoldings.filter(h => h.holdingAmount !== null)
    }

    // 排序逻辑
    if (!sortKey.value)
      return sourceHoldings

    return sourceHoldings.toSorted((a, b) => {
      const key = sortKey.value!
      const valA = a[key] ?? -Infinity
      const valB = b[key] ?? -Infinity

      if (sortOrder.value === 'asc')
        return Number(valA) - Number(valB)
      else
        return Number(valB) - Number(valA)
    })
  })

  return {
    isHeldOnly,
    sortKey,
    sortOrder,
    displayData,
    handleSetSort,
    toggleHeldFilter,
  }
}
