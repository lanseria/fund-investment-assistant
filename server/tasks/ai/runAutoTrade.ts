/* eslint-disable no-console */
import dayjs from 'dayjs'
import { and, eq, sql } from 'drizzle-orm'
import { aiExecutionLogs, fundTransactions, users } from '~~/server/database/schemas'
import { getAiTradeDecisions } from '~~/server/utils/aiTrader'
import { useDb } from '~~/server/utils/db'
import { isTradingDay } from '~~/shared/market'

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

        // 3. 调用 AI 获取决策
        // 计算可用资金：数据库余额 - 今日已生成的Pending买入金额 (防止多次运行重复使用资金)
        const pendingBuyAmount = await db.select({
          total: sql<string>`SUM(order_amount)`,
        })
          .from(fundTransactions)
          .where(and(
            eq(fundTransactions.userId, user.id),
            eq(fundTransactions.status, 'pending'),
            eq(fundTransactions.type, 'buy'),
          ))

        const currentCash = Number(user.availableCash || 0)
        const frozenCash = Number(pendingBuyAmount[0]?.total || 0)
        const realAvailableCash = Math.max(0, currentCash - frozenCash)

        const { decisions, fullPrompt, rawResponse } = await getAiTradeDecisions(holdings, {
          availableCash: realAvailableCash, // 告诉 AI 这是它能用的最大金额
          aiSystemPrompt: user.aiSystemPrompt,
        })

        // [新增] 保存执行日志
        const todayStr = new Date().toISOString().split('T')[0]
        await db.insert(aiExecutionLogs).values({
          userId: user.id,
          date: todayStr ?? '',
          prompt: fullPrompt,
          response: rawResponse,
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
            type: decision.action as 'buy' | 'sell', // 注意：这里可能需要扩展 TS 类型以支持 transfer，但目前 DB schema 限制了
            status: 'pending',
            orderAmount: decision.amount ? String(decision.amount) : null,
            orderShares: decision.shares ? String(decision.shares) : null,
            orderDate: todayStr ?? '',
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
