import { and, desc, eq } from 'drizzle-orm'
import { aiExecutionLogs } from '~~/server/database/schemas'
import { getUserFromEvent } from '~~/server/utils/auth'
import { useDb } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const admin = getUserFromEvent(event)
  if (admin.role !== 'admin') {
    throw createError({ statusCode: 403, message: 'Forbidden: Admins only' })
  }

  const query = getQuery(event)
  const userId = query.userId as string
  const date = query.date as string

  if (!userId || !date) {
    throw createError({ statusCode: 400, message: 'Missing userId or date' })
  }

  const db = useDb()
  const log = await db.query.aiExecutionLogs.findFirst({
    where: and(
      eq(aiExecutionLogs.userId, Number(userId)),
      eq(aiExecutionLogs.date, date),
    ),
    orderBy: [desc(aiExecutionLogs.createdAt)], // 取最新的一条
  })

  if (!log) {
    throw createError({ statusCode: 404, message: 'Log not found' })
  }

  return log
})
