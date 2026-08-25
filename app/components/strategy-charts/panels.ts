import type { BollingerSignalData, RsiChartData } from '~/types/chart'
import type { SectorCapitalHistoryResponse } from '~/types/sector'
import { SECTOR_ACTION_STYLE } from '~/utils/sectorStyle'

/**
 * 多子图布局中的子面板定义与构建器。
 * 每个子图(RSI / 布林带信号 / 板块主力行为)构建为一个 SubPanel，
 * 再交由 layout.ts 统一装配 grid / 坐标轴 / series。
 */

export interface SubPanel {
  key: string
  /** 子图高度占整个图表的百分比 */
  height: number
  yAxis: Record<string, any>
  series: Record<string, any>[]
}

/** 板块主力行为按日期索引的对齐数据（由 FundChart 预先对齐到统一时间轴） */
export interface SectorAlignedData {
  strength: number | null
  capital: number | null
  hidden: number | null
  retail: number | null
  action: string
}

/** 构建主力行为 markPoint（仅在有强度的日期标注抢/建/洗/出） */
export function buildActionMarks(history: SectorCapitalHistoryResponse['history']) {
  return (history.dates
    .map((date, i) => {
      const action = history.actions[i]
      const strength = history.mainStrength[i]
      const style = action ? SECTOR_ACTION_STYLE[action] : null
      if (!style || strength === null || strength === undefined)
        return null
      return {
        coord: [date, strength],
        itemStyle: { color: style.color },
        label: { formatter: style.label },
      }
    })
    .filter(Boolean) as { coord: [string, number], itemStyle: { color: string }, label: { formatter: string } }[])
}

/** RSI 子图：RSI 曲线 + 超买/超卖参考线与色带 + 买卖信号点 */
export function buildRsiPanel(opts: {
  rsiData: RsiChartData
  rsiByDate: Map<string, number | null>
  rsiLineData: (number | null)[]
  gridColor: string
  textColor: string
}): SubPanel {
  const { config, signals } = opts.rsiData
  // RSI 信号点：以信号日期回查 RSI 值，标注在 RSI 曲线上（买入位于超卖区、卖出位于超买区）
  const rsiAt = (d: string) => opts.rsiByDate.get(d) ?? null
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

  return {
    key: 'rsi',
    height: 13,
    yAxis: {
      type: 'value',
      min: 0,
      max: 100,
      axisLine: { show: true, lineStyle: { color: opts.gridColor } },
      splitLine: { lineStyle: { color: opts.gridColor } },
      axisLabel: { color: opts.textColor },
    },
    series: [
      {
        name: `RSI(${config.rsiPeriod})`,
        type: 'line',
        data: opts.rsiLineData,
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
  }
}

/** 布林带子图：淡色净值线作参照，其上标注放大版买入/卖出信号点（B/S，可点击查看信号详情） */
export function buildBollingerPanel(opts: {
  bollingerData: BollingerSignalData
  navData: (number | null)[]
  gridColor: string
  textColor: string
}): SubPanel {
  const bollingerSignalMarks = [
    ...opts.bollingerData.buy.map(p => ({ name: '买入', coord: [p.date, p.close], symbol: 'pin', itemStyle: { color: '#ef4444' }, fullData: p.signal })),
    ...opts.bollingerData.sell.map(p => ({ name: '卖出', coord: [p.date, p.close], symbol: 'triangle', symbolRotate: 180, itemStyle: { color: '#22c55e' }, fullData: p.signal })),
  ]

  return {
    key: 'bollinger',
    height: 9,
    yAxis: {
      type: 'value',
      scale: true,
      axisLine: { show: true, lineStyle: { color: opts.gridColor } },
      splitLine: { lineStyle: { color: opts.gridColor } },
      axisLabel: { color: opts.textColor, formatter: (val: number) => val.toFixed(3) },
    },
    series: [
      {
        name: '布林带信号',
        type: 'line',
        data: opts.navData, // 与主图相同的净值序列，子图内作参照线
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
  }
}

/** 板块主力行为子图：主力强度(带行为标注) + 资金(主力/暗盘/散户)双面板 */
export function buildSectorPanels(opts: {
  history: SectorCapitalHistoryResponse['history']
  sectorByDate: Map<string, SectorAlignedData>
  allDates: string[]
  gridColor: string
  textColor: string
}): SubPanel[] {
  const strengthData = opts.allDates.map(d => opts.sectorByDate.get(d)?.strength ?? null)
  const capitalData = opts.allDates.map(d => opts.sectorByDate.get(d)?.capital ?? null)
  const hiddenData = opts.allDates.map(d => opts.sectorByDate.get(d)?.hidden ?? null)
  const retailData = opts.allDates.map(d => opts.sectorByDate.get(d)?.retail ?? null)
  const actionMarks = buildActionMarks(opts.history)

  return [
    {
      key: 'strength',
      height: 10,
      yAxis: {
        type: 'value',
        axisLine: { show: true, lineStyle: { color: opts.gridColor } },
        splitLine: { lineStyle: { color: opts.gridColor } },
        axisLabel: { color: opts.textColor, formatter: '{value}%' },
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
            data: [{ yAxis: 0, lineStyle: { color: opts.gridColor, type: 'dashed' } }],
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
        axisLine: { show: true, lineStyle: { color: opts.gridColor } },
        splitLine: { lineStyle: { color: opts.gridColor } },
        axisLabel: { color: opts.textColor },
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
  ]
}
