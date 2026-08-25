import type { MaybeRefOrGetter } from 'vue'
import type { SectorCapitalItem } from '~/types/sector'
import { useLocalStorage } from '@vueuse/core'
import { parseYi } from '~~/shared/sectorCapital'

/** 主力行为筛选项 */
export const SECTOR_ACTION_FILTERS: ('全部' | SectorCapitalItem['mainAction'])[] = ['全部', '抢筹', '建仓', '洗盘', '出货']

/** 成交额过滤预设（单位：亿元） */
export const SECTOR_AMOUNT_PRESETS = [
  { label: '不限', value: 0 },
  { label: '≥10亿', value: 10 },
  { label: '≥50亿', value: 50 },
  { label: '≥100亿', value: 100 },
  { label: '≥500亿', value: 500 },
]

export type SectorSortKey = 'mainStrength' | 'changePercent' | 'amount' | 'mainCapital' | 'mainHidden'

/**
 * 板块资金列表的筛选与排序：
 * 主力行为 / 关键词 / 成交额阈值过滤 + 可切换排序列。
 */
export function useSectorFilters(sectors: MaybeRefOrGetter<SectorCapitalItem[] | null | undefined>) {
  const actionFilter = ref<(typeof SECTOR_ACTION_FILTERS)[number]>('全部')

  // 搜索（按板块名/代码子串匹配）
  const search = ref('')

  // 成交额过滤（单位：亿元，0 / 空 = 不限）— 持久化到本地浏览器
  const amountMin = useLocalStorage('sector-capital-amount-min', 0)

  // 排序
  const sortKey = ref<SectorSortKey>('mainStrength')
  const sortOrder = ref<'asc' | 'desc'>('desc')

  function toggleSort(key: SectorSortKey) {
    if (sortKey.value === key) {
      sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc'
    }
    else {
      sortKey.value = key
      sortOrder.value = 'desc'
    }
  }

  const filteredSectors = computed<SectorCapitalItem[]>(() => {
    const list = toValue(sectors) ?? []
    const keyword = search.value.trim().toLowerCase()

    let result = list.filter((s) => {
      const matchAction = actionFilter.value === '全部' || s.mainAction === actionFilter.value
      const matchKeyword = !keyword
        || s.name.toLowerCase().includes(keyword)
        || s.code.toLowerCase().includes(keyword)
      const matchAmount = !amountMin.value || (parseYi(s.amount) ?? 0) >= amountMin.value
      return matchAction && matchKeyword && matchAmount
    })

    result = [...result].sort((a, b) => {
      let valA: number
      let valB: number
      switch (sortKey.value) {
        case 'amount':
          valA = parseYi(a.amount) ?? 0
          valB = parseYi(b.amount) ?? 0
          break
        case 'mainCapital':
          valA = parseYi(a.mainCapital) ?? 0
          valB = parseYi(b.mainCapital) ?? 0
          break
        case 'mainHidden':
          valA = parseYi(a.mainHidden) ?? 0
          valB = parseYi(b.mainHidden) ?? 0
          break
        default:
          // changePercent / mainStrength 均为数值
          valA = Number(a[sortKey.value]) || 0
          valB = Number(b[sortKey.value]) || 0
      }
      return sortOrder.value === 'asc' ? valA - valB : valB - valA
    })

    return result
  })

  return {
    actionFilters: SECTOR_ACTION_FILTERS,
    actionFilter,
    search,
    amountPresets: SECTOR_AMOUNT_PRESETS,
    amountMin,
    sortKey,
    sortOrder,
    toggleSort,
    filteredSectors,
  }
}
