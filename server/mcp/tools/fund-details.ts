import { format, subDays } from 'date-fns'
import { desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { funds, sectorBindings, sectorCapitalHistory, strategySignals } from '~~/server/database/schemas'
import { useDb } from '~~/server/utils/db'
import { getHistoryWithMA } from '~~/server/utils/holdingAnalysis'
import { computeBiasPct, computeRsi } from '~~/server/utils/indicators'
import { buildMcpMeta } from '~~/server/utils/mcpMeta'

// 定义包含动态 MA 属性的接口
interface FundHistoryPoint {
  date: string
  nav: number
  ma5?: number
  ma20?: number
  ma60?: number
  ma250?: number
  [key: string]: any // 允许其他动态属性
}

/** recent_price_action 返回的交易日数：默认与历史行为一致 (10)，最大 250 */
const DAYS_DEFAULT = 10
const DAYS_MAX = 250
/** 需要本地计算的均线周期 (ma250=年线) */
const MA_PERIODS = [5, 20, 60, 250]
/** 本地计算的 RSI 周期，与主流基金 App 展示口径一致 */
const RSI_PERIODS = [6, 12, 24]
/** 净值序列需要覆盖的交易日 = days + MA250 预热 + RSI24 预热；交易日->自然日按 1.5 倍放大 */
const WARMUP_TRADING_DAYS = 250 + 120

/**
 * 将策略引擎返回的中文信号归一化为固定枚举。
 * buy=买入/加仓, hold=持有/观望, sell=卖出/减仓
 */
function toSignalEnum(raw: string | null | undefined): 'buy' | 'hold' | 'sell' | 'unknown' {
  if (!raw)
    return 'unknown'
  const s = raw.trim()
  if (s.includes('买'))
    return 'buy'
  if (s.includes('卖'))
    return 'sell'
  if (s.includes('持有') || s.includes('观望'))
    return 'hold'
  return 'unknown'
}

export default defineMcpTool({
  name: 'get_fund_details',
  description: `获取指定基金的深度诊断信息（净值/均线/RSI/策略信号/所属板块主力资金），一次调用返回一只基金。所有响应都包在 { meta, data } 外壳中：meta.as_of 为主数据（净值）基准日，meta.staleness 声明各区块新鲜度，所有百分比类字段均为"百分数数值"（-3.10 表示 -3.10%，不是 -0.031），金额币种为人民币 CNY。

【返回内容清单】
1) info：code/name、sector（项目板块标签）、fund_type（open=普通场外, qdii_lof=场内/QDII）、operation_strategy（基金级全局操作策略文本，null=未设置）、latest_nav（最新已确认单位净值，单位元/份）、latest_date 与 nav_as_of（均为该净值日期，yyyy-MM-dd）。
2) technical_analysis（基于已确认净值序列，基准日见 as_of 字段）：ma5/ma20/ma60/ma250（移动均线，单位元/份；ma250 即年线，基金历史净值不足 250 个交易日时为 null）；bias_20_pct 与 bias_250_pct（20/250 日乖离率，数值单位 %，如 -3.10 表示净值低于对应均线 3.10%）；bias_20（旧版带 % 号的字符串字段，仅为兼容保留，已弃用，勿再解析）；rsi_6/rsi_12/rsi_24（6/12/24 日 RSI，0-100 数值，按 Wilder 平滑 SMA(X,N,1) 口径计算，与主流行情 App 展示的 RSI(6/12/24) 口径一致，平盘或数据不足时为 null）；trend（净值相对 MA20 的位置：Bullish (Above MA20) / Bearish (Below MA20) / Unknown）。
3) strategy_signals：策略引擎（外部 Python 服务）每日生成的信号，键为策略名 rsi / bollinger_bands。每条含 signal（引擎原始中文文本，如 "买入"/"卖出"/"持有/观望"，已弃用，勿依赖）、signal_enum（固定枚举 buy/hold/sell/unknown，由 signal 归一化而来）、as_of 与 date（信号对应的交易日）、reason（引擎给出的中文解释，是信号的最权威说明）、metrics（引擎指标原文）。bollinger_bands.metrics 额外注入 bband_mid_period 字段：布林带周期为 50，即 bband_mid = MA50，与 technical_analysis.ma20 是两个不同价位的均线，不可互相替代；bband_mid/bband_upper/bband_lower 单位为元/份，bband_dev_factor 为标准差倍数。
4) sector_capital：基金所属板块（东财板块）的主力资金行为，为最新交易日 (T-0) 数据，基准日见 capital_as_of 与 latest.date。latest 含 main_action（板块主力行为枚举文本：抢筹/建仓/洗盘/出货）、main_capital/retail_capital/main_hidden（主力净流入/散户净流入/主力暗盘，单位亿元人民币，正=净流入，负=净流出）、change_percent（板块当日涨跌幅，单位 %）、main_strength（主力强度，单位 %）；recent_trend 为最近 10 个交易日升序序列。bound=false 表示该基金未绑定东财板块，此时无资金数据。
5) recent_price_action：最近 days 个交易日的净值序列（升序，含 date/nav/ma5/ma20，单位元/份）；recent_price_action_meta 说明请求与实际返回行数。

【已知限制】基金净值为 T-1（净值当晚才公布），sector_capital 为 T-0，两者相差一个交易日，做联合判断时务必对齐各自 as_of；rsi_6/12/24 是本服务按净值序列计算，strategy_signals.rsi 是策略引擎的 RSI(14)（其 metrics.rsi_period=14），周期不同、数值不可互换，也与用户在 App 上看到的 6/12/24 日 RSI 数值不同；QDII 基金净值披露更晚（T-1 或 T-2）。

【典型误用警示】不要把 bias_20_pct/bias_250_pct 当绝对价差（它们是百分比）；不要把布林中轨 bband_mid 当成 MA20；不要把 strategy_signals 的 signal 文本当枚举（请用 signal_enum）；signal_enum 与 reason 语义冲突时（如"买入"但 reason 说"继续持有"），以 reason 为准并在结论中说明分歧。`,
  inputSchema: {
    fundCode: z.string().describe('基金代码 (例如 "161725")'),
    days: z.number().int().min(1).max(DAYS_MAX).optional().default(DAYS_DEFAULT).describe(`返回最近 N 个交易日的净值序列 (recent_price_action)。默认 ${DAYS_DEFAULT}，最大 ${DAYS_MAX}。注意单位是"交易日"而非自然日；该参数不影响 technical_analysis 等区块，它们始终基于最新数据计算。`),
  },
  handler: async ({ fundCode, days }) => {
    // 1. 认证检查
    const event = useEvent()
    const userId = event.context.userId

    if (!userId) {
      return {
        isError: true,
        content: [{
          type: 'text',
          text: 'Authentication required. Please provide a valid API key.',
        }],
      }
    }

    const db = useDb()

    // 2. 获取基金基础信息
    const fund = await db.query.funds.findFirst({
      where: eq(funds.code, fundCode),
    })

    if (!fund) {
      return {
        isError: true,
        content: [{ type: 'text', text: `未找到基金代码: ${fundCode}。请确认该基金已添加到系统中。` }],
      }
    }

    // 3. 获取历史净值与均线
    // 查询窗口需覆盖: days 个交易日展示 + MA250/RSI24 计算预热，交易日按 1.5 倍自然日估算
    const requestedDays = days ?? DAYS_DEFAULT
    const endDate = format(new Date(), 'yyyy-MM-dd')
    const queryDays = Math.ceil((requestedDays + WARMUP_TRADING_DAYS) * 1.5)
    const startDate = format(subDays(new Date(), queryDays), 'yyyy-MM-dd')

    // 使用 'as' 关键字强制转换类型，告诉 TS 这里包含了 ma5/ma20 等字段
    const history = (await getHistoryWithMA(fundCode, startDate, endDate, MA_PERIODS)) as FundHistoryPoint[]

    // 4. 获取最新策略信号
    const rawSignals = await db.query.strategySignals.findMany({
      where: eq(strategySignals.fundCode, fundCode),
      orderBy: [desc(strategySignals.latestDate)],
      limit: 10,
    })

    const activeSignals: Record<string, any> = {}
    rawSignals.forEach((s) => {
      if (!activeSignals[s.strategyName]) {
        const metrics = (s.metrics && typeof s.metrics === 'object') ? { ...s.metrics as Record<string, any> } : {}
        // 布林带中轨周期显式化：bband_period=50，即中轨=MA50，与 ma20 不是同一条均线
        if (s.strategyName === 'bollinger_bands' && metrics.bband_period != null)
          metrics.bband_mid_period = metrics.bband_period

        activeSignals[s.strategyName] = {
          signal: s.signal, // 引擎原始中文文本（弃用，仅为兼容保留）
          signal_enum: toSignalEnum(s.signal), // 固定枚举 buy/hold/sell
          date: s.latestDate,
          as_of: s.latestDate, // 信号基准日，与 date 相同，显式命名便于客户端定位
          reason: s.reason,
          metrics,
        }
      }
    })

    // 5. 获取该基金所属板块的主力资金行为
    // fund.sector 为项目板块 dictValue，需先通过 sector_bindings 找到对应东财板块代码，
    // 再从 sector_capital_daily 取最近的主力资金快照（与 /api/sectors/[dictValue]/history 逻辑一致）。
    let sectorCapital: Record<string, any> = { bound: false }
    if (fund.sector) {
      const binding = await db.query.sectorBindings.findFirst({
        where: eq(sectorBindings.dictValue, fund.sector),
      })

      if (binding) {
        // 取最近 10 条（按日期倒序），随后反转为升序便于阅读短期趋势
        const recentRecords = await db.query.sectorCapitalHistory.findMany({
          where: eq(sectorCapitalHistory.sectorCode, binding.sectorCode),
          orderBy: [desc(sectorCapitalHistory.date)],
          limit: 10,
        })
        recentRecords.reverse()

        // 升序后最后一条即最新交易日
        const latestRecord = recentRecords[recentRecords.length - 1]
        sectorCapital = {
          sector: fund.sector,
          bound: true,
          sector_code: binding.sectorCode,
          sector_name: binding.sectorName ?? latestRecord?.sectorName ?? null,
          sector_type: binding.sectorType,
          // 资金数据基准日（最新交易日），与净值基准日 (nav_as_of) 相差约一个交易日
          capital_as_of: latestRecord?.date ?? null,
          unit: {
            main_capital: '亿元',
            retail_capital: '亿元',
            main_hidden: '亿元',
            change_percent: '%',
            main_strength: '%',
          },
          latest: latestRecord
            ? {
                date: latestRecord.date,
                main_action: latestRecord.mainAction, // 抢筹 / 建仓 / 洗盘 / 出货
                main_strength: latestRecord.mainStrength !== null ? Number(latestRecord.mainStrength) : null,
                main_capital: latestRecord.mainCapital !== null ? Number(latestRecord.mainCapital) : null,
                retail_capital: latestRecord.retailCapital !== null ? Number(latestRecord.retailCapital) : null,
                main_hidden: latestRecord.mainHidden !== null ? Number(latestRecord.mainHidden) : null,
                change_percent: latestRecord.changePercent !== null ? Number(latestRecord.changePercent) : null,
              }
            : null,
          recent_trend: recentRecords.map(r => ({
            date: r.date,
            main_action: r.mainAction,
            main_strength: r.mainStrength !== null ? Number(r.mainStrength) : null,
          })),
        }
      }
      else {
        sectorCapital = { sector: fund.sector, bound: false }
      }
    }

    // 6. 组装返回数据
    // history 是按时间正序排列的 (旧 -> 新)，所以最后一个是最新的
    const currentPoint = history.length > 0 ? history.at(-1) : null
    const navAsOf = currentPoint?.date ?? null

    // 乖离率：数值型 (%)，两位小数；均线缺失时为 null
    const bias20Pct = computeBiasPct(currentPoint?.nav, currentPoint?.ma20)
    const bias250Pct = computeBiasPct(currentPoint?.nav, currentPoint?.ma250)

    // 旧版 bias_20 为带 % 的字符串，仅为向后兼容保留（弃用）
    const bias20Legacy = bias20Pct === null ? 'N/A' : `${bias20Pct.toFixed(2)}%`

    // 本地计算 RSI 6/12/24（Wilder 口径，与主流行情 App 一致）
    const closes = history.map(h => h.nav)
    const rsiByPeriod: Record<string, number | null> = {}
    for (const p of RSI_PERIODS)
      rsiByPeriod[`rsi_${p}`] = computeRsi(closes, p)

    // 简化历史数据（升序，旧 -> 新）
    const recentHistory = history.slice(-requestedDays).map(h => ({
      date: h.date,
      nav: h.nav,
      ma5: h.ma5,
      ma20: h.ma20,
    }))

    // [优化] 计算趋势描述
    const trendDescription = (currentPoint?.nav && currentPoint?.ma20)
      ? (currentPoint.nav > currentPoint.ma20 ? 'Bullish (Above MA20)' : 'Bearish (Below MA20)')
      : 'Unknown'

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          meta: buildMcpMeta({
            asOf: navAsOf,
            asOfNote: 'meta.as_of 为最新已确认净值日期 (通常为 T-1)；板块资金基准日见 data.sector_capital.capital_as_of (通常为 T-0)；各策略信号基准日见 data.strategy_signals.*.as_of',
            staleness: { nav: 'T-1', strategy_signals: 'T-1 或更早 (见各信号 as_of)', sector_capital: 'T-0' },
          }),
          data: {
            info: {
              code: fund.code,
              name: fund.name,
              sector: fund.sector || '未分类',
              fund_type: fund.fundType,
              // 全局操作策略 (所有用户共享, 可通过 manage_fund_strategy 修改)
              operation_strategy: fund.operationStrategy || null,
              latest_nav: currentPoint?.nav,
              latest_date: currentPoint?.date,
              nav_as_of: navAsOf,
              price_unit: '元/份',
            },
            sector_capital: sectorCapital,
            technical_analysis: {
              as_of: navAsOf,
              price_basis: 'confirmed_nav (已确认官方净值，非盘中估算)',
              ma5: currentPoint?.ma5,
              ma20: currentPoint?.ma20,
              ma60: currentPoint?.ma60,
              ma250: currentPoint?.ma250,
              bias_20_pct: bias20Pct,
              bias_20: bias20Legacy, // deprecated: 旧版带 % 字符串，仅为兼容保留
              bias_250_pct: bias250Pct,
              ...rsiByPeriod,
              rsi_method: 'wilder_sma (通达信 SMA(X,N,1) 口径，与主流行情 App 的 RSI 一致)',
              trend: trendDescription,
            },
            strategy_signals: activeSignals,
            recent_price_action: recentHistory,
            recent_price_action_meta: {
              as_of: navAsOf,
              requested_days: requestedDays,
              returned_days: recentHistory.length,
              note: '升序排列 (旧 -> 新)，最后一行为最新交易日；行数少于 requested_days 说明该基金历史净值不足',
            },
          },
        }, null, 2),
      }],
    }
  },
})
