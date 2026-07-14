/* eslint-disable no-console */
import { and, eq, inArray, sql } from 'drizzle-orm'
import { holdings, users } from '~~/server/database/schemas'
import { useDb } from '~~/server/utils/db'

// 灰尘份额阈值:份额 ≤ 此值视为残留,归零转为仅关注
const DUST_THRESHOLD = 0.01

export default defineTask({
  meta: {
    name: 'fund:cleanDustShares',
    description: '清理 AI 用户持仓中的灰尘份额(极小残留),将其归零转为仅关注',
  },
  async run() {
    console.log('🧹 [CleanDustShares] 开始清理灰尘份额...')

    const db = useDb()

    // 查找 AI 用户中 shares > 0 且 ≤ 阈值的持仓
    const dustHoldings = await db.select({
      userId: holdings.userId,
      fundCode: holdings.fundCode,
      shares: holdings.shares,
      username: users.username,
    })
      .from(holdings)
      .innerJoin(users, sql`${holdings.userId} = ${users.id}`)
      .where(and(
        inArray(users.aiMode, ['auto', 'draft']),
        sql`${holdings.shares} > 0 AND ${holdings.shares} <= ${DUST_THRESHOLD}`,
      ))

    if (dustHoldings.length === 0) {
      console.log('🧹 [CleanDustShares] 无灰尘份额,跳过。')
      return { result: 'Skipped', reason: 'No dust shares found' }
    }

    console.log(`🧹 [CleanDustShares] 发现 ${dustHoldings.length} 条灰尘份额,开始清理...`)

    // 逐条将 shares/costPrice 置 null (转为仅关注状态)
    for (const h of dustHoldings) {
      await db.update(holdings)
        .set({ shares: null, costPrice: null })
        .where(and(eq(holdings.userId, h.userId), eq(holdings.fundCode, h.fundCode)))
      console.log(`  -> 清理 ${h.username} 的 ${h.fundCode} (残留 ${h.shares} 份)`)
    }

    console.log(`🧹 [CleanDustShares] 完成,共清理 ${dustHoldings.length} 条。`)
    return { result: 'Success', cleaned: dustHoldings.length }
  },
})
