import type { UserPayload } from '~~/server/utils/auth'
import { eq } from 'drizzle-orm'
import { encrypt, sign, verify } from 'paseto-ts/v4'
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

  const { sub: userId } = await verify(refreshPublicKey, refreshToken)
  const db = useDb()
  const user = await db.query.users.findFirst({ where: eq(users.id, Number(userId)) })
  if (!user)
    throw createError({ statusCode: 401, statusMessage: 'Invalid refresh token: user not found.' })

  const userPayload: UserPayload = { id: user.id, username: user.username, role: user.role }

  const localKey = await useStorage('redis').getItem<string>('localKey')
  if (!localKey)
    throw new Error('Server not initialized: localKey is missing.')

  const newAccessToken = await encrypt(localKey, userPayload, { expiresIn: '15 minutes' })

  return { accessToken: newAccessToken, user: userPayload }
})
