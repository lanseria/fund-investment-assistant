import { z } from 'zod'
import { getCachedMarketData } from '~~/server/utils/market'
import { buildMcpMeta } from '~~/server/utils/mcpMeta'
import { marketCodeKind, marketGroups } from '~~/shared/market'

/** 每个分组的报价时区/延迟说明（与 shared/market.ts 的 marketGroups 保持一一对应） */
const GROUP_TIME_BASIS: Record<string, string> = {
  'A 股': '报价时间为北京时间 (UTC+8)，盘中实时',
  '深市': '报价时间为北京时间 (UTC+8)，盘中实时',
  '港股': '报价时间为香港/北京时间 (UTC+8)，盘中实时',
  '美股': '报价时间为美东时间 (与北京时间约差 12 小时，夏令时 13 小时)，as_of 可能是北京的"昨天"',
  '日本': '延迟行情，报价时间为行情源给出的当地时间',
  '期货': '延迟行情，报价时间为行情源给出的当地时间 (COMEX/NYMEX 为美东)',
}

export default defineMcpTool({
  name: 'get_market_index',
  description: `获取大盘指数与代表性个股/ETF/期货的最新报价，用于判断大盘整体走势和市场情绪。所有响应都包在 { meta, data } 外壳中；data 以分组标签为键，每组是条目数组。以下分组与成员清单与实际返回一一对应（分组名=入参 group 值）：

【分组与成员】
- group="A"（键 "A 股"，北京时间，实时）：上证指数(sh000001)、沪深300(sh000300)、上证50(sh000016)、Ｂ股指数(sh000003)、科创50(sh000688)，全部 kind=index。
- group="B"（键 "深市"，北京时间，实时）：深证成指(sz399001)、创业板指(sz399006)、深证综指(sz399106)、成份Ｂ指(sz399003)，全部 kind=index。注意：本服务不提供中证1000。
- group="HK"（键 "港股"，港/北京时间，实时）：恒生指数(hkHSI, index)、GX恒生科技(hk02837, etf——恒生科技指数的 ETF 代理，非指数本身)、小米集团-W(hk01810, stock)、中芯国际(hk00981, stock)、阿里巴巴-W(hk09988, stock)、腾讯控股(hk00700, stock)。
- group="US"（键 "美股"，美东时间）：道琼斯(usDJI, index)、纳斯达克(usIXIC, index)、特斯拉(usTSLA, stock)、苹果(usAAPL, stock)、英伟达(usNVDA, stock)。
- group="JP"（键 "日本"，延迟行情）：日经指数期货(fuNIY, futures——日经225 的期货代理)。
- group="Futures"（键 "期货"，延迟行情，当地时间为准）：COMEX黄金(fuGC, futures)、NYMEX WTI原油(fuCL, futures)、泛美白银(usPAAS, stock)、白银ETF-iShares(usSLV, etf)。
- group="all"：以上全部分组（默认）。

【每个条目的字段】code（含市场前缀 sh/sz/hk/us/fu，如 sh000001、hk00700）、name、kind（index|stock|etf|futures）、price（指数为点位；个股/ETF/商品为当地计价价格）、changeAmount（较前一收盘的变动量，与 price 同单位）、changeRate（涨跌幅，数值单位 %，如 1.5 表示 +1.5%）、as_of（报价日期 yyyy-MM-dd，交易所当地时间口径）、time（报价时间 HH:mm:ss，交易所当地时区）、delayed（true=延迟行情）、datetime（报价完整时间）。

【已知限制】不同市场的 as_of 不同——美股/期货可能是北京的"昨天"，跨市场比较请以各条目 as_of 为准（meta.time_basis 说明每组时区）；条目 time 只有时刻没有日期，日期一律看 as_of；行情源缓存约 60 秒。

【典型误用警示】不要假设所有条目都是指数——HK/US 组含个股、ETF，JP/Futures 组是期货代理；不要把 GX恒生科技 ETF 当成恒生科技指数本身；Ｂ股指数(sh000003)与成份Ｂ指(sz399003)对情绪判断参考价值低；不要把 changeRate 当小数比率（0.58 表示 +0.58%）。`,
  inputSchema: {
    group: z.enum(['A', 'B', 'HK', 'US', 'JP', 'Futures', 'all']).optional().default('all').describe('指数分组: A=A股指数, B=深市指数, HK=港股(含个股/ETF), US=美股(含个股), JP=日经期货代理, Futures=期货(含个股/ETF), all=全部'),
  },
  handler: async ({ group }) => {
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

    try {
      const data = await getCachedMarketData()

      if (!data || Object.keys(data).length === 0) {
        return {
          isError: true,
          content: [{ type: 'text', text: '暂无市场数据，请稍后重试。' }],
        }
      }

      const groups = group === 'all'
        ? Object.keys(marketGroups) as (keyof typeof marketGroups)[]
        : [group] as (keyof typeof marketGroups)[]

      const result: Record<string, Array<{
        code: string
        name: string
        kind: string
        price: number
        changeAmount: number
        changeRate: number
        as_of: string | null
        time: string
        datetime: string | null
        delayed: boolean
      }>> = {}

      const timeBasis: Record<string, string> = {}
      const includedGroups: string[] = []

      for (const g of groups) {
        const groupConfig = marketGroups[g]
        if (!groupConfig)
          continue

        includedGroups.push(groupConfig.label)
        if (GROUP_TIME_BASIS[groupConfig.label])
          timeBasis[groupConfig.label] = GROUP_TIME_BASIS[groupConfig.label]!

        result[groupConfig.label] = groupConfig.codes
          .map((code) => {
            const item = data[code]
            if (!item)
              return null
            return {
              code: item.code,
              name: item.name,
              kind: marketCodeKind[code] ?? 'index',
              price: item.value,
              changeAmount: item.changeAmount,
              changeRate: item.changeRate,
              as_of: item.as_of ?? null,
              time: item.time,
              datetime: item.datetime ?? null,
              delayed: item.delayed ?? false,
            }
          })
          .filter(Boolean) as Array<{
          code: string
          name: string
          kind: string
          price: number
          changeAmount: number
          changeRate: number
          as_of: string | null
          time: string
          datetime: string | null
          delayed: boolean
        }>
      }

      // 主基准日取 A 股分组的最新报价日（多市场混合时各条目以自身 as_of 为准）
      const aGroup = Object.values(marketGroups).find(g => g.label === 'A 股')
      const aShareAsOf = aGroup
        ? aGroup.codes.map(c => data[c]?.as_of).filter(Boolean).sort().at(-1) ?? null
        : null

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            meta: {
              ...buildMcpMeta({
                asOf: aShareAsOf,
                asOfNote: 'meta.as_of 仅为 A 股(北京时间)最新报价日；美股/期货等条目可能是更早的日期，一律以各条目的 as_of 为准',
                currency: null,
                staleness: { index: 'realtime (行情源缓存约 60 秒)', hk_us: 'realtime / 当地市场时间', futures: 'delayed (延迟行情)' },
              }),
              // 每个分组报价时间的时区/延迟口径，键与 data 分组键一致
              time_basis: timeBasis,
            },
            data: result,
          }, null, 2),
        }],
      }
    }
    catch (error: any) {
      return {
        isError: true,
        content: [{
          type: 'text',
          text: `获取市场数据失败: ${error.message}`,
        }],
      }
    }
  },
})
