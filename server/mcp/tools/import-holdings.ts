import { z } from 'zod'
import { importHoldingsData } from '~~/server/utils/holdingService'

export default defineMcpTool({
  name: 'import_holdings',
  description: '直接导入持仓数据（批量写入份额与成本价，立即生效，无需确认）。与前端"导入持仓"功能一致，适用于初始化账户或从其他平台迁移数据。默认跳过已存在的持仓；overwrite=true 时会先清空该用户的全部持仓与关注记录再导入（危险操作，需用户明确要求时才使用）。',
  inputSchema: {
    holdings: z.array(z.object({
      code: z.string().length(6).describe('6位基金代码，例如 "161725"'),
      shares: z.number().positive().describe('持有份额 (单位：份)'),
      costPrice: z.number().positive().describe('持仓成本价 (单位：元/份)'),
      fundType: z.enum(['open', 'qdii_lof']).optional().describe('基金类型：open (普通开放式/场外) 或 qdii_lof (场内/ETF/LOF)。默认 open。'),
    })).min(1).max(200).describe('要导入的持仓列表，单次最多 200 条。'),
    overwrite: z.boolean().optional().default(false).describe('是否覆盖模式：true = 先清空该用户全部持仓/关注记录后再导入（不可恢复）；false = 仅导入，已存在的基金将被跳过。默认 false。'),
  },
  handler: async ({ holdings, overwrite }) => {
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

    try {
      // 2. 调用 service 层完成导入（与前端导入功能共用逻辑）
      const result = await importHoldingsData(holdings, overwrite, userId)

      // 3. 构建结果反馈
      const lines: string[] = []
      if (overwrite) {
        lines.push('⚠️ 已清空原有持仓/关注记录。')
      }
      lines.push(`✅ 导入完成：成功 ${result.imported} 条，跳过 ${result.skipped} 条。`)

      if (result.skippedItems.length > 0) {
        lines.push('')
        lines.push('跳过明细：')
        for (const item of result.skippedItems) {
          lines.push(`- ${item.code}: ${item.reason}`)
        }
      }

      lines.push('')
      lines.push('可调用 get_portfolio 查看导入后的最新持仓。')

      return {
        content: [{
          type: 'text',
          text: lines.join('\n'),
        }],
      }
    }
    catch (error: any) {
      return {
        isError: true,
        content: [{
          type: 'text',
          text: `导入失败: ${error.message}`,
        }],
      }
    }
  },
})
