import { z } from 'zod'
import { getCachedMarketData } from '~~/server/utils/market'
import { marketGroups } from '~~/shared/market'

export default defineMcpTool({
  name: 'get_market_index',
  description: '获取大盘指数实时数据，包含A股（上证、沪深300、上证50、科创50）、深市（深证成指、创业板指、中证1000）、港股（恒生指数、恒生科技）、美股（道琼斯、纳斯达克）及期货（黄金、原油）等主要指数的最新价格和涨跌幅。用于判断大盘整体走势和市场情绪。',
  inputSchema: {
    group: z.enum(['A', 'B', 'HK', 'US', 'JP', 'Futures', 'all']).optional().default('all').describe('指数分组: A=A股指数, B=深市指数, HK=港股, US=美股, JP=日本, Futures=期货, all=全部'),
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
        price: number
        changeAmount: number
        changeRate: number
        time: string
      }>> = {}

      for (const g of groups) {
        const groupConfig = marketGroups[g]
        if (!groupConfig)
          continue

        result[groupConfig.label] = groupConfig.codes
          .map((code) => {
            const item = data[code]
            if (!item)
              return null
            return {
              code: item.code,
              name: item.name,
              price: item.value,
              changeAmount: item.changeAmount,
              changeRate: item.changeRate,
              time: item.time,
            }
          })
          .filter(Boolean) as Array<{
          code: string
          name: string
          price: number
          changeAmount: number
          changeRate: number
          time: string
        }>
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result, null, 2),
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
