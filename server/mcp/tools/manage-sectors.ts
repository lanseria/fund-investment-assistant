import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { dictionaryData } from '~~/server/database/schemas'
import { useDb } from '~~/server/utils/db'

// 定义常量，与 app/constants/index.ts 中的保持一致
const SECTOR_DICT_TYPE = 'sectors'

export default defineMcpTool({
  name: 'manage_sectors',
  description: '管理基金板块字典。支持列出所有板块(list)、添加新板块(add)或删除板块(delete)。在设置基金板块前，建议先 list 查看是否存在同名板块。',
  inputSchema: {
    action: z.enum(['add', 'delete', 'list']).describe('操作类型：add (添加), delete (删除), list (列出所有)'),
    label: z.string().optional().describe('板块中文名称。当 action="add" 时必填。'),
    value: z.string().regex(/^[a-z0-9_]+$/, '必须由小写字母、数字或下划线组成').optional().describe('板块英文代码。当 action="add" 或 "delete" 时必填。'),
  },
  handler: async ({ action, label, value }) => {
    // 1. 认证检查
    const event = useEvent()
    const userId = event.context.userId

    if (!userId) {
      return {
        isError: true,
        content: [{ type: 'text', text: 'Authentication required.' }],
      }
    }

    const db = useDb()

    if (action === 'list') {
      const sectors = await db.query.dictionaryData.findMany({
        where: eq(dictionaryData.dictType, SECTOR_DICT_TYPE),
        orderBy: (items, { asc }) => [asc(items.sortOrder), asc(items.id)],
      })

      if (sectors.length === 0) {
        return { content: [{ type: 'text', text: '当前没有任何板块定义。' }] }
      }

      // 格式化输出，方便 AI 查找对应关系
      const formatted = sectors.map(s => `- ${s.label} (Value: ${s.value})`).join('\n')
      return {
        content: [{ type: 'text', text: `现有板块列表:\n${formatted}` }],
      }
    }

    // --- Action: Add (添加) ---
    if (action === 'add') {
      if (!label || !value) {
        return { isError: true, content: [{ type: 'text', text: '添加操作必须提供 label 和 value。' }] }
      }
      try {
        const existing = await db.query.dictionaryData.findFirst({
          where: and(
            eq(dictionaryData.dictType, SECTOR_DICT_TYPE),
            eq(dictionaryData.value, value),
          ),
        })

        if (existing) {
          return {
            isError: true,
            content: [{ type: 'text', text: `添加失败：板块代码 "${value}" 已存在 (对应名称: ${existing.label})。` }],
          }
        }

        await db.insert(dictionaryData).values({
          dictType: SECTOR_DICT_TYPE,
          label,
          value,
          sortOrder: 0,
        })

        return {
          content: [{
            type: 'text',
            text: `✅ 已成功添加板块：${label} (代码: ${value})。`,
          }],
        }
      }
      catch (error: any) {
        if (error.code === '23503') {
          return { isError: true, content: [{ type: 'text', text: `系统错误：字典类型 "${SECTOR_DICT_TYPE}" 不存在。` }] }
        }
        return { isError: true, content: [{ type: 'text', text: `数据库错误: ${error.message}` }] }
      }
    }

    // --- Action: Delete (删除) ---
    if (action === 'delete') {
      if (!value) {
        return { isError: true, content: [{ type: 'text', text: '删除操作必须提供 value。' }] }
      }
      try {
        const result = await db.delete(dictionaryData)
          .where(and(
            eq(dictionaryData.dictType, SECTOR_DICT_TYPE),
            eq(dictionaryData.value, value),
          ))

        if (result.rowCount === 0) {
          return {
            isError: true,
            content: [{ type: 'text', text: `删除失败：未找到代码为 "${value}" 的板块。` }],
          }
        }

        return {
          content: [{
            type: 'text',
            text: `✅ 已成功删除板块代码：${value}。`,
          }],
        }
      }
      catch (error: any) {
        return { isError: true, content: [{ type: 'text', text: `删除操作出错: ${error.message}` }] }
      }
    }

    return { isError: true, content: [{ type: 'text', text: 'Invalid action.' }] }
  },
})
