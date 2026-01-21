import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { dictionaryData, funds } from '~~/server/database/schemas'
import { useDb } from '~~/server/utils/db'

// 常量定义，需与系统保持一致
const SECTOR_DICT_TYPE = 'sectors'

export default defineMcpTool({
  name: 'set_fund_sector',
  description: '设置或修改基金的所属板块。注意：所选板块必须先存在于字典中（可使用 manage_sectors 查看或添加）。',
  inputSchema: {
    fundCode: z.string().length(6).describe('6位基金代码，例如 "005918"'),
    sectorValue: z.string().describe('板块的英文代码值 (value)，例如 "ai_applications"、"semiconductor"。'),
  },
  handler: async ({ fundCode, sectorValue }) => {
    // 1. 认证检查
    const event = useEvent()
    const userId = event.context.userId

    if (!userId) {
      return {
        isError: true,
        content: [{
          type: 'text',
          text: 'Authentication required. Please provide a valid API key.',
        }],
      }
    }

    const db = useDb()

    // 2. 检查基金是否存在
    const fund = await db.query.funds.findFirst({
      where: eq(funds.code, fundCode),
    })

    if (!fund) {
      return {
        isError: true,
        content: [{ type: 'text', text: `操作失败：系统中未找到基金代码 ${fundCode}。请先添加该基金。` }],
      }
    }

    // 3. 检查板块值是否有效 (必须在字典表中存在)
    const validSector = await db.query.dictionaryData.findFirst({
      where: and(
        eq(dictionaryData.dictType, SECTOR_DICT_TYPE),
        eq(dictionaryData.value, sectorValue),
      ),
    })

    if (!validSector) {
      return {
        isError: true,
        content: [{ type: 'text', text: `操作失败：板块代码 "${sectorValue}" 不存在。请先使用 manage_sectors 工具添加该板块。` }],
      }
    }

    try {
      // 4. 更新基金表
      await db.update(funds)
        .set({ sector: sectorValue })
        .where(eq(funds.code, fundCode))

      return {
        content: [{
          type: 'text',
          text: `✅ 设置成功！\n基金: ${fund.name} (${fundCode})\n板块: ${validSector.label} (${sectorValue})`,
        }],
      }
    }
    catch (error: any) {
      return {
        isError: true,
        content: [{ type: 'text', text: `数据库更新失败: ${error.message}` }],
      }
    }
  },
})
