import { desc, eq } from 'drizzle-orm'
import { chatSessions } from '~~/server/database/schemas'
import { getUserFromEvent } from '~~/server/utils/auth'
import { useDb } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const user = getUserFromEvent(event)
  const db = useDb()

  const sessions = await db.query.chatSessions.findMany({
    where: eq(chatSessions.userId, user.id),
    orderBy: [desc(chatSessions.updatedAt)],
    columns: {
      id: true,
      title: true,
      createdAt: true,
      updatedAt: true,
    },
  })

  return { sessions }
})
