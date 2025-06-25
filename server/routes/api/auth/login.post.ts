import type { UserPayload } from '~~/server/utils/auth'
import { eq } from 'drizzle-orm'
import { encrypt, sign } from 'paseto-ts/v4'
import { z } from 'zod'
import { users } from '~~/server/database/schemas'
import { hashPassword } from '~~/server/utils/auth'

const loginSchema = z.object({
  username: z.string(),
  password: z.string(),
})

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { username, password } = await loginSchema.parseAsync(body)

  const db = useDb()
  const user = await db.query.users.findFirst({
    where: eq(users.username, username),
  })

  if (!user || user.password !== hashPassword(password)) {
    throw createError({
      statusCode: 401,
      statusMessage: '用户名或密码错误。',
    })
  }

  const userPayload: UserPayload = {
    id: user.id,
    username: user.username,
    role: user.role,
  }

  const [localKey, refreshPrivateKey] = await Promise.all([
    useStorage('redis').getItem<string>('localKey'),
    useStorage('redis').getItem<string>('refreshPrivateKey'),
  ])

  if (!localKey || !refreshPrivateKey)
    throw new Error('Server not initialized: keys are missing.')

  const accessToken = await encrypt(localKey, userPayload, { expiresIn: '15 minutes' })
  const refreshToken = await sign(refreshPrivateKey, { sub: String(user.id) }, { expiresIn: '7 days' })

  return {
    accessToken,
    refreshToken,
    user: userPayload,
  }
})
