import { getUserFromEvent } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const admin = getUserFromEvent(event)
  if (admin.role !== 'admin') {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden: Admins only' })
  }

  const db = useDb()
  return await db.query.users.findMany({
    orderBy: (users, { asc }) => [asc(users.createdAt)],
    columns: {
      id: true,
      username: true,
      role: true,
      isAiAgent: true,
      aiModel: true,
      aiTotalAmount: true,
      aiSystemPrompt: true,
      createdAt: true,
    },
  })
})
