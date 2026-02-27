import BigNumber from 'bignumber.js'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { funds } from '~~/server/database/schemas'
import { getUserFromEvent } from '~~/server/utils/auth'
import { useDb } from '~~/server/utils/db'

// 验证客户端提交的数据格式
const estimateUpdateSchema = z.object({
  code: z.string(),
  estimate: z.string(), // 估算净值
  rate: z.string(), // 涨跌幅
  time: z.string(), // 更新时间
})

const batchUpdateSchema = z.object({
  updates: z.array(estimateUpdateSchema),
})

export default defineEventHandler(async (event) => {
  // 需登录用户才能提交，防止恶意调用
  getUserFromEvent(event)
  const body = await readBody(event)
  const { updates } = await batchUpdateSchema.parseAsync(body)

  if (updates.length === 0)
    return { count: 0 }

  const db = useDb()
  let updatedCount = 0

  // 批量更新数据库
  // 考虑到并发和性能，这里使用简单的循环更新，因为客户端上报频率虽然高，但写操作分散
  for (const item of updates) {
    try {
      const estimateNav = new BigNumber(item.estimate)
      const changeRate = new BigNumber(item.rate)

      if (estimateNav.isNaN() || changeRate.isNaN())
        continue

      await db.update(funds)
        .set({
          todayEstimateNav: estimateNav.toNumber(),
          percentageChange: changeRate.toNumber(),
          todayEstimateUpdateTime: new Date(item.time),
        })
        .where(eq(funds.code, item.code))

      updatedCount++
    }
    catch (e) {
      // 忽略单个更新错误
      console.error(`Error updating fund ${item.code} from client report:`, e)
    }
  }

  return { count: updatedCount }
})
