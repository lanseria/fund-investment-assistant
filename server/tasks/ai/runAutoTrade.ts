/* eslint-disable no-console */
import dayjs from 'dayjs'
import isBetween from 'dayjs/plugin/isBetween'
import { eq } from 'drizzle-orm'
import { fundTransactions, users } from '~~/server/database/schemas'
import { getAiTradeDecisions } from '~~/server/utils/aiTrader'
import { useDb } from '~~/server/utils/db'
import { getUserHoldingsAndSummary } from '~~/server/utils/holdings'

dayjs.extend(isBetween)

// 2026 年休市日期区间 (包含起止日期)
// 格式: [开始日期, 结束日期]
const HOLIDAYS_2026 = [
  ['2026-01-01', '2026-01-03'], // 元旦
  ['2026-02-15', '2026-02-23'], // 春节
  ['2026-04-04', '2026-04-06'], // 清明节
  ['2026-05-01', '2026-05-05'], // 劳动节
  ['2026-06-19', '2026-06-21'], // 端午节
  ['2026-09-25', '2026-09-27'], // 中秋节
  ['2026-10-01', '2026-10-07'], // 国庆节
]

/**
 * 检查今天是否为交易日
 * 规则:
 * 1. 周末 (周六、周日) 一律不交易
 * 2. 法定节假日区间内不交易
 */
function isTradingDay(): { isTrading: boolean, reason?: string } {
  const today = dayjs()

  // 检查节假日 (目前仅配置了 2026 年)
  // 实际生产中建议将此配置放入数据库或字典表中动态维护
  for (const [start, end] of HOLIDAYS_2026) {
    if (today.isBetween(start, end, 'day', '[]')) {
      return { isTrading: false, reason: `节假日休市 (${start} ~ ${end})` }
    }
  }

  return { isTrading: true }
}

export default defineTask({
  meta: {
    name: 'ai:runAutoTrade',
    description: '为开启 AI 代理的用户执行自动买卖分析',
  },
  async run() {
    console.log('🤖 [AI AutoTrade] 任务触发...')

    // --- 交易日检查 ---
    const check = isTradingDay()
    if (!check.isTrading) {
      console.log(`⏸️ [AI AutoTrade] 今日 (${dayjs().format('YYYY-MM-DD')}) 跳过: ${check.reason}`)
      return { result: 'Skipped', reason: check.reason }
    }

    console.log('✅ [AI AutoTrade] 今日为交易日，开始分析...')
    const db = useDb()

    // 1. 获取所有开启了 AI 代理的用户
    const aiUsers = await db.query.users.findMany({
      where: eq(users.isAiAgent, true),
    })

    console.log(`找到 ${aiUsers.length} 个 AI 代理用户。`)
    let totalTrades = 0

    // 2. 遍历用户，串行处理（避免并发过高触发 OpenRouter 限制）
    for (const user of aiUsers) {
      try {
        console.log(`正在分析用户 ${user.username} (ID: ${user.id})...`)

        // 获取用户持仓数据（这已经包含了策略信号 signals 和指标）
        const { holdings } = await getUserHoldingsAndSummary(user.id)

        if (holdings.length === 0)
          continue

        // 3. 调用 AI 获取决策 (传入全量数据 和 用户配置)
        const decisions = await getAiTradeDecisions(holdings, {
          aiModel: user.aiModel,
          aiTotalAmount: user.aiTotalAmount,
          aiSystemPrompt: user.aiSystemPrompt,
        })

        if (decisions.length === 0) {
          console.log(`  -> AI 建议观望 (Hold)`)
          continue
        }

        // 4. 将决策转换为数据库交易记录 (Pending 状态)
        for (const decision of decisions) {
          // 简单的校验
          if (decision.action === 'buy' && !decision.amount)
            continue
          if (decision.action === 'sell' && !decision.shares)
            continue

          await db.insert(fundTransactions).values({
            userId: user.id,
            fundCode: decision.fundCode,
            type: decision.action as 'buy' | 'sell',
            status: 'pending', // 关键：设为 pending，等待人工确认或原来的 processTransactions 任务处理
            orderAmount: decision.amount ? String(decision.amount) : null,
            orderShares: decision.shares ? String(decision.shares) : null,
            orderDate: new Date().toISOString().split('T')[0], // 默认为今天
            note: `[AI操作] ${decision.reason}`,
          })

          console.log(`  -> 生成交易: ${decision.action} ${decision.fundCode}, 原因: ${decision.reason}`)
          totalTrades++
        }
      }
      catch (err) {
        console.error(`处理用户 ${user.username} 时出错:`, err)
      }
    }

    console.log(`🤖 AI 自动交易任务完成。共生成 ${totalTrades} 笔待处理交易。`)
    return { result: 'Success', trades: totalTrades }
  },
})
