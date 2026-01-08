import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { users } from '~~/server/database/schemas'
import { getUserFromEvent } from '~~/server/utils/auth'
import { useDb } from '~~/server/utils/db'

const updateAiStatusSchema = z.object({
  isAiAgent: z.boolean(),
})

export default defineEventHandler(async (event) => {
  const user = getUserFromEvent(event)
  const body = await readBody(event)
  const { isAiAgent } = await updateAiStatusSchema.parseAsync(body)

  const db = useDb()
  await db.update(users)
    .set({ isAiAgent })
    .where(eq(users.id, user.id))

  return { message: 'AI 代理状态已更新', isAiAgent }
})
