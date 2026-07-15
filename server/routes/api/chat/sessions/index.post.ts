import { chatSessions } from '~~/server/database/schemas'
import { getUserFromEvent } from '~~/server/utils/auth'
import { useDb } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const user = getUserFromEvent(event)
  const db = useDb()

  const [session] = await db.insert(chatSessions).values({
    userId: user.id,
    title: '新对话',
  }).returning({
    id: chatSessions.id,
    title: chatSessions.title,
    createdAt: chatSessions.createdAt,
  })

  return { session: session! }
})
