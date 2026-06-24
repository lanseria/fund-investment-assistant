import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { dictionaryData, users } from '~~/server/database/schemas'
import { useDb } from '~~/server/utils/db'

// 板块在字典表中的固定类型编码
const SECTOR_DICT_TYPE = 'sectors'

export default defineMcpTool({
  name: 'manage_sectors',
  description: '【管理员专用】管理“板块”字典（对应前端 /account/dictionaries 页面中的 sectors 类别）。支持列出所有板块、新增板块、修改板块标签/值/排序、以及删除板块。',
  inputSchema: {
    action: z.enum(['list', 'add', 'update', 'delete']).describe('操作类型：list (列出全部), add (新增), update (修改), delete (删除)'),
    targetId: z.number().int().optional().describe('要修改或删除的板块数据项 ID。当 action 为 update 或 delete 时必填。'),
    label: z.string().min(1).optional().describe('板块的标签名 (UI 中显示，例如 “新能源”、“医药”)。add/update 时必填。'),
    value: z.string().min(1).optional().describe('板块的英文值 (程序中使用的唯一标识，例如 “new_energy”)。add 时必填；update 时若提供则修改，注意修改后可能影响已绑定该板块的持仓展示。'),
    sortOrder: z.number().int().optional().describe('排序权重 (整数，默认 0)。值越小越靠前。'),
  },
  handler: async (args) => {
    // 1. 认证 + Admin 权限校验
    const event = useEvent()
    const requestUserId = event.context.userId

    if (!requestUserId) {
      return {
        isError: true,
        content: [{ type: 'text', text: 'Authentication required. Missing API Token.' }],
      }
    }

    const db = useDb()

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

    // --- Action: List (列出全部板块) ---
    if (args.action === 'list') {
      try {
        const list = await db.query.dictionaryData.findMany({
          where: eq(dictionaryData.dictType, SECTOR_DICT_TYPE),
          orderBy: (data, { asc }) => [asc(data.sortOrder), asc(data.id)],
          columns: { id: true, label: true, value: true, sortOrder: true },
        })

        if (list.length === 0) {
          return { content: [{ type: 'text', text: '当前板块字典中没有数据项。' }] }
        }

        const formatted = list
          .map(item => `ID: ${item.id} | Label: ${item.label} | Value: ${item.value} | Sort: ${item.sortOrder ?? 0}`)
          .join('\n')

        return {
          content: [{ type: 'text', text: `板块字典共 ${list.length} 项:\n${formatted}` }],
        }
      }
      catch (error: any) {
        return { isError: true, content: [{ type: 'text', text: `查询失败: ${error.message}` }] }
      }
    }

    // --- Action: Add (新增板块) ---
    if (args.action === 'add') {
      if (!args.label || !args.value) {
        return { isError: true, content: [{ type: 'text', text: '新增板块必须提供 label (标签) 和 value (英文值)。' }] }
      }

      try {
        // value 唯一性校验（同一字典类型内）
        const existing = await db.query.dictionaryData.findFirst({
          where: and(
            eq(dictionaryData.dictType, SECTOR_DICT_TYPE),
            eq(dictionaryData.value, args.value),
          ),
          columns: { id: true },
        })
        if (existing) {
          return { isError: true, content: [{ type: 'text', text: `新增失败: 板块值 "${args.value}" 已存在 (ID: ${existing.id})。` }] }
        }

        const [created] = await db.insert(dictionaryData).values({
          dictType: SECTOR_DICT_TYPE,
          label: args.label,
          value: args.value,
          sortOrder: args.sortOrder ?? 0,
        }).returning()

        return {
          content: [{
            type: 'text',
            text: `✅ 板块创建成功!\nID: ${created!.id}\nLabel: ${created!.label}\nValue: ${created!.value}\nSortOrder: ${created!.sortOrder ?? 0}`,
          }],
        }
      }
      catch (error: any) {
        return { isError: true, content: [{ type: 'text', text: `新增失败: ${error.message}` }] }
      }
    }

    // --- Action: Update (修改板块) ---
    if (args.action === 'update') {
      if (!args.targetId) {
        return { isError: true, content: [{ type: 'text', text: '修改操作必须提供 targetId。' }] }
      }

      try {
        const target = await db.query.dictionaryData.findFirst({
          where: and(
            eq(dictionaryData.id, args.targetId),
            eq(dictionaryData.dictType, SECTOR_DICT_TYPE),
          ),
          columns: { id: true, label: true, value: true, sortOrder: true },
        })
        if (!target) {
          return { isError: true, content: [{ type: 'text', text: `未找到 ID 为 ${args.targetId} 的板块数据项。` }] }
        }

        // 若要修改 value，需要进行唯一性校验
        if (args.value && args.value !== target.value) {
          const conflict = await db.query.dictionaryData.findFirst({
            where: and(
              eq(dictionaryData.dictType, SECTOR_DICT_TYPE),
              eq(dictionaryData.value, args.value),
            ),
            columns: { id: true },
          })
          if (conflict && conflict.id !== args.targetId) {
            return { isError: true, content: [{ type: 'text', text: `修改失败: 板块值 "${args.value}" 已被其他板块占用 (ID: ${conflict.id})。` }] }
          }
        }

        const updateData: Record<string, any> = {}
        const logs: string[] = []

        if (args.label && args.label !== target.label) {
          updateData.label = args.label
          logs.push(`标签 -> ${args.label}`)
        }
        if (args.value && args.value !== target.value) {
          updateData.value = args.value
          logs.push(`值 -> ${args.value}`)
        }
        if (args.sortOrder !== undefined && args.sortOrder !== (target.sortOrder ?? 0)) {
          updateData.sortOrder = args.sortOrder
          logs.push(`排序 -> ${args.sortOrder}`)
        }

        if (Object.keys(updateData).length === 0) {
          return { content: [{ type: 'text', text: '没有检测到需要变更的数据。' }] }
        }

        await db.update(dictionaryData)
          .set(updateData)
          .where(eq(dictionaryData.id, args.targetId))

        return {
          content: [{ type: 'text', text: `✅ 板块 (ID: ${args.targetId}) 更新成功:\n${logs.join('\n')}` }],
        }
      }
      catch (error: any) {
        return { isError: true, content: [{ type: 'text', text: `修改失败: ${error.message}` }] }
      }
    }

    // --- Action: Delete (删除板块) ---
    if (args.action === 'delete') {
      if (!args.targetId) {
        return { isError: true, content: [{ type: 'text', text: '删除操作必须提供 targetId。' }] }
      }

      try {
        // 先校验目标确实属于板块字典
        const target = await db.query.dictionaryData.findFirst({
          where: and(
            eq(dictionaryData.id, args.targetId),
            eq(dictionaryData.dictType, SECTOR_DICT_TYPE),
          ),
          columns: { id: true, label: true, value: true },
        })
        if (!target) {
          return { isError: true, content: [{ type: 'text', text: `删除失败: 未找到 ID 为 ${args.targetId} 的板块数据项。` }] }
        }

        await db.delete(dictionaryData).where(eq(dictionaryData.id, args.targetId))

        return {
          content: [{
            type: 'text',
            text: `✅ 板块已删除: ID ${target.id} | Label: ${target.label} | Value: ${target.value}\n注意: 已绑定该板块的持仓在 UI 上将显示为原始 value 值或“未设置”。`,
          }],
        }
      }
      catch (error: any) {
        return { isError: true, content: [{ type: 'text', text: `删除失败: ${error.message}` }] }
      }
    }

    return { isError: true, content: [{ type: 'text', text: 'Invalid action.' }] }
  },
})
