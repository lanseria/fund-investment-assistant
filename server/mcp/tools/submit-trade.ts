import dayjs from 'dayjs'
import { z } from 'zod'
import { fundTransactions } from '~~/server/database/schemas'
import { useDb } from '~~/server/utils/db'

export default defineMcpTool({
  name: 'submit_trade_order',
  description: '提交基金交易申请。支持买入、卖出或转换操作。提交成功后，交易将进入“待处理”状态，需要用户在前端界面确认或等待系统自动处理。',
  inputSchema: {
    fundCode: z.string().length(6).describe('6位基金代码，例如 "000834"'),
    type: z.enum(['buy', 'sell', 'convert_out', 'convert_in']).describe('交易类型：buy(买入), sell(卖出), convert_out(转换转出), convert_in(转换转入)'),
    amount: z.number().positive().optional().describe('交易金额 (单位：元)。当 type 为 "buy" 或 "convert_in" 时必填。'),
    shares: z.number().positive().optional().describe('交易份额 (单位：份)。当 type 为 "sell" 或 "convert_out" 时必填。'),
    reason: z.string().describe('交易理由或决策依据。例如："纳指大跌，抄底建仓" 或 "RSI超买，止盈卖出"。将记录在交易备注中。'),
  },
  handler: async ({ fundCode, type, amount, shares, reason }) => {
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

    // 2. 业务逻辑校验
    if ((type === 'buy' || type === 'convert_in') && !amount) {
      return {
        isError: true,
        content: [{ type: 'text', text: `提交失败：${type} 操作必须提供金额 (amount)。` }],
      }
    }

    if ((type === 'sell' || type === 'convert_out') && !shares) {
      return {
        isError: true,
        content: [{ type: 'text', text: `提交失败：${type} 操作必须提供份额 (shares)。` }],
      }
    }

    const db = useDb()
    const todayStr = dayjs().format('YYYY-MM-DD')

    try {
      // 3. 插入数据库
      const [record] = await db.insert(fundTransactions).values({
        userId,
        fundCode,
        type,
        status: 'pending', // 默认为待处理
        orderDate: todayStr, // 默认为当天
        // 根据类型存储金额或份额
        orderAmount: amount ? String(amount) : null,
        orderShares: shares ? String(shares) : null,
        // 自动添加 [AI下单] 前缀
        note: `[AI下单] ${reason}`,
      }).returning()

      // 4. 返回成功信息
      const actionText = {
        buy: '买入',
        sell: '卖出',
        convert_out: '转换转出',
        convert_in: '转换转入',
      }[type]

      const valueText = amount ? `${amount}元` : `${shares}份`

      return {
        content: [{
          type: 'text',
          text: `✅ 交易申请已提交！\n\n- 基金: ${fundCode}\n- 操作: ${actionText}\n- 数量: ${valueText}\n- 状态: 待确认 (ID: ${record!.id})\n- 备注: ${reason}\n\n请在“每日操作”页面进行最终确认。`,
        }],
      }
    }
    catch (error: any) {
      return {
        isError: true,
        content: [{
          type: 'text',
          text: `数据库写入失败: ${error.message}`,
        }],
      }
    }
  },
})
