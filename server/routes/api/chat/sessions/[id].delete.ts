import { and, eq } from 'drizzle-orm'
import { chatSessions } from '~~/server/database/schemas'
import { getUserFromEvent } from '~~/server/utils/auth'
import { useDb } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const user = getUserFromEvent(event)
  const sessionId = Number(getRouterParam(event, 'id'))
  if (!sessionId)
    throw createError({ status: 400, statusText: '缺少会话 ID' })

  const db = useDb()
  // 仅删除归属当前用户的会话（级联删除消息）
  await db.delete(chatSessions).where(and(
    eq(chatSessions.id, sessionId),
    eq(chatSessions.userId, user.id),
  ))

  setResponseStatus(event, 204)
})
