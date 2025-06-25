/* eslint-disable no-console */
import { eq } from 'drizzle-orm'
import { users } from '~~/server/database/schemas'
import { hashPassword } from '~~/server/utils/auth'
import { useDb } from '~~/server/utils/db'

export default defineTask({
  meta: {
    name: 'init:admin',
    description: '初始化一个管理员账户',
  },
  async run() {
    console.log('开始初始化管理员账户...')
    const db = useDb()
    const adminUsername = 'admin'
    const adminPassword = '123456' // 请在首次登录后立即修改

    const existingAdmin = await db.query.users.findFirst({
      where: eq(users.username, adminUsername),
    })

    if (existingAdmin) {
      console.log('管理员账户已存在，跳过初始化。')
      return { result: 'Skipped' }
    }

    await db.insert(users).values({
      username: adminUsername,
      password: hashPassword(adminPassword),
      role: 'admin',
    })

    console.log('✔ 管理员账户创建成功！')
    console.log(`› 用户名: ${adminUsername}`)
    console.log(`› 密  码: ${adminPassword}`)
    return { result: 'Success' }
  },
})
