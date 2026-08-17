/* eslint-disable no-console */
import { format } from 'date-fns'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { aiExecutionLogs, fundTransactions, users } from '~~/server/database/schemas'
import { buildTransactionRows, getAiTradeDecisions } from '~~/server/utils/aiTrader'
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
      console.log(`⏸️ [AI AutoTrade] 今日 (${format(new Date(), 'yyyy-MM-dd')}) 跳过: ${check.reason}`)
      return { result: 'Skipped', reason: check.reason }
    }

    console.log('✅ [AI AutoTrade] 今日为交易日，开始分析...')
    const db = useDb()

    // 1. 获取所有开启了 AI 代理的用户
    const aiUsers = await db.query.users.findMany({
      where: inArray(users.aiMode, ['auto', 'draft']),
    })

    console.log(`找到 ${aiUsers.length} 个 AI 代理用户。`)

    // 处理单个用户的完整流程(抽离以便重试复用)
    const processUser = async (user: typeof aiUsers[number]): Promise<number> => {
      console.log(`正在分析用户 ${user.username} (ID: ${user.id})...`)

      // 标记该账号为「AI 操作中」,供 /leaderboard 与 /daily-ops 展示
      await db.update(users).set({ aiOperating: true }).where(eq(users.id, user.id))

      try {
        // 获取用户持仓数据(已包含策略信号 signals 和指标)
        const { holdings } = await getUserHoldingsAndSummary(user.id)
        if (holdings.length === 0)
          return 0

        // 计算可用资金:数据库余额 - 今日已生成的 Pending 买入金额(防止多次运行重复使用资金)
        const pendingBuyAmount = await db.select({
          total: sql<string>`SUM(order_amount)`,
        })
          .from(fundTransactions)
          .where(and(
            eq(fundTransactions.userId, user.id),
            inArray(fundTransactions.status, ['pending', 'draft']),
            eq(fundTransactions.type, 'buy'),
          ))

        const currentCash = Number(user.availableCash || 0)
        const frozenCash = Number(pendingBuyAmount[0]?.total || 0)
        const realAvailableCash = Math.max(0, currentCash - frozenCash)

        const { decisions, fullPrompt, rawResponse } = await getAiTradeDecisions(holdings, {
          availableCash: realAvailableCash,
          aiSystemPrompt: user.aiSystemPrompt,
        })

        // 保存执行日志
        const todayStr = new Date().toISOString().split('T')[0] ?? ''
        await db.insert(aiExecutionLogs).values({
          userId: user.id,
          date: todayStr,
          prompt: fullPrompt,
          response: rawResponse,
        })

        if (decisions.length === 0) {
          console.log(`  -> AI 建议观望 (Hold)`)
          return 0
        }

        // 将决策映射为交易行:剔除无效项,并把 convert_in 绑定到配对的 convert_out。
        // [关键] convert_in 必须携带 relatedId 指向 convert_out,且 orderAmount 留空
        // 等待转出确认后回填——否则确认时会以 0 金额成交,转出资金凭空消失(资金黑洞)。
        const rows = buildTransactionRows(decisions, {
          userId: user.id,
          status: user.aiMode === 'auto' ? 'pending' : 'draft',
          orderDate: todayStr,
        })

        if (rows.length === 0) {
          console.log(`  -> 所有决策均无效,已全部剔除`)
          return 0
        }

        // 整批写入单个事务:任一笔失败全部回滚,避免产生半截写入的孤立 convert_out/convert_in
        await db.transaction(async (tx) => {
          // convert_out 在 rows 中的下标 -> 已插入的数据库记录 id
          const insertedOutIds = new Map<number, number>()

          for (let i = 0; i < rows.length; i++) {
            const row = rows[i]!
            const { pairIndex, ...values } = row
            const [record] = await tx.insert(fundTransactions).values(
              pairIndex !== null
                ? { ...values, relatedId: insertedOutIds.get(pairIndex) }
                : values,
            ).returning({ id: fundTransactions.id })

            if (row.type === 'convert_out')
              insertedOutIds.set(i, record!.id)

            console.log(`  -> 生成交易: ${row.type} ${row.fundCode}${row.type === 'convert_in' ? ' (转入,已关联转出记录)' : ''}, 原因: ${row.note.replace('[AI操作] ', '')}`)
          }
        })

        return rows.length
      }
      finally {
        // 无论成功/失败/观望,都标记操作结束
        await db.update(users).set({ aiOperating: false }).where(eq(users.id, user.id))
      }
    }

    let totalTrades = 0
    // 失败用户队列:首轮失败后,末尾补跑一轮(LLM 层已有指数退避,补跑一轮足够覆盖偶发故障)
    const failedUsers: typeof aiUsers = []

    // 2. 首轮:串行处理所有用户(避免并发过高触发 OpenRouter 限制)
    for (const user of aiUsers) {
      try {
        totalTrades += await processUser(user)
      }
      catch (err: any) {
        console.error(`处理用户 ${user.username} (ID: ${user.id}) 时出错:`, err?.message ?? err)
        failedUsers.push(user)
      }
    }

    // 3. 补跑轮:对首轮失败的用户重试一次。
    //    统计显示多数失败是 OpenRouter 临时限流/网络抖动,补跑能显著提升当日决策成功率。
    if (failedUsers.length > 0) {
      console.log(`🔄 [AI AutoTrade] 首轮有 ${failedUsers.length} 个用户失败,等待 5 秒后补跑一轮...`)
      await new Promise(resolve => setTimeout(resolve, 5000))

      for (const user of failedUsers) {
        try {
          console.log(`🔁 [AI AutoTrade] 补跑用户 ${user.username} (ID: ${user.id})...`)
          totalTrades += await processUser(user)
        }
        catch (err: any) {
          // 补跑仍失败:记录后放弃该用户当日决策(LLM 层已多次重试,再补跑收益递减)
          console.error(`❌ [AI AutoTrade] 用户 ${user.username} (ID: ${user.id}) 补跑仍失败,放弃当日决策:`, err?.message ?? err)
        }
      }
    }

    console.log(`🤖 AI 自动交易任务完成。共生成 ${totalTrades} 笔待处理交易。`)
    return { result: 'Success', trades: totalTrades }
  },
})
