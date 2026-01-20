import { and, desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { funds, fundTransactions } from '~~/server/database/schemas'
import { useDb } from '~~/server/utils/db'

export default defineMcpTool({
  name: 'manage_pending_transactions',
  description: '管理用户的待处理交易。支持列出当前所有挂单 (list) 或撤销指定 ID 的挂单 (cancel)。撤销操作是不可逆的。',
  inputSchema: {
    action: z.enum(['list', 'cancel']).describe('操作类型：list (列出所有待处理交易) 或 cancel (撤销指定交易)'),
    transactionId: z.number().int().optional().describe('要撤销的交易 ID (整数)。仅当 action="cancel" 时必填。'),
  },
  handler: async ({ action, transactionId }) => {
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

    // --- Action: List (列出) ---
    if (action === 'list') {
      try {
        const pendingTxs = await db.select({
          id: fundTransactions.id,
          fundCode: fundTransactions.fundCode,
          fundName: funds.name,
          type: fundTransactions.type,
          amount: fundTransactions.orderAmount,
          shares: fundTransactions.orderShares,
          date: fundTransactions.orderDate,
          note: fundTransactions.note,
          createdAt: fundTransactions.createdAt,
        })
          .from(fundTransactions)
          .leftJoin(funds, eq(fundTransactions.fundCode, funds.code))
          .where(and(
            eq(fundTransactions.userId, userId),
            eq(fundTransactions.status, 'pending'),
          ))
          .orderBy(desc(fundTransactions.createdAt))

        if (pendingTxs.length === 0) {
          return { content: [{ type: 'text', text: '当前没有待处理的交易 (No pending transactions)。' }] }
        }

        // 格式化输出，方便 AI 阅读
        const formattedList = pendingTxs.map(tx => ({
          id: tx.id,
          fund: `${tx.fundName || 'Unknown'} (${tx.fundCode})`,
          operation: tx.type,
          detail: (tx.type === 'buy' || tx.type === 'convert_in')
            ? `金额: ${tx.amount}`
            : `份额: ${tx.shares}`,
          date: tx.date,
          note: tx.note || '-',
        }))

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(formattedList, null, 2),
          }],
        }
      }
      catch (error: any) {
        return { isError: true, content: [{ type: 'text', text: `查询失败: ${error.message}` }] }
      }
    }

    // --- Action: Cancel (撤销) ---
    if (action === 'cancel') {
      if (!transactionId) {
        return { isError: true, content: [{ type: 'text', text: '撤销操作必须提供 transactionId。' }] }
      }

      try {
        // 先查询该交易是否存在且属于该用户
        const tx = await db.query.fundTransactions.findFirst({
          where: and(
            eq(fundTransactions.id, transactionId),
            eq(fundTransactions.userId, userId),
            eq(fundTransactions.status, 'pending'),
          ),
        })

        if (!tx) {
          return { isError: true, content: [{ type: 'text', text: `未找到 ID 为 ${transactionId} 的待处理交易，或该交易已不再是 pending 状态。` }] }
        }

        // 逻辑复用：基金转换的特殊处理
        if (tx.type === 'convert_in') {
          return { isError: true, content: [{ type: 'text', text: `无法直接撤销 [转换转入] 交易。请撤销对应的 [转换转出] 交易，系统会自动级联删除。` }] }
        }

        // 执行删除
        await db.transaction(async (trx) => {
          // 如果是转出，级联删除关联的转入
          if (tx.type === 'convert_out') {
            await trx.delete(fundTransactions)
              .where(and(
                eq(fundTransactions.relatedId, transactionId),
                eq(fundTransactions.type, 'convert_in'),
              ))
          }

          // 删除当前记录
          await trx.delete(fundTransactions)
            .where(eq(fundTransactions.id, transactionId))
        })

        return {
          content: [{
            type: 'text',
            text: `✅ 交易 (ID: ${transactionId}) 已成功撤销。`,
          }],
        }
      }
      catch (error: any) {
        return { isError: true, content: [{ type: 'text', text: `撤销失败: ${error.message}` }] }
      }
    }

    return { isError: true, content: [{ type: 'text', text: 'Invalid action.' }] }
  },
})
