import { and, eq, isNotNull, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { funds, holdings, users } from '~~/server/database/schemas'
import { useDb } from '~~/server/utils/db'

export default defineMcpTool({
  name: 'explore_user_funds',
  description: '查看其他用户的基金持仓/关注列表，便于发现并参考别人的标的。支持列出所有用户（含持仓/关注数量），或查看指定用户的基金。配合 manage_watchlist 可将心仪基金加入自己的关注。',
  inputSchema: {
    action: z.enum(['list_users', 'view']).describe('操作类型：list_users (列出所有用户及其持仓/关注数量) 或 view (查看指定用户的基金列表)'),
    targetUserId: z.number().int().optional().describe('目标用户 ID。view 时与 username 二选一。'),
    username: z.string().optional().describe('目标用户名。view 时与 targetUserId 二选一。'),
    type: z.enum(['all', 'held', 'watched']).optional().default('all').describe('筛选范围：all (全部) / held (仅持仓) / watched (仅关注)。默认 all。'),
  },
  handler: async (args) => {
    // 1. 认证检查（任意登录用户可用，不校验角色）
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

    // --- Action: list_users (列出所有用户及其持仓/关注数量) ---
    if (args.action === 'list_users') {
      try {
        const allUsers = await db.query.users.findMany({
          orderBy: (u, { asc }) => [asc(u.id)],
          columns: { id: true, username: true, role: true },
        })

        if (allUsers.length === 0) {
          return { content: [{ type: 'text', text: '当前系统没有任何用户。' }] }
        }

        // 一次性取出全部持仓，在内存中按 userId 统计（系统规模较小，避免复杂聚合 SQL）
        const allHoldings = await db.query.holdings.findMany({
          columns: { userId: true, shares: true },
        })
        const statsMap = new Map<number, { total: number, held: number, watched: number }>()
        for (const h of allHoldings) {
          const stat = statsMap.get(h.userId) ?? { total: 0, held: 0, watched: 0 }
          stat.total += 1
          if (h.shares !== null)
            stat.held += 1
          else
            stat.watched += 1
          statsMap.set(h.userId, stat)
        }

        const formatted = allUsers
          .map((u) => {
            const s = statsMap.get(u.id) ?? { total: 0, held: 0, watched: 0 }
            return `ID: ${u.id} | ${u.username} | ${u.role} | 持仓 ${s.held} | 关注 ${s.watched} | 合计 ${s.total}`
          })
          .join('\n')

        return {
          content: [{
            type: 'text',
            text: `系统用户共 ${allUsers.length} 人:\n${formatted}\n\n提示: 使用 action=view 并提供 username 或 targetUserId 查看某人的基金列表。`,
          }],
        }
      }
      catch (error: any) {
        return { isError: true, content: [{ type: 'text', text: `查询失败: ${error.message}` }] }
      }
    }

    // --- Action: view (查看指定用户的基金列表) ---
    if (args.action === 'view') {
      try {
        // 参数校验：username 与 targetUserId 至少提供一个
        if (!args.username && !args.targetUserId) {
          return { isError: true, content: [{ type: 'text', text: '查看用户基金必须提供 username 或 targetUserId。' }] }
        }

        // 解析目标用户：优先 username，其次 targetUserId
        let targetUser: { id: number, username: string } | undefined
        if (args.username) {
          targetUser = await db.query.users.findFirst({
            where: eq(users.username, args.username),
            columns: { id: true, username: true },
          })
        }
        else {
          targetUser = await db.query.users.findFirst({
            where: eq(users.id, args.targetUserId!),
            columns: { id: true, username: true },
          })
        }

        if (!targetUser) {
          const key = args.username ? `用户名 "${args.username}"` : `用户 ID ${args.targetUserId}`
          return { isError: true, content: [{ type: 'text', text: `未找到${key}。` }] }
        }

        // 按 type 构造筛选条件：held → shares 非空；watched → shares 为空；all → 不加额外条件
        const conditions = [eq(holdings.userId, targetUser.id)]
        if (args.type === 'held')
          conditions.push(isNotNull(holdings.shares))
        else if (args.type === 'watched')
          conditions.push(isNull(holdings.shares))

        const rows = await db.select({
          code: funds.code,
          name: funds.name,
          sector: funds.sector,
          fundType: funds.fundType,
          shares: holdings.shares,
          attentionLevel: holdings.attentionLevel,
        })
          .from(holdings)
          .innerJoin(funds, eq(holdings.fundCode, funds.code))
          .where(and(...conditions))

        const typeLabel = args.type === 'held' ? '持仓' : args.type === 'watched' ? '关注' : ''

        if (rows.length === 0) {
          return {
            content: [{
              type: 'text',
              text: `${targetUser.username} 目前没有任何${typeLabel}基金。`,
            }],
          }
        }

        // 统计持仓/关注数量并组装结果（不返回他人的份额/成本价等敏感明细）
        let heldCount = 0
        let watchedCount = 0
        const fundList = rows.map((r) => {
          const isHeld = r.shares !== null
          if (isHeld)
            heldCount += 1
          else
            watchedCount += 1
          const levelLabel = r.attentionLevel === 3 ? '核心' : r.attentionLevel === 2 ? '重点' : '普通'
          return {
            code: r.code,
            name: r.name,
            sector: r.sector || '未分类',
            status: isHeld ? 'held' : 'watched',
            attention_level: `${r.attentionLevel} (${levelLabel})`,
          }
        })

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              user: { id: targetUser.id, username: targetUser.username },
              summary: {
                total: rows.length,
                held: heldCount,
                watched: watchedCount,
                filter: args.type,
              },
              funds: fundList,
              hint: '对感兴趣的基金，可调用 manage_watchlist (action=add, fundCode=...) 加入你自己的关注。',
            }, null, 2),
          }],
        }
      }
      catch (error: any) {
        return { isError: true, content: [{ type: 'text', text: `查询失败: ${error.message}` }] }
      }
    }

    return { isError: true, content: [{ type: 'text', text: 'Invalid action.' }] }
  },
})
