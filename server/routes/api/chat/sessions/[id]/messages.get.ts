import { and, asc, eq } from 'drizzle-orm'
import { chatMessages, chatSessions } from '~~/server/database/schemas'
import { getUserFromEvent } from '~~/server/utils/auth'
import { useDb } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const user = getUserFromEvent(event)
  const sessionId = Number(getRouterParam(event, 'id'))
  if (!sessionId)
    throw createError({ status: 400, statusText: '缺少会话 ID' })

  const db = useDb()

  // 校验会话归属当前用户
  const session = await db.query.chatSessions.findFirst({
    where: and(eq(chatSessions.id, sessionId), eq(chatSessions.userId, user.id)),
    columns: { id: true },
  })
  if (!session)
    throw createError({ status: 404, statusText: '会话不存在或无权访问' })

  const messages = await db.query.chatMessages.findMany({
    where: eq(chatMessages.sessionId, sessionId),
    orderBy: [asc(chatMessages.createdAt)],
  })

  return { messages }
})
