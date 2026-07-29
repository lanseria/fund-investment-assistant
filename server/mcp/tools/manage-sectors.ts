import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { dictionaryData, sectorBindings, users } from '~~/server/database/schemas'
import { useDb } from '~~/server/utils/db'
import { findSectorFromUpstream } from '~~/server/utils/sectorSnapshot'

// 板块在字典表中的固定类型编码
const SECTOR_DICT_TYPE = 'sectors'

export default defineMcpTool({
  name: 'manage_sectors',
  description: '【管理员专用】管理“板块”字典（对应前端 /account/dictionaries 页面中的 sectors 类别）。支持列出/增删改板块，以及将项目板块绑定到东财板块（BKxxxx）以便记录主力资金历史。',
  inputSchema: {
    action: z.enum(['list', 'add', 'update', 'delete', 'bind', 'unbind', 'list_bindings']).describe('操作类型：list (列出板块字典), add (新增), update (修改), delete (删除), bind (绑定东财板块), unbind (解绑东财板块), list_bindings (列出绑定关系)'),
    targetId: z.number().int().optional().describe('要修改或删除的板块数据项 ID。当 action 为 update 或 delete 时必填。'),
    label: z.string().min(1).optional().describe('板块的标签名 (UI 中显示，例如 “新能源”、“医药”)。add/update 时必填。'),
    value: z.string().min(1).optional().describe('板块的英文值 (程序中使用的唯一标识，例如 “new_energy”)。add 时必填；update 时若提供则修改；bind/unbind 时作为项目板块身份标识必填。'),
    sortOrder: z.number().int().optional().describe('排序权重 (整数，默认 0)。值越小越靠前。'),
    sectorCode: z.string().min(1).optional().describe('东财板块代码 (BKxxxx，例如 BK0428)。bind 时必填。'),
    sectorType: z.enum(['industry', 'concept']).optional().describe('东财板块类型：industry (行业) 或 concept (概念)。bind 时必填。'),
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

    // --- Action: Bind (绑定东财板块) ---
    if (args.action === 'bind') {
      if (!args.value || !args.sectorCode || !args.sectorType) {
        return { isError: true, content: [{ type: 'text', text: '绑定操作必须提供 value (项目板块值)、sectorCode (东财代码 BKxxxx)、sectorType (industry/concept)。' }] }
      }

      try {
        // 校验项目板块存在
        const dictItem = await db.query.dictionaryData.findFirst({
          where: and(eq(dictionaryData.dictType, SECTOR_DICT_TYPE), eq(dictionaryData.value, args.value)),
          columns: { id: true, label: true },
        })
        if (!dictItem) {
          return { isError: true, content: [{ type: 'text', text: `绑定失败: 项目板块 "${args.value}" 不存在。` }] }
        }

        // 校验东财板块存在于上游（同时获取名称）
        let sectorName: string | null = null
        const upstream = await findSectorFromUpstream(args.sectorType, args.sectorCode)
        if (upstream) {
          sectorName = upstream.name
        }

        // 检查是否已存在绑定（upsert：已存在则更新）
        const existing = await db.query.sectorBindings.findFirst({
          where: eq(sectorBindings.dictValue, args.value),
          columns: { id: true },
        })

        if (existing) {
          await db.update(sectorBindings)
            .set({ sectorCode: args.sectorCode, sectorType: args.sectorType, sectorName })
            .where(eq(sectorBindings.dictValue, args.value))
          return {
            content: [{ type: 'text', text: `✅ 已重新绑定: 项目板块 "${args.value}" (${dictItem.label}) → 东财板块 ${args.sectorCode} (${sectorName ?? '名称未知'})` }],
          }
        }

        await db.insert(sectorBindings).values({
          dictValue: args.value,
          sectorCode: args.sectorCode,
          sectorType: args.sectorType,
          sectorName,
        })

        return {
          content: [{ type: 'text', text: `✅ 绑定成功: 项目板块 "${args.value}" (${dictItem.label}) → 东财板块 ${args.sectorCode} (${sectorName ?? '名称未知'})` }],
        }
      }
      catch (error: any) {
        return { isError: true, content: [{ type: 'text', text: `绑定失败: ${error.message}` }] }
      }
    }

    // --- Action: Unbind (解绑东财板块) ---
    if (args.action === 'unbind') {
      if (!args.value) {
        return { isError: true, content: [{ type: 'text', text: '解绑操作必须提供 value (项目板块值)。' }] }
      }

      try {
        const result = await db.delete(sectorBindings).where(eq(sectorBindings.dictValue, args.value))
        if (result.rowCount === 0) {
          return { isError: true, content: [{ type: 'text', text: `解绑失败: 项目板块 "${args.value}" 未绑定东财板块。` }] }
        }
        return {
          content: [{ type: 'text', text: `✅ 已解绑: 项目板块 "${args.value}" 的东财板块绑定已删除。历史快照数据保留。` }],
        }
      }
      catch (error: any) {
        return { isError: true, content: [{ type: 'text', text: `解绑失败: ${error.message}` }] }
      }
    }

    // --- Action: List Bindings (列出绑定关系) ---
    if (args.action === 'list_bindings') {
      try {
        const list = await db.query.sectorBindings.findMany()

        if (list.length === 0) {
          return { content: [{ type: 'text', text: '当前没有任何板块绑定关系。' }] }
        }

        const formatted = list
          .map(b => `项目板块: ${b.dictValue} → 东财: ${b.sectorCode} (${b.sectorType}) | 名称: ${b.sectorName ?? '未知'}`)
          .join('\n')

        return {
          content: [{ type: 'text', text: `板块绑定关系共 ${list.length} 项:\n${formatted}` }],
        }
      }
      catch (error: any) {
        return { isError: true, content: [{ type: 'text', text: `查询失败: ${error.message}` }] }
      }
    }

    return { isError: true, content: [{ type: 'text', text: 'Invalid action.' }] }
  },
})
