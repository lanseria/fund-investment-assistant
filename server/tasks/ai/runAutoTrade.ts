// server/tasks/ai/runAutoTrade.ts
/* eslint-disable no-console */
import { eq } from 'drizzle-orm'
import { fundTransactions, users } from '~~/server/database/schemas'
import { getAiTradeDecisions } from '~~/server/utils/aiTrader'
import { useDb } from '~~/server/utils/db'
import { getUserHoldingsAndSummary } from '~~/server/utils/holdings'

export default defineTask({
  meta: {
    name: 'ai:runAutoTrade',
    description: '为开启 AI 代理的用户执行自动买卖分析',
  },
  async run() {
    console.log('🤖 开始执行 AI 自动交易任务...')
    const db = useDb()

    // 1. 获取所有开启了 AI 代理的用户
    const aiUsers = await db.query.users.findMany({
      where: eq(users.isAiAgent, true),
    })

    console.log(`找到 ${aiUsers.length} 个 AI 代理用户。`)
    let totalTrades = 0

    for (const user of aiUsers) {
      try {
        console.log(`正在分析用户 ${user.username} (ID: ${user.id})...`)

        // 获取用户全量数据 (包含持仓 + 仅关注)
        const { holdings } = await getUserHoldingsAndSummary(user.id)

        if (holdings.length === 0)
          continue

        // 2. 调用 AI 获取决策 (传入全量数据 和 用户配置)
        const decisions = await getAiTradeDecisions(holdings, {
          aiModel: user.aiModel,
          aiTotalAmount: user.aiTotalAmount,
          aiSystemPrompt: user.aiSystemPrompt,
        })

        if (decisions.length === 0) {
          console.log(`  -> AI 建议全线观望 (Hold)`)
          continue
        }

        // 3. 执行交易建议
        for (const decision of decisions) {
          // 安全检查
          if (decision.action === 'buy' && (!decision.amount || decision.amount <= 0))
            continue
          if (decision.action === 'sell' && (!decision.shares || decision.shares <= 0))
            continue

          await db.insert(fundTransactions).values({
            userId: user.id,
            fundCode: decision.fundCode,
            type: decision.action as 'buy' | 'sell',
            status: 'pending', // 待确认状态
            orderAmount: decision.amount ? String(decision.amount) : null,
            orderShares: decision.shares ? String(decision.shares) : null,
            orderDate: new Date().toISOString().split('T')[0],
            note: `[AI] ${decision.reason}`, // 记录 AI 的分析理由
          })

          console.log(`  -> 生成信号: ${decision.action} ${decision.fundName || decision.fundCode} | 理由: ${decision.reason}`)
          totalTrades++
        }
      }
      catch (err) {
        console.error(`处理用户 ${user.username} 时出错:`, err)
      }
    }

    console.log(`🤖 AI 自动交易任务完成。共生成 ${totalTrades} 笔建议。`)
    return { result: 'Success', trades: totalTrades }
  },
})
