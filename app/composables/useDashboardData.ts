import type { Holding, SortableKey } from '~/types/holding'

// 板块主力行为集合：抢筹/建仓/洗盘/出货（base 标签位优先展示主力行为）
const MAIN_ACTIONS = ['抢筹', '建仓', '洗盘', '出货']
// 无主力行为（base 缺失或非主力行为）的展示标签
const BASE_TREND = '基础走势'

/** 持仓筛选条件（多选 toggle chips：组内为或、组间为与） */
export interface HoldingFilters {
  // 主力行为：抢筹/建仓/洗盘/出货/基础走势
  mainActions: string[]
  // RSI 信号分桶：买入/卖出/其他
  rsi: string[]
  // 布林信号分桶：买入/卖出/其他
  bollinger: string[]
}

// 筛选信号的 URL query 参数键名（逗号分隔）
const QUERY_KEYS = {
  mainActions: 'mains',
  rsi: 'rsi',
  bollinger: 'boll',
} as const

// 将逗号分隔的字符串拆为去重后的数组
function parseQueryArray(val: unknown): string[] {
  if (typeof val !== 'string' || !val)
    return []
  return val.split(',').map(s => s.trim()).filter(Boolean)
}

// 将外部策略服务产出的自由文本信号分桶为 买入/卖出/其他
// 沿用 HoldingListRow.vue getSignalTagClass 的既有分桶逻辑
function bucketSignal(value: string | undefined): string {
  if (!value)
    return '其他'
  if (value.includes('买入'))
    return '买入'
  if (value.includes('卖出'))
    return '卖出'
  return '其他'
}

export function useDashboardData(holdings: Ref<Holding[]>) {
  const router = useRouter()
  const route = useRoute()

  // 状态
  const isHeldOnly = ref(route.query.filter === 'held')
  const sortKey = ref<SortableKey | null>((route.query.sort as SortableKey) || 'holdingAmount')
  const sortOrder = ref<'asc' | 'desc'>((route.query.order as 'asc' | 'desc') || 'desc')

  // 筛选条件：从 URL query 初始化（刷新/分享可保留）
  const filters = ref<HoldingFilters>({
    mainActions: parseQueryArray(route.query[QUERY_KEYS.mainActions]),
    rsi: parseQueryArray(route.query[QUERY_KEYS.rsi]),
    bollinger: parseQueryArray(route.query[QUERY_KEYS.bollinger]),
  })

  // 辅助函数
  function getQueryParams() {
    const query: Record<string, string> = {}
    if (isHeldOnly.value)
      query.filter = 'held'
    if (filters.value.mainActions.length)
      query[QUERY_KEYS.mainActions] = filters.value.mainActions.join(',')
    if (filters.value.rsi.length)
      query[QUERY_KEYS.rsi] = filters.value.rsi.join(',')
    if (filters.value.bollinger.length)
      query[QUERY_KEYS.bollinger] = filters.value.bollinger.join(',')
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

  // 任一筛选组非空
  const hasActiveFilters = computed(() =>
    filters.value.mainActions.length > 0
    || filters.value.rsi.length > 0
    || filters.value.bollinger.length > 0,
  )

  // 已选总数（供 Header 角标）
  const activeFilterCount = computed(() =>
    filters.value.mainActions.length
    + filters.value.rsi.length
    + filters.value.bollinger.length,
  )

  function resetFilters() {
    filters.value = { mainActions: [], rsi: [], bollinger: [] }
  }

  // 筛选条件变化时同步到 URL（可分享/刷新保留）
  watch(filters, () => {
    router.replace({ query: { ...getQueryParams(), sort: sortKey.value, order: sortOrder.value } })
  }, { deep: true })

  // 判断单只持仓是否满足筛选条件（组内为或、组间为与）
  function matchesFilters(h: Holding): boolean {
    const { mainActions, rsi, bollinger } = filters.value

    // 主力行为组
    if (mainActions.length) {
      const base = h.signals?.base
      // 命中标签：主力行为直接取 base；否则归为「基础走势」
      const label = base && MAIN_ACTIONS.includes(base) ? base : BASE_TREND
      if (!mainActions.includes(label))
        return false
    }

    // RSI 组
    if (rsi.length && !rsi.includes(bucketSignal(h.signals?.rsi)))
      return false

    // 布林组
    if (bollinger.length && !bollinger.includes(bucketSignal(h.signals?.bollinger_bands)))
      return false

    return true
  }

  // Computed
  const displayData = computed(() => {
    let sourceHoldings = holdings.value || []
    if (isHeldOnly.value) {
      sourceHoldings = sourceHoldings.filter(h => h.holdingAmount !== null)
    }

    // 策略信号筛选（主力行为 / RSI / 布林）
    if (hasActiveFilters.value) {
      sourceHoldings = sourceHoldings.filter(matchesFilters)
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
    filters,
    hasActiveFilters,
    activeFilterCount,
    displayData,
    handleSetSort,
    toggleHeldFilter,
    resetFilters,
  }
}
