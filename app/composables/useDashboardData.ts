import type { Holding, SortableKey } from '~/types/holding'

export function useDashboardData(holdings: Ref<Holding[]>) {
  const router = useRouter()
  const route = useRoute()
  const { getLabel } = useDictStore()

  // 状态
  const isGroupedBySector = ref(route.query.group === 'true')
  const isHeldOnly = ref(route.query.filter === 'held')
  const sortKey = ref<SortableKey | null>((route.query.sort as SortableKey) || (isGroupedBySector.value ? null : 'holdingAmount'))
  const sortOrder = ref<'asc' | 'desc'>((route.query.order as 'asc' | 'desc') || 'desc')

  // 常量
  const SECTOR_UNCATEGORIZED_KEY = 'unclassified'
  const SECTOR_UNCATEGORIZED_LABEL = '未分类板块'

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
    isGroupedBySector.value = false
    router.replace({ query: { ...getQueryParams(), sort: sortKey.value, order: sortOrder.value } })
  }

  function toggleGrouping() {
    const newValue = !isGroupedBySector.value
    isGroupedBySector.value = newValue

    if (newValue) {
      sortKey.value = null
      router.replace({ query: { ...getQueryParams(), group: 'true' } })
    }
    else {
      sortKey.value = 'holdingAmount'
      sortOrder.value = 'desc'
      router.replace({ query: { ...getQueryParams(), sort: sortKey.value, order: sortOrder.value } })
    }
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

    // 分组逻辑
    if (isGroupedBySector.value) {
      const groups = sourceHoldings.reduce((acc, holding) => {
        const key = holding.sector || SECTOR_UNCATEGORIZED_KEY
        if (!acc[key]) {
          acc[key] = {
            sectorKey: key,
            sectorLabel: key === SECTOR_UNCATEGORIZED_KEY ? SECTOR_UNCATEGORIZED_LABEL : (getLabel('sectors', key) || key),
            holdings: [],
            holdingCount: 0,
            groupTotalAmount: 0,
            groupTotalProfitLoss: 0,
          }
        }
        acc[key]!.holdings.push(holding)
        return acc
      }, {} as Record<string, any>)

      const groupedArray = Object.values(groups).map((group) => {
        group.holdingCount = group.holdings.length
        group.holdings.forEach((h: Holding) => {
          if (h.holdingAmount !== null)
            group.groupTotalAmount += h.holdingAmount
          if (h.todayEstimateAmount !== null && h.holdingAmount !== null)
            group.groupTotalProfitLoss += (h.todayEstimateAmount - h.holdingAmount)
        })
        return group
      })

      return groupedArray.sort((a, b) => b.groupTotalAmount - a.groupTotalAmount)
    }

    // 排序逻辑
    if (!sortKey.value)
      return sourceHoldings

    return [...sourceHoldings].sort((a, b) => {
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
    isGroupedBySector,
    isHeldOnly,
    sortKey,
    sortOrder,
    displayData,
    handleSetSort,
    toggleGrouping,
    toggleHeldFilter,
  }
}
