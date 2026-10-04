// app/composables/useHolidays.ts
// 法定节假日数据的前端获取与共享 (来源 /api/holidays,由管理员导入)。
// DcaPlanForm 用 ranges 预览下次扣款日;导航栏徽标用 status 提醒导入。

import type { HolidayRanges } from '~~/shared/market'
import { apiFetch } from '~/utils/api'

export interface HolidayItem {
  id: number
  name: string
  startDate: string
  endDate: string
}

export interface HolidayYearGroup {
  year: number
  holidays: HolidayItem[]
}

export interface HolidayStatus {
  years: number[]
  currentYear: number
  nextYear: number
  missingCurrentYear: boolean
  missingNextYear: boolean
}

/** 拉取全部节假日 (客户端调用,登录态由 cookie 携带) */
export function useHolidayData() {
  const groups = ref<HolidayYearGroup[]>([])
  const isLoaded = ref(false)

  async function load() {
    try {
      groups.value = await apiFetch<HolidayYearGroup[]>('/api/holidays')
    }
    catch (e) {
      console.error('加载法定节假日数据失败:', e)
    }
    finally {
      isLoaded.value = true
    }
  }

  /**
   * 展平为 [start, end] 区间列表,直接喂给 shared 的 isTradingDay / computeNextExecutionDate。
   *  数据库是唯一数据源,未加载完成或无数据时为 undefined (仅按周末判定)。
   */
  const ranges = computed<HolidayRanges | undefined>(() => {
    if (!isLoaded.value || groups.value.length === 0)
      return undefined
    return groups.value.flatMap(g => g.holidays.map(h => [h.startDate, h.endDate] as [string, string]))
  })

  onMounted(load)

  return { groups, ranges, isLoaded, reload: load }
}
