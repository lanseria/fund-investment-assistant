import type { UserPayload } from '~~/server/utils/auth'
import { eq } from 'drizzle-orm'
import { encrypt, verify } from 'paseto-ts/v4'
import { z } from 'zod'
import { users } from '~~/server/database/schemas'

const refreshSchema = z.object({
  refreshToken: z.string(),
})

export default defineEventHandler(async (event) => {
  const { refreshToken } = await refreshSchema.parseAsync(await readBody(event))

  const refreshPublicKey = await useStorage('redis').getItem<string>('refreshPublicKey')
  if (!refreshPublicKey)
    throw new Error('Server not initialized: public key is missing.')

  // [修改 1] 先解构出 payload，再从中获取 sub
  const { payload } = await verify(refreshPublicKey, refreshToken)
  const userId = payload.sub

  const db = useDb()
  const user = await db.query.users.findFirst({ where: eq(users.id, Number(userId)) })
  if (!user)
    throw createError({ statusCode: 401, statusMessage: 'Invalid refresh token: user not found.' })

  const userPayload: UserPayload = { id: user.id, username: user.username, role: user.role }

  const localKey = await useStorage('redis').getItem<string>('localKey')
  if (!localKey)
    throw new Error('Server not initialized: localKey is missing.')

  // [修改 2] 在选项对象上使用 `as any` 来解决类型定义问题
  const newAccessToken = await encrypt(localKey, userPayload, { expiresIn: '15 minutes' } as any)

  return { accessToken: newAccessToken, user: userPayload }
})
