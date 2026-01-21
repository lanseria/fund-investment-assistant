import { eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { holdings } from '~~/server/database/schemas'
import { getUserFromEvent } from '~~/server/utils/auth'
import { useDb } from '~~/server/utils/db'

// 验证请求体
const mergeSchema = z.object({
  sourceUserId: z.number().int(),
  targetUserId: z.number().int(),
})

export default defineEventHandler(async (event) => {
  // 1. 权限验证
  const admin = getUserFromEvent(event)
  if (admin.role !== 'admin') {
    throw createError({ statusCode: 403, message: 'Forbidden: Admins only' })
  }

  // 2. 参数解析
  const body = await readBody(event)
  const { sourceUserId, targetUserId } = await mergeSchema.parseAsync(body)

  if (sourceUserId === targetUserId) {
    throw createError({ statusCode: 400, message: '源用户和目标用户不能相同' })
  }

  const db = useDb()

  try {
    // 3. 核心逻辑：查出源用户的持仓，尝试插入目标用户
    // 使用 INSERT ... SELECT ... ON CONFLICT DO NOTHING 语句
    // 这样可以直接在数据库层面完成“取并集”，如果目标用户已拥有该基金，则跳过（保留目标用户原有的持有数据）

    const result = await db.execute(sql`
      INSERT INTO ${holdings} (user_id, fund_code, shares, cost_price)
      SELECT ${targetUserId}, fund_code, shares, cost_price
      FROM ${holdings}
      WHERE user_id = ${sourceUserId}
      ON CONFLICT (user_id, fund_code) DO NOTHING
    `)

    // result.rowCount 在 INSERT ... SELECT 语句中通常表示受影响的行数（即成功插入的行数）
    const insertedCount = result.rowCount

    return {
      message: '合并操作完成',
      addedCount: insertedCount,
    }
  }
  catch (error: any) {
    console.error('Merge holdings error:', error)
    throw createError({
      statusCode: 500,
      message: `合并失败: ${error.message}`,
    })
  }
})
