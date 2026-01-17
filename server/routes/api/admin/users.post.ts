import { z } from 'zod'
import { users } from '~~/server/database/schemas'
import { getUserFromEvent, hashPassword } from '~~/server/utils/auth'

const createUserSchema = z.object({
  username: z.string().min(3, '用户名至少3位'),
  password: z.string().min(6, '密码至少6位'),
  role: z.enum(['admin', 'user']),
})

export default defineEventHandler(async (event) => {
  const admin = getUserFromEvent(event)
  if (admin.role !== 'admin') {
    throw createError({ statusCode: 403, message: 'Forbidden: Admins only' })
  }

  const body = await readBody(event)
  const { username, password, role } = await createUserSchema.parseAsync(body)

  const db = useDb()
  await db.insert(users).values({
    username,
    password: hashPassword(password),
    role,
  })

  setResponseStatus(event, 201) // Created
  return { message: 'User created successfully.' }
})
