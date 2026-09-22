import { and, eq } from 'drizzle-orm'
import { dcaPlans } from '~~/server/database/schemas'
import { getUserFromEvent } from '~~/server/utils/auth'
import { useDb } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const user = getUserFromEvent(event)
  const id = getRouterParam(event, 'id')

  if (!id)
    throw createError({ status: 400, statusText: 'Plan ID is required' })

  const db = useDb()

  const [record] = await db.delete(dcaPlans)
    .where(and(eq(dcaPlans.id, Number(id)), eq(dcaPlans.userId, user.id)))
    .returning()

  if (!record)
    throw createError({ status: 404, statusText: '未找到该定投计划' })

  return { statusText: '定投计划已删除', record }
})
