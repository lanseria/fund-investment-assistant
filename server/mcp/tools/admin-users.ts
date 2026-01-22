import { and, eq, ne } from 'drizzle-orm'
import { z } from 'zod'
import { users } from '~~/server/database/schemas'
import { hashPassword } from '~~/server/utils/auth'
import { useDb } from '~~/server/utils/db'

export default defineMcpTool({
  name: 'admin_manage_users',
  description: '【管理员专用】用户管理工具。支持列出所有用户、创建新用户、修改用户信息（包括资金、AI配置、重置密码）以及删除用户。',
  inputSchema: {
    action: z.enum(['list', 'create', 'update', 'delete']).describe('操作类型'),
    targetUserId: z.number().int().optional().describe('目标用户ID。当 action 为 update 或 delete 时必填。'),
    username: z.string().min(3).optional().describe('用户名。创建时必填，修改时选填。'),
    password: z.string().min(6).optional().describe('用户密码。创建时必填，修改时选填（用于重置密码）。'),
    role: z.enum(['user', 'admin']).optional().describe('用户角色。默认为 user。'),
    availableCash: z.number().optional().describe('设置用户的可用现金余额 (数字)。'),
    isAiAgent: z.boolean().optional().describe('是否开启 AI 自动交易代理。'),
    aiSystemPrompt: z.string().optional().describe('设置用户的自定义 AI System Prompt。'),
  },
  handler: async (args) => {
    // 1. 基础认证与 Admin 权限检查
    const event = useEvent()
    const requestUserId = event.context.userId

    if (!requestUserId) {
      return {
        isError: true,
        content: [{ type: 'text', text: 'Authentication required. Missing API Token.' }],
      }
    }

    const db = useDb()

    // 查询当前请求者的角色
    const operator = await db.query.users.findFirst({
      where: eq(users.id, requestUserId),
      columns: { id: true, username: true, role: true },
    })

    if (!operator || operator.role !== 'admin') {
      return {
        isError: true,
        content: [{ type: 'text', text: `Permission Denied: 此工具仅限管理员使用。当前用户: ${operator?.username || 'Unknown'} (Role: ${operator?.role || 'None'})` }],
      }
    }

    // --- 分发 Action ---

    // 2. 列出用户 (List)
    if (args.action === 'list') {
      const allUsers = await db.query.users.findMany({
        orderBy: (u, { asc }) => [asc(u.id)],
        columns: {
          id: true,
          username: true,
          role: true,
          isAiAgent: true,
          availableCash: true,
          createdAt: true,
        },
      })

      // 格式化输出
      const table = allUsers.map(u =>
        `ID: ${u.id} | User: ${u.username} | Role: ${u.role} | Cash: ${u.availableCash} | AI: ${u.isAiAgent ? 'ON' : 'OFF'}`,
      ).join('\n')

      return {
        content: [{ type: 'text', text: `当前系统用户列表:\n${table}` }],
      }
    }

    // 3. 创建用户 (Create)
    if (args.action === 'create') {
      if (!args.username || !args.password) {
        return { isError: true, content: [{ type: 'text', text: '创建用户必须提供 username 和 password。' }] }
      }

      // 查重
      const existing = await db.query.users.findFirst({
        where: eq(users.username, args.username),
      })
      if (existing) {
        return { isError: true, content: [{ type: 'text', text: `创建失败: 用户名 "${args.username}" 已存在。` }] }
      }

      const hashedPassword = await hashPassword(args.password)

      const [newUser] = await db.insert(users).values({
        username: args.username,
        password: hashedPassword,
        role: args.role || 'user',
        isAiAgent: args.isAiAgent || false,
        availableCash: args.availableCash ? String(args.availableCash) : '0',
        aiSystemPrompt: args.aiSystemPrompt || null,
      }).returning()

      return {
        content: [{ type: 'text', text: `✅ 用户创建成功!\nID: ${newUser.id}\nUsername: ${newUser.username}\nRole: ${newUser.role}` }],
      }
    }

    // 4. 更新用户 (Update)
    if (args.action === 'update') {
      if (!args.targetUserId) {
        return { isError: true, content: [{ type: 'text', text: '更新操作必须提供 targetUserId。' }] }
      }

      const targetUser = await db.query.users.findFirst({
        where: eq(users.id, args.targetUserId),
      })
      if (!targetUser) {
        return { isError: true, content: [{ type: 'text', text: `未找到 ID 为 ${args.targetUserId} 的用户。` }] }
      }

      const updateData: Record<string, any> = {}
      const logs: string[] = []

      // 动态构建更新字段
      if (args.username && args.username !== targetUser.username) {
        // 查重
        const checkName = await db.query.users.findFirst({
          where: and(eq(users.username, args.username), ne(users.id, args.targetUserId)),
        })
        if (checkName) {
          return { isError: true, content: [{ type: 'text', text: `修改失败: 用户名 "${args.username}" 已被占用。` }] }
        }
        updateData.username = args.username
        logs.push(`用户名 -> ${args.username}`)
      }

      if (args.password) {
        updateData.password = await hashPassword(args.password)
        logs.push(`密码 -> (已重置)`)
      }

      if (args.role) {
        updateData.role = args.role
        logs.push(`角色 -> ${args.role}`)
      }

      if (args.availableCash !== undefined) {
        updateData.availableCash = String(args.availableCash)
        logs.push(`现金余额 -> ${args.availableCash}`)
      }

      if (args.isAiAgent !== undefined) {
        updateData.isAiAgent = args.isAiAgent
        logs.push(`AI开关 -> ${args.isAiAgent}`)
      }

      if (args.aiSystemPrompt !== undefined) {
        updateData.aiSystemPrompt = args.aiSystemPrompt || null // 允许传空字符串清空
        logs.push(`AI Prompt -> (已更新)`)
      }

      if (Object.keys(updateData).length === 0) {
        return { content: [{ type: 'text', text: '没有检测到需要变更的数据。' }] }
      }

      await db.update(users)
        .set(updateData)
        .where(eq(users.id, args.targetUserId))

      return {
        content: [{ type: 'text', text: `✅ 用户 (ID: ${args.targetUserId}) 更新成功:\n${logs.join('\n')}` }],
      }
    }

    // 5. 删除用户 (Delete)
    if (args.action === 'delete') {
      if (!args.targetUserId) {
        return { isError: true, content: [{ type: 'text', text: '删除操作必须提供 targetUserId。' }] }
      }

      // 防止自杀
      if (args.targetUserId === requestUserId) {
        return { isError: true, content: [{ type: 'text', text: '安全拦截: 无法删除当前正在登录的管理员账户自身。' }] }
      }

      const result = await db.delete(users).where(eq(users.id, args.targetUserId))

      if (result.rowCount === 0) {
        return { isError: true, content: [{ type: 'text', text: `删除失败: 未找到 ID 为 ${args.targetUserId} 的用户。` }] }
      }

      return {
        content: [{ type: 'text', text: `✅ 用户 (ID: ${args.targetUserId}) 及其所有关联数据已永久删除。` }],
      }
    }

    return { isError: true, content: [{ type: 'text', text: 'Invalid action.' }] }
  },
})
