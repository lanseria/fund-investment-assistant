import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { users } from '~~/server/database/schemas'
import { getUserFromEvent, hashPassword, verifyPassword } from '~~/server/utils/auth'
import { useDb } from '~~/server/utils/db'

const changePasswordSchema = z.object({
  oldPassword: z.string().min(1, '请输入旧密码'),
  newPassword: z.string().min(6, '新密码至少6位'),
})

export default defineEventHandler(async (event) => {
  const user = getUserFromEvent(event)
  const body = await readBody(event)
  const data = await changePasswordSchema.parseAsync(body)

  const db = useDb()
  const dbUser = await db.query.users.findFirst({
    where: eq(users.id, user.id),
  })

  // 验证旧密码（自助修改必须验证，区别于管理员重置）
  if (!dbUser || !(await verifyPassword(dbUser.password, data.oldPassword))) {
    throw createError({
      status: 400,
      statusText: '旧密码错误',
    })
  }

  await db.update(users)
    .set({ password: await hashPassword(data.newPassword) })
    .where(eq(users.id, user.id))

  return { message: '密码修改成功' }
})
