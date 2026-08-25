import type { BollingerSignalData, BollingerSignalPoint, RsiChartData } from '~/types/chart'
import { isAfter, parseISO } from 'date-fns'
import { subtractByUnit } from '~/utils/date'

/** 图表区间筛选选项（单位与 utils/date 的 subtractByUnit 对齐） */
export const FUND_DATE_FILTERS = [
  { label: '近1个月', value: '1m', amount: 1, unit: 'month' },
  { label: '近3个月', value: '3m', amount: 3, unit: 'months' },
  { label: '近6个月', value: '6m', amount: 6, unit: 'months' },
  { label: '近1年', value: '1y', amount: 1, unit: 'year' },
  { label: '近2年', value: '2y', amount: 2, unit: 'years' },
  { label: '近5年', value: '5y', amount: 5, unit: 'years' },
  { label: '全部', value: 'all' },
]

/**
 * 基金策略图表数据编排：
 * 基础走势 + 布林带 + 区间涨跌 三合一请求、RSI 独立懒加载、
 * 布林带买卖信号提取、图表区间筛选（dataZoom）与区间涨跌展示格式化。
 */
export function useFundStrategyData(code: string, targetUserId: number | null) {
  // 策略图表数据(基础走势/布林带/区间涨跌)：懒加载不阻塞路由切换，图表区在数据到达前显示整卡加载态
  const { data, pending, error, refresh } = useAsyncData(
    `fund-all-strategies-structured-${code}`,
    async () => {
      const fetchGenericStrategy = (strategy: string = '') => {
        const params: any = { ma: [5, 10, 20, 120] }
        if (strategy)
          params.strategy = strategy
        if (targetUserId)
          params.userId = targetUserId

        return apiFetch(`/api/fund/holdings/${code}/history`, { params })
      }

      // 获取区间涨跌幅数据
      const fetchPerformance = () => apiFetch<Record<string, number | null>>(`/api/fund/holdings/${code}/performance`)

      const [baseData, bollingerData, performanceData] = await Promise.all([
        fetchGenericStrategy(''),
        fetchGenericStrategy('bollinger_bands'),
        fetchPerformance(),
      ])

      return {
        base: baseData,
        bollingerBands: bollingerData,
        performance: performanceData,
      }
    },
    {
      lazy: true,
      server: false,
    },
  )

  // RSI 策略数据代理自外部策略分析服务、耗时较长，独立懒加载：不阻塞路由切换与主图渲染，
  // 到达后作为子图叠加在下方「基础走势」图中（失败时静默降级为主图无 RSI 子图）
  const { data: rsiData, refresh: refreshRsi } = useAsyncData(
    `fund-rsi-strategy-${code}`,
    () => apiFetch<RsiChartData>(`/api/charts/rsi/${code}`).catch(() => null),
    {
      lazy: true,
      server: false,
      default: () => null,
    },
  )

  // 布林带策略买卖信号：从每日策略信号记录中筛选出买入/卖出点（不含「持有/观望」），
  // 作为「基础走势」图 RSI 下方的独立子图展示（只展示信号点，不展示布林带轨值）
  const bollingerSignalData = computed<BollingerSignalData | undefined>(() => {
    const signals = data.value?.bollingerBands?.signals
    if (!signals || signals.length === 0)
      return undefined

    const buy: BollingerSignalPoint[] = []
    const sell: BollingerSignalPoint[] = []
    signals.forEach((s: any) => {
      const type = String(s.signal ?? '').trim()
      if (type !== '买入' && type !== '卖出')
        return
      const close = Number(s.latestClose)
      if (Number.isNaN(close))
        return
      const point: BollingerSignalPoint = {
        date: String(s.latestDate),
        close,
        signal: s,
      }
      if (type === '买入')
        buy.push(point)
      else
        sell.push(point)
    })

    if (buy.length === 0 && sell.length === 0)
      return undefined
    return { buy, sell }
  })

  // --- 图表区间筛选（dataZoom 百分比） ---
  const activeFilter = ref<string | null>(null)
  const dataZoomStart = ref(50)
  const dataZoomEnd = ref(100)

  function setDateRange(period: string) {
    activeFilter.value = period
    // 现在可以安全地从 data.base.history 获取日期信息
    const historyData = data.value?.base.history
    if (!historyData || historyData.length === 0)
      return

    const totalPoints = historyData.length
    if (period === 'all') {
      dataZoomStart.value = 0
      dataZoomEnd.value = 100
      return
    }

    const filter = FUND_DATE_FILTERS.find(f => f.value === period)
    if (!filter || !filter.unit)
      return

    const lastDate = parseISO(historyData[totalPoints - 1]!.date)
    const targetDate = subtractByUnit(lastDate, filter.amount, filter.unit)
    const startIndex = historyData.findIndex((p: { date: string }) => isAfter(parseISO(p.date), targetDate))

    if (startIndex !== -1) {
      dataZoomStart.value = (startIndex / totalPoints) * 100
      dataZoomEnd.value = 100
    }
    else {
      dataZoomStart.value = 0
      dataZoomEnd.value = 100
    }
  }

  watch(data, (newData) => {
    if (newData)
      setDateRange('3m')
  }, { immediate: true })

  // --- 区间涨跌展示 ---
  const performance = computed<Record<string, number | null> | null | undefined>(() => data.value?.performance)

  function formatPerformance(key: string) {
    const val = performance.value?.[key]
    if (val === null || val === undefined)
      return '--'
    return `${val > 0 ? '+' : ''}${val.toFixed(2)}%`
  }

  function getPerformanceClass(key: string) {
    const val = performance.value?.[key]
    if (val === null || val === undefined)
      return 'text-gray-400'
    if (val > 0)
      return 'text-red-500 dark:text-red-400'
    if (val < 0)
      return 'text-green-500 dark:text-green-400'
    return 'text-gray-500'
  }

  return {
    data,
    pending,
    error,
    refresh,
    rsiData,
    refreshRsi,
    bollingerSignalData,
    activeFilter,
    dataZoomStart,
    dataZoomEnd,
    setDateRange,
    dateFilters: FUND_DATE_FILTERS,
    performance,
    formatPerformance,
    getPerformanceClass,
  }
}
