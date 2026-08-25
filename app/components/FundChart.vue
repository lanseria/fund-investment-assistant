<script setup lang="ts">
import type { EChartsOption } from 'echarts'
import type { MarkPointComponentOption } from 'echarts/components'
import type { BollingerSignalData, RsiChartData } from '~/types/chart'
import type { HoldingHistoryPoint } from '~/types/holding'
import type { SectorCapitalHistoryResponse } from '~/types/sector'
import { format, parseISO } from 'date-fns'
import { formatCurrency } from '~/utils/format'

const props = defineProps<{
  history: HoldingHistoryPoint[]
  signals: any[]
  transactions?: any[]
  title: string
  dataZoomStart: number
  dataZoomEnd: number
  /** 板块主力行为历史（可选）。传入后将以子图形式叠加在走势图下方，与净值共享同一条时间轴 */
  sectorHistory?: SectorCapitalHistoryResponse['history']
  /** RSI 策略数据（可选）。传入后将以子图形式叠加在走势图下方，与净值共享同一条时间轴 */
  rsiData?: RsiChartData
  /** 布林带策略买卖信号（可选）。传入后将以子图形式叠加在 RSI 子图下方，只标注买入/卖出信号点 */
  bollingerData?: BollingerSignalData
}>()

const emit = defineEmits(['signal-click', 'transaction-click'])
// 板块主力行为 → 配色与缩写（用于主力强度子图的 markPoint 标注）
const sectorActionStyle: Record<string, { color: string, label: string }> = {
  抢筹: { color: '#ef4444', label: '抢' },
  建仓: { color: '#f97316', label: '建' },
  洗盘: { color: '#9ca3af', label: '洗' },
  出货: { color: '#22c55e', label: '出' },
}
// 主力强度配色：正值偏多 → 红，负值偏空 → 绿
const STRENGTH_COLOR_POS = '#ef4444'
const STRENGTH_COLOR_NEG = '#22c55e'

const hasSector = computed(() => {
  const h = props.sectorHistory
  return !!h && h.dates.length > 0
})

const hasRsi = computed(() => {
  const r = props.rsiData
  return !!r && r.dates.length > 0
})

const hasBollinger = computed(() => {
  const b = props.bollingerData
  return !!b && (b.buy.length > 0 || b.sell.length > 0)
})

// 图表总高度随子图组合自适应。必须使用字面量 class：UnoCSS 依静态源码扫描生成样式，
// 模板字符串拼接的 h-* 不会被提取，会导致图表高度样式缺失。
const chartHeightClass = computed(() => {
  const rsi = hasRsi.value
  const boll = hasBollinger.value
  const sector = hasSector.value
  if (rsi && boll && sector)
    return 'h-265' // 全部子图 1060px：主图约 254px / RSI 138px / 布林带信号 95px / 主力双图 190px
  if (rsi && sector)
    return 'h-215' // 860px
  if (boll && sector)
    return 'h-200' // 800px
  if (sector)
    return 'h-165' // 660px
  if (rsi && boll)
    return 'h-185' // 740px
  if (rsi)
    return 'h-150' // 600px
  if (boll)
    return 'h-140' // 560px
  return 'h-100' // 单图 400px
})

const colorMode = useColorMode()
provide(THEME_KEY, computed(() => colorMode.value === 'dark' ? 'dark' : 'default'))

type TransactionType = 'buy' | 'sell' | 'convert_in' | 'convert_out'

const transactionMeta: Record<TransactionType, { label: string, color: string, sign: 1 | -1 }> = {
  buy: { label: '买入', color: '#ef4444', sign: 1 },
  sell: { label: '卖出', color: '#22c55e', sign: -1 },
  convert_in: { label: '转入', color: '#a855f7', sign: 1 },
  convert_out: { label: '转出', color: '#3b82f6', sign: -1 },
}

function getTransactionAmount(tx: any) {
  const candidates = [
    tx.confirmedAmount,
    tx.orderAmount,
  ]

  for (const value of candidates) {
    const amount = Number(value)
    if (!Number.isNaN(amount) && amount > 0)
      return amount
  }

  const shares = Number(tx.confirmedShares ?? tx.orderShares)
  const nav = Number(tx.confirmedNav)

  if (!Number.isNaN(shares) && !Number.isNaN(nav) && shares > 0 && nav > 0)
    return shares * nav

  return null
}

// 策略信号的映射逻辑
function mapSignalsToMarkPoints(signalType: '买入' | '卖出'): MarkPointComponentOption['data'] {
  const isBuy = signalType === '买入'
  const isDark = colorMode.value === 'dark'
  const color = isBuy ? (isDark ? '#f87171' : '#ef4444') : (isDark ? '#4ade80' : '#22c55e')
  const symbol = isBuy ? 'pin' : 'triangle'
  const symbolRotate = isBuy ? 0 : 180

  return props.signals
    .filter(s => s.signal.trim() === signalType)
    .map((s) => {
      const dateStr = format(parseISO(s.latestDate), 'yyyy-MM-dd')
      const closeValue = Number(s.latestClose)

      return {
        name: signalType,
        coord: [dateStr, closeValue],
        fullData: s,
        id: s.id,
        symbol,
        symbolRotate,
        symbolSize: 32,
        itemStyle: {
          color,
          borderColor: isDark ? '#1f2937' : '#ffffff',
          borderWidth: 1,
        },
        label: {
          show: true,
          formatter: isBuy ? 'B' : 'S',
          color: '#fff',
          fontSize: 12,
          fontWeight: 'bold' as const,
        },
      }
    })
}
function mapTransactionsToMarkPoints(): MarkPointComponentOption['data'] {
  if (!props.transactions || props.transactions.length === 0)
    return []

  // 1. 按日期分组
  const groupedTxs = new Map<string, any[]>()
  props.transactions.forEach((tx) => {
    if (!groupedTxs.has(tx.orderDate)) {
      groupedTxs.set(tx.orderDate, [])
    }
    groupedTxs.get(tx.orderDate)!.push(tx)
  })

  const markPoints: any[] = []

  // 2. 遍历分组生成点
  groupedTxs.forEach((txList, date) => {
    // 检查是否包含混合类型
    const types = new Set(txList.map(t => t.type))
    const isMixed = types.size > 1
    const firstType = txList[0].type // 如果不是混合，取第一个类型即可

    let color = '#9ca3af'
    let symbolRotate = 0
    let symbol = 'diamond'

    if (isMixed) {
      color = '#f59e0b' // Orange
      symbol = 'circle' // 混合用圆形
    }
    else {
      // 单一类型样式
      if (firstType === 'buy') {
        color = '#ef4444'
      }
      else if (firstType === 'sell') {
        color = '#22c55e'
        symbolRotate = 180
      }
      else if (firstType === 'convert_in') {
        color = '#a855f7'
      }
      else if (firstType === 'convert_out') {
        color = '#3b82f6'
        symbolRotate = 180
      }
    }

    // 获取该日期的净值 (取第一笔交易的 confirmedNav 或历史净值)
    let val = txList[0].confirmedNav ? Number(txList[0].confirmedNav) : null
    if (!val) {
      const historyPoint = props.history.find(h => h.date === date)
      if (historyPoint)
        val = historyPoint.nav
    }

    if (!val)
      return

    // 对象字面量中包含自定义属性 transactionList
    markPoints.push({
      name: isMixed ? `交易-混合` : `交易-${firstType}`,
      coord: [date, val],
      transactionList: txList, // 自定义字段
      symbol,
      symbolSize: 18,
      symbolRotate,
      itemStyle: {
        color,
        borderColor: '#fff',
        borderWidth: 1,
      },
      label: { show: false },
      tooltip: { show: false },
    })
  })

  return markPoints as MarkPointComponentOption['data']
}

function buildTransactionBarSeries(dates: string[]) {
  const groupedAmounts = new Map<string, Partial<Record<TransactionType, number>>>()

  ;(props.transactions || []).forEach((tx) => {
    const type = tx.type as TransactionType
    const meta = transactionMeta[type]
    if (!meta || !tx.orderDate)
      return

    const amount = getTransactionAmount(tx)
    if (!amount)
      return

    const signedAmount = amount * meta.sign
    const day = tx.orderDate

    if (!groupedAmounts.has(day))
      groupedAmounts.set(day, {})

    const current = groupedAmounts.get(day)!
    current[type] = (current[type] || 0) + signedAmount
  })

  return (Object.keys(transactionMeta) as TransactionType[]).map((type) => {
    const data = dates.map((date) => {
      const value = groupedAmounts.get(date)?.[type]
      return value === undefined ? null : value
    })

    return {
      name: transactionMeta[type].label,
      type: 'bar' as const,
      yAxisIndex: 1,
      data,
      barMaxWidth: 14,
      barGap: '-100%',
      barCategoryGap: '38%',
      stack: 'transaction-amount',
      itemStyle: {
        color: transactionMeta[type].color,
        opacity: 0.72,
      },
      emphasis: {
        itemStyle: {
          opacity: 0.95,
        },
      },
      z: 1,
    }
  })
}

const chartOption = computed<EChartsOption>(() => {
  const isDark = colorMode.value === 'dark'
  const textColor = isDark ? '#d1d5db' : '#374151'
  const gridColor = isDark ? '#4b5563' : '#e5e7eb'

  // --- 基金走势：按日期建索引 ---
  const fundByDate = new Map<string, HoldingHistoryPoint>()
  props.history.forEach(p => fundByDate.set(p.date, p))

  // --- 统一时间轴：基金日期 ∪ 板块日期 ∪ RSI 日期 ∪ 布林带信号日期（yyyy-MM-dd 字符串排序即等价于时间排序） ---
  const fundDates = props.history.map(p => p.date)
  const sectorDates = hasSector.value ? props.sectorHistory!.dates : []
  const rsiDates = hasRsi.value ? props.rsiData!.dates : []
  const bollingerDates = hasBollinger.value
    ? [...props.bollingerData!.buy, ...props.bollingerData!.sell].map(p => p.date)
    : []
  const allDates = (hasSector.value || hasRsi.value || hasBollinger.value)
    ? Array.from(new Set([...fundDates, ...sectorDates, ...rsiDates, ...bollingerDates])).sort()
    : fundDates

  // 基金序列对齐到 allDates（板块独有日期补 null）
  const pointAt = (d: string) => fundByDate.get(d)
  const navData = allDates.map(d => pointAt(d)?.nav ?? null)
  const ma5Data = allDates.map(d => pointAt(d)?.ma5 ?? null)
  const ma10Data = allDates.map(d => pointAt(d)?.ma10 ?? null)
  const ma20Data = allDates.map(d => pointAt(d)?.ma20 ?? null)
  const ma120Data = allDates.map(d => pointAt(d)?.ma120 ?? null)

  const transactionBarSeries = buildTransactionBarSeries(allDates)

  // --- 板块主力行为数据（可选）：按日期建索引并对齐到 allDates ---
  const sectorByDate = new Map<string, { strength: number | null, capital: number | null, hidden: number | null, retail: number | null, action: string }>()
  if (hasSector.value) {
    const h = props.sectorHistory!
    h.dates.forEach((d, i) => {
      sectorByDate.set(d, {
        strength: h.mainStrength[i] ?? null,
        capital: h.mainCapital[i] ?? null,
        hidden: h.mainHidden[i] ?? null,
        retail: h.retailCapital[i] ?? null,
        action: h.actions[i] ?? '',
      })
    })
  }
  const strengthData = allDates.map(d => sectorByDate.get(d)?.strength ?? null)
  const capitalData = allDates.map(d => sectorByDate.get(d)?.capital ?? null)
  const hiddenData = allDates.map(d => sectorByDate.get(d)?.hidden ?? null)
  const retailData = allDates.map(d => sectorByDate.get(d)?.retail ?? null)

  // --- RSI 策略数据（可选）：按日期建索引并对齐到 allDates ---
  const rsiByDate = new Map<string, number | null>()
  if (hasRsi.value) {
    props.rsiData!.dates.forEach((d, i) => {
      rsiByDate.set(d, props.rsiData!.rsiValues[i] ?? null)
    })
  }
  const rsiLineData = allDates.map(d => rsiByDate.get(d) ?? null)
  const rsiSeriesName = hasRsi.value ? `RSI(${props.rsiData!.config.rsiPeriod})` : null

  // 主力行为 markPoint（仅在有强度的日期标注抢/建/洗/出）
  const actionMarks = hasSector.value
    ? (props.sectorHistory!.dates
        .map((date, i) => {
          const action = props.sectorHistory!.actions[i]
          const strength = props.sectorHistory!.mainStrength[i]
          const style = action ? sectorActionStyle[action] : null
          if (!style || strength === null || strength === undefined)
            return null
          return {
            coord: [date, strength],
            itemStyle: { color: style.color },
            label: { formatter: style.label },
          }
        })
        .filter(Boolean) as { coord: [string, number], itemStyle: { color: string }, label: { formatter: string } }[])
    : []

  const strengthMaxAbs = strengthData
    .filter((v): v is number => v !== null && v !== undefined)
    .reduce((max, v) => Math.max(max, Math.abs(v)), 0) || 1

  // 统一的 tooltip：合并基金走势与板块主力行为信息
  const tooltipFormatter = (params: any) => {
    const list = Array.isArray(params) ? params : [params]
    if (list.length === 0)
      return ''

    const date = list[0]?.axisValueLabel || list[0]?.axisValue || ''
    const lines = [`<b>${date}</b>`]

    const sectorInfo = sectorByDate.get(date)
    if (sectorInfo?.action) {
      const c = sectorActionStyle[sectorInfo.action]?.color || '#999'
      lines.push(`<span style="display:inline-block;padding:1px 5px;border-radius:3px;color:#fff;background:${c};font-size:11px">${sectorInfo.action}</span>`)
    }

    const seriesOrder = ['净值', 'MA5', 'MA10', 'MA20', 'MA120', '买入', '卖出', '转入', '转出', '主力强度', '主力资金', '主力暗盘', '散户资金', ...(rsiSeriesName ? [rsiSeriesName] : [])]

    list
      .filter((item: any) => item?.value !== null && item?.value !== undefined)
      .filter((item: any) => item.seriesName !== '布林带信号') // 布林带子图的透明承载序列不参与坐标轴 tooltip
      .sort((a: any, b: any) => seriesOrder.indexOf(a.seriesName) - seriesOrder.indexOf(b.seriesName))
      .forEach((item: any) => {
        if (item.seriesType === 'bar') {
          const amount = Number(item.value)
          if (Number.isNaN(amount) || amount === 0)
            return
          const absAmount = Math.abs(amount)
          const direction = amount < 0 ? '流出' : '流入'
          lines.push(`${item.marker}${item.seriesName}: ${formatCurrency(absAmount)} <span style="color:${textColor}">(${direction})</span>`)
          return
        }

        if (item.seriesName === '净值') {
          lines.push(`${item.marker}净值: ${Number(item.value).toFixed(4)}`)
          return
        }

        if (item.seriesName === '主力强度') {
          const v = Number(item.value)
          const sign = v > 0 ? '+' : ''
          lines.push(`${item.marker}主力强度: ${sign}${v.toFixed(2)}%`)
          return
        }

        if (item.seriesName === '主力资金' || item.seriesName === '主力暗盘' || item.seriesName === '散户资金') {
          const v = Number(item.value)
          const sign = v > 0 ? '+' : ''
          lines.push(`${item.marker}${item.seriesName}: ${sign}${v.toFixed(2)} 亿`)
          return
        }

        if (rsiSeriesName && item.seriesName === rsiSeriesName) {
          lines.push(`${item.marker}${item.seriesName}: ${Number(item.value).toFixed(1)}`)
          return
        }

        if (typeof item.value === 'number') {
          lines.push(`${item.marker}${item.seriesName}: ${Number(item.value).toFixed(3)}`)
        }
      })

    return lines.join('<br/>')
  }

  // --- 基金走势序列（净值 + 均线 + 交易量柱），统一绑定到第 0 个网格 ---
  const fundSeries: any[] = [
    {
      name: '净值',
      type: 'line',
      xAxisIndex: 0,
      yAxisIndex: 0,
      data: navData,
      showSymbol: false,
      z: 3,
      markPoint: {
        symbolKeepAspect: true,
        data: [
          ...mapSignalsToMarkPoints('买入')!,
          ...mapSignalsToMarkPoints('卖出')!,
          ...mapTransactionsToMarkPoints()!,
        ],
        tooltip: {
          formatter: (params: any) => {
            if (params.data && params.data.fullData) {
              const data = params.data.fullData
              return `<b>${data.signal}信号 (ID: ${data.id})</b><br/>日期: ${data.latestDate}<br/>净值: ${Number(data.latestClose).toFixed(4)}<br/>原因: ${data.reason}`
            }
            return params.name
          },
        },
        zlevel: 10,
      },
    },
    { name: 'MA5', type: 'line', xAxisIndex: 0, yAxisIndex: 0, data: ma5Data, showSymbol: false, lineStyle: { type: 'dashed' }, z: 3 },
    { name: 'MA10', type: 'line', xAxisIndex: 0, yAxisIndex: 0, data: ma10Data, showSymbol: false, lineStyle: { type: 'dashed' }, z: 3 },
    { name: 'MA20', type: 'line', xAxisIndex: 0, yAxisIndex: 0, data: ma20Data, showSymbol: false, lineStyle: { type: 'dashed' }, z: 3 },
    { name: 'MA120', type: 'line', xAxisIndex: 0, yAxisIndex: 0, data: ma120Data, showSymbol: false, lineStyle: { type: 'dashed' }, z: 3 },
    ...transactionBarSeries,
  ]

  // --- 无板块、无 RSI 且无布林带数据：保持原有单图布局，行为与之前一致 ---
  if (!hasSector.value && !hasRsi.value && !hasBollinger.value) {
    return {
      title: { text: props.title, left: 'center', textStyle: { color: textColor } },
      tooltip: { trigger: 'axis', axisPointer: { type: 'cross' }, formatter: tooltipFormatter },
      // 默认 plain 图例在宽度不足时自动换行，避免滚动条挤压
      legend: {
        data: ['净值', 'MA5', 'MA10', 'MA20', 'MA120', '买入', '卖出', '转入', '转出'],
        top: 40,
        textStyle: { color: textColor },
      },
      grid: { top: 96, left: '10%', right: '12%', bottom: '18%' },
      xAxis: { type: 'category', data: allDates, axisLabel: { color: textColor }, axisLine: { lineStyle: { color: gridColor } } },
      yAxis: [
        {
          type: 'value',
          scale: true,
          axisLabel: { color: textColor, formatter: (val: number) => val.toFixed(3) },
          splitLine: { lineStyle: { color: gridColor } },
        },
        {
          type: 'value',
          scale: true,
          position: 'right',
          axisLabel: { color: textColor, formatter: (val: number) => formatCurrency(val, { minimumFractionDigits: 0, maximumFractionDigits: 0 }) },
          splitLine: { show: false },
          axisLine: { lineStyle: { color: gridColor } },
        },
      ],
      dataZoom: [
        { type: 'inside', start: props.dataZoomStart, end: props.dataZoomEnd, zoomOnMouseWheel: false },
        { type: 'slider', start: props.dataZoomStart, end: props.dataZoomEnd, top: 'auto', bottom: 10, height: 25 },
      ],
      series: fundSeries,
    } as EChartsOption
  }

  // --- 多子图布局：主图(净值)下方依次叠加 RSI / 布林带信号 / 板块主力强度 / 主力资金子图，共享时间轴 ---
  interface SubPanel {
    key: string
    /** 子图高度占整个图表的百分比 */
    height: number
    yAxis: Record<string, any>
    series: Record<string, any>[]
  }
  const subPanels: SubPanel[] = []

  if (hasRsi.value) {
    const { config, signals } = props.rsiData!
    // RSI 信号点：以信号日期回查 RSI 值，标注在 RSI 曲线上（买入位于超卖区、卖出位于超买区）
    const rsiAt = (d: string) => rsiByDate.get(d) ?? null
    const rsiSignalMarks = [
      ...signals.buy.map((p) => {
        const v = rsiAt(p.coord[0])
        return v === null ? null : { name: '买入', coord: [p.coord[0], v], symbol: 'pin', itemStyle: { color: '#ef4444' } }
      }),
      ...signals.sell.map((p) => {
        const v = rsiAt(p.coord[0])
        return v === null ? null : { name: '卖出', coord: [p.coord[0], v], symbol: 'triangle', symbolRotate: 180, itemStyle: { color: '#22c55e' } }
      }),
    ].filter(Boolean) as { name: string, coord: [string, number], symbol: string, symbolRotate?: number, itemStyle: { color: string } }[]

    subPanels.push({
      key: 'rsi',
      height: 13,
      yAxis: {
        type: 'value',
        min: 0,
        max: 100,
        axisLine: { show: true, lineStyle: { color: gridColor } },
        splitLine: { lineStyle: { color: gridColor } },
        axisLabel: { color: textColor },
      },
      series: [
        {
          name: rsiSeriesName!,
          type: 'line',
          data: rsiLineData,
          showSymbol: false,
          lineStyle: { color: '#8b5cf6', width: 1.5 },
          markLine: {
            silent: true,
            symbol: 'none',
            data: [
              { yAxis: config.rsiUpper, lineStyle: { color: '#f87171', type: 'dashed' }, label: { formatter: `超买: ${config.rsiUpper}`, fontSize: 10 } },
              { yAxis: config.rsiLower, lineStyle: { color: '#4ade80', type: 'dashed' }, label: { formatter: `超卖: ${config.rsiLower}`, fontSize: 10 } },
            ],
          },
          markArea: {
            silent: true,
            itemStyle: { opacity: 0.12 },
            data: [
              [{ yAxis: config.rsiUpper, itemStyle: { color: '#ef4444' } }, { yAxis: 100 }],
              [{ yAxis: config.rsiLower, itemStyle: { color: '#22c55e' } }, { yAxis: 0 }],
            ],
          },
          markPoint: {
            symbolSize: 18,
            data: rsiSignalMarks,
            label: {
              show: true,
              color: '#fff',
              fontSize: 10,
              fontWeight: 'bold' as const,
              formatter: (p: any) => (p.name === '买入' ? 'B' : 'S'),
            },
          },
        },
      ],
    })
  }

  // 布林带子图：淡色净值线作参照，其上标注放大版买入/卖出信号点（B/S，可点击查看信号详情）
  if (hasBollinger.value) {
    const bollingerSignalMarks = [
      ...props.bollingerData!.buy.map(p => ({ name: '买入', coord: [p.date, p.close], symbol: 'pin', itemStyle: { color: '#ef4444' }, fullData: p.signal })),
      ...props.bollingerData!.sell.map(p => ({ name: '卖出', coord: [p.date, p.close], symbol: 'triangle', symbolRotate: 180, itemStyle: { color: '#22c55e' }, fullData: p.signal })),
    ]
    subPanels.push({
      key: 'bollinger',
      height: 9,
      yAxis: {
        type: 'value',
        scale: true,
        axisLine: { show: true, lineStyle: { color: gridColor } },
        splitLine: { lineStyle: { color: gridColor } },
        axisLabel: { color: textColor, formatter: (val: number) => val.toFixed(3) },
      },
      series: [
        {
          name: '布林带信号',
          type: 'line',
          data: navData, // 与主图相同的净值序列，子图内作参照线
          showSymbol: false,
          lineStyle: { color: '#64748b', width: 1.5, opacity: 0.85 },
          markPoint: {
            symbolSize: 30,
            data: bollingerSignalMarks,
            label: {
              show: true,
              color: '#fff',
              fontSize: 12,
              fontWeight: 'bold' as const,
              formatter: (p: any) => (p.name === '买入' ? 'B' : 'S'),
            },
            tooltip: {
              formatter: (params: any) => {
                if (params.data?.fullData) {
                  const d = params.data.fullData
                  return `<b>${d.signal}信号 (ID: ${d.id})</b><br/>日期: ${d.latestDate}<br/>净值: ${Number(d.latestClose).toFixed(4)}<br/>原因: ${d.reason}`
                }
                return params.name
              },
            },
          },
        },
      ],
    })
  }

  if (hasSector.value) {
    subPanels.push(
      {
        key: 'strength',
        height: 10,
        yAxis: {
          type: 'value',
          axisLine: { show: true, lineStyle: { color: gridColor } },
          splitLine: { lineStyle: { color: gridColor } },
          axisLabel: { color: textColor, formatter: '{value}%' },
        },
        series: [
          {
            name: '主力强度',
            type: 'line',
            data: strengthData,
            showSymbol: false,
            lineStyle: { width: 2 },
            markLine: {
              silent: true,
              symbol: 'none',
              data: [{ yAxis: 0, lineStyle: { color: gridColor, type: 'dashed' } }],
            },
            markPoint: {
              symbol: 'circle',
              symbolSize: 22,
              data: actionMarks,
              label: {
                show: true,
                color: '#fff',
                fontSize: 11,
                fontWeight: 'bold' as const,
              },
            },
          },
        ],
      },
      {
        key: 'capital',
        height: 8,
        yAxis: {
          type: 'value',
          axisLine: { show: true, lineStyle: { color: gridColor } },
          splitLine: { lineStyle: { color: gridColor } },
          axisLabel: { color: textColor },
        },
        series: [
          {
            name: '主力资金',
            type: 'line',
            data: capitalData,
            showSymbol: false,
            lineStyle: { color: '#ef4444', width: 1.5 },
          },
          {
            name: '主力暗盘',
            type: 'line',
            data: hiddenData,
            showSymbol: false,
            lineStyle: { color: '#f97316', width: 1.5 },
          },
          {
            name: '散户资金',
            type: 'line',
            data: retailData,
            showSymbol: false,
            lineStyle: { color: '#3b82f6', width: 1.5 },
          },
        ],
      },
    )
  }

  // 网格纵向布局：标题/图例区（预留图例换行空间） → 主图 → 各子图 → 缩放条
  const TOP_AREA = 13
  const BOTTOM_AREA = 8
  const GRID_GAP = 3
  const subHeightTotal = subPanels.reduce((sum, p) => sum + p.height, 0)
  const mainHeight = 100 - TOP_AREA - BOTTOM_AREA - subHeightTotal - GRID_GAP * (subPanels.length + 1)

  const grids: Record<string, any>[] = [{ top: `${TOP_AREA}%`, left: '8%', right: '9%', height: `${mainHeight}%` }]
  const xAxes: Record<string, any>[] = [
    { type: 'category', gridIndex: 0, data: allDates, axisLabel: { show: false }, axisLine: { lineStyle: { color: gridColor } } },
  ]
  const yAxes: Record<string, any>[] = [
    {
      type: 'value',
      gridIndex: 0,
      scale: true,
      axisLine: { show: true, lineStyle: { color: gridColor } },
      axisLabel: { color: textColor, formatter: (val: number) => val.toFixed(3) },
      splitLine: { lineStyle: { color: gridColor } },
    },
    {
      type: 'value',
      gridIndex: 0,
      scale: true,
      position: 'right',
      axisLine: { lineStyle: { color: gridColor } },
      axisLabel: { color: textColor, formatter: (val: number) => formatCurrency(val, { minimumFractionDigits: 0, maximumFractionDigits: 0 }) },
      splitLine: { show: false },
    },
  ]
  const multiSeries: any[] = [...fundSeries]
  const zoomXAxisIndexes = [0]
  // 各子图首序列在 series 数组中的下标，供 visualMap 定位主力强度序列
  const panelSeriesStart = new Map<string, number>()

  let cursorTop = TOP_AREA + mainHeight + GRID_GAP
  subPanels.forEach((panel, i) => {
    const gridIndex = i + 1
    const yAxisIndex = yAxes.length
    grids.push({ top: `${cursorTop}%`, left: '8%', right: '9%', height: `${panel.height}%` })
    xAxes.push({
      type: 'category',
      gridIndex,
      data: allDates,
      axisLine: { lineStyle: { color: gridColor } },
      // 仅最后一个子图显示 x 轴日期标签，其余与主图共享视觉对齐
      axisLabel: i === subPanels.length - 1 ? { color: textColor } : { show: false },
    })
    yAxes.push({ gridIndex, ...panel.yAxis })
    panelSeriesStart.set(panel.key, multiSeries.length)
    panel.series.forEach(s => multiSeries.push({ ...s, xAxisIndex: gridIndex, yAxisIndex }))
    zoomXAxisIndexes.push(gridIndex)
    cursorTop += panel.height + GRID_GAP
  })

  const strengthSeriesIndex = panelSeriesStart.get('strength') ?? -1
  const legendData = ['净值', 'MA5', 'MA10', 'MA20', 'MA120', '买入', '卖出', '转入', '转出']
  if (rsiSeriesName)
    legendData.push(rsiSeriesName)
  if (hasSector.value)
    legendData.push('主力强度', '主力资金', '主力暗盘', '散户资金')

  return {
    title: { text: props.title, left: 'center', textStyle: { color: textColor } },
    tooltip: { trigger: 'axis', axisPointer: { type: 'cross' }, formatter: tooltipFormatter },
    // 默认 plain 图例在宽度不足时自动换行，避免滚动条挤压
    legend: {
      data: legendData,
      top: 40,
      textStyle: { color: textColor },
    },
    axisPointer: { link: [{ xAxisIndex: 'all' }] },
    ...(strengthSeriesIndex !== -1
      ? {
          visualMap: {
            show: false,
            type: 'continuous',
            seriesIndex: strengthSeriesIndex,
            min: -strengthMaxAbs,
            max: strengthMaxAbs,
            calculable: false,
            inRange: { color: [STRENGTH_COLOR_NEG, STRENGTH_COLOR_POS] },
          },
        }
      : {}),
    grid: grids,
    xAxis: xAxes,
    yAxis: yAxes,
    dataZoom: [
      { type: 'inside', xAxisIndex: zoomXAxisIndexes, start: props.dataZoomStart, end: props.dataZoomEnd, zoomOnMouseWheel: false },
      { type: 'slider', xAxisIndex: zoomXAxisIndexes, start: props.dataZoomStart, end: props.dataZoomEnd, bottom: 8, height: 22 },
    ],
    series: multiSeries,
  } as EChartsOption
})

function handleChartClick(params: any) {
  if (params.componentType === 'markPoint' && params.data) {
    if (params.data.fullData) {
      emit('signal-click', params.data.fullData)
    }
    // 检查 transactionList
    else if (params.data.transactionList) {
      emit('transaction-click', params.data.transactionList)
    }
  }
}
</script>

<template>
  <VChartFull class="w-full" :class="chartHeightClass" :option="chartOption" autoresize @click="handleChartClick" />
</template>
