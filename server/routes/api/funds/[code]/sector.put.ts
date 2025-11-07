import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { funds } from '~~/server/database/schemas'
import { getUserFromEvent } from '~~/server/utils/auth'
import { useDb } from '~~/server/utils/db'

// Zod schema 保持不变
const updateSectorSchema = z.object({
  sector: z.string().nullable(),
})

export default defineEventHandler(async (event) => {
  const user = getUserFromEvent(event)
  console.warn(`用户 '${user.username}' (ID: ${user.id}) 正在更新基金板块...`)

  const code = getRouterParam(event, 'code')
  if (!code)
    throw createError({ statusCode: 400, message: '需要提供基金代码' })

  const body = await readBody(event)
  const { sector } = await updateSectorSchema.parseAsync(body)

  const db = useDb()
  const [updatedFund] = await db.update(funds)
    .set({ sector })
    .where(eq(funds.code, code))
    .returning()

  if (!updatedFund)
    throw createError({ statusCode: 404, message: '未找到指定的基金' })

  return { message: '板块更新成功，感谢您的贡献！' }
})
