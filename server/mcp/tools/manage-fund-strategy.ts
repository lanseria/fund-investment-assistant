import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { funds } from '~~/server/database/schemas'
import { useDb } from '~~/server/utils/db'
import { FundNotFoundError } from '~~/server/utils/errors'
import { setFundStrategyTiers } from '~~/server/utils/fundService'
import { describeStrategyTiers } from '~~/server/utils/tierStrategy'
import { parseStrategyTiers, strategyTiersSchema } from '~~/shared/strategyTiers'

export default defineMcpTool({
  name: 'manage_fund_strategy',
  description: '查看或修改基金的全局策略。策略为全局设置：所有用户查看同一只基金时共享同一份。现在以结构化档位策略为准 (低吸/高抛档位+触发条件，AI 分析与自动交易决策依据)；旧版自由文本仅作背景参考。支持 get (查看策略)、set (设置档位)、clear (清空策略)。',
  inputSchema: {
    action: z.enum(['get', 'set', 'clear']).describe('操作类型：get (查看策略) / set (设置或更新策略) / clear (清空策略)'),
    fundCode: z.string().length(6).describe('6位基金代码，例如 "161725"'),
    operationStrategy: z.string().max(2000).optional().describe('(已废弃) 旧版自由文本策略，仅供 get 查看历史内容；set 时忽略。新策略请使用 strategyTiers。'),
    strategyTiers: strategyTiersSchema.nullable().optional().describe('结构化档位策略 (JSON)。action="set" 时可选：传入则保存档位 (传 null 清空档位)；结构见 shared/strategyTiers.ts：{ version:1, enabled, trigger:{rsi14Max,bias20MinPct}, buyTiers:[{nav,amount}], sellTiers:[{nav,percent}], clearRule:{rsi14Min,bias20MinPct}|null, halveBelowMa250, note }。'),
  },
  handler: async ({ action, fundCode, strategyTiers }) => {
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

    // --- Action: Get (查看策略) ---
    if (action === 'get') {
      try {
        const fund = await db.query.funds.findFirst({
          where: eq(funds.code, fundCode),
          columns: { code: true, name: true, operationStrategy: true, strategyTiers: true },
        })

        if (!fund) {
          return {
            isError: true,
            content: [{ type: 'text', text: `基金 ${fundCode} 不存在，请先通过 manage_watchlist (action=add) 添加关注。` }],
          }
        }

        const tiers = parseStrategyTiers(fund.strategyTiers)
        const tiersText = tiers
          ? `\n结构化档位策略 (已配置): ${describeStrategyTiers(tiers)}`
          : '\n结构化档位策略: (未设置, 可通过 strategyTiers 参数配置)'
        return {
          content: [{
            type: 'text',
            text: `${fund.name} (${fund.code}) 的全局操作策略:\n${fund.operationStrategy || '(未设置)'}${tiersText}`,
          }],
        }
      }
      catch (error: any) {
        return { isError: true, content: [{ type: 'text', text: `查询失败: ${error.message}` }] }
      }
    }

    // --- Action: Set (设置/更新策略) ---
    if (action === 'set') {
      if (strategyTiers === undefined || strategyTiers === null) {
        return {
          isError: true,
          content: [{ type: 'text', text: 'action="set" 现在只接受 strategyTiers 结构化档位 (旧版自由文本已废弃)。传入档位 JSON；清空档位请使用 action="clear"。' }],
        }
      }

      try {
        await setFundStrategyTiers(fundCode, strategyTiers, {
          source: 'mcp',
          reason: 'MCP manage_fund_strategy set',
        })
        const db2 = useDb()
        const fund = await db2.query.funds.findFirst({ where: eq(funds.code, fundCode), columns: { code: true, name: true, strategyTiers: true } })
        const tiers = fund ? parseStrategyTiers(fund.strategyTiers) : null
        const updated = { code: fundCode, name: fund?.name ?? fundCode }
        return {
          content: [{
            type: 'text',
            text: `✅ 已更新基金 ${updated.name} (${updated.code}) 的档位策略:\n${tiers ? describeStrategyTiers(tiers) : '(未设置)'}\n注意: 该策略对所有用户共享, AI 分析与自动交易决策以档位策略为准。`,
          }],
        }
      }
      catch (error: any) {
        if (error instanceof FundNotFoundError) {
          return {
            isError: true,
            content: [{ type: 'text', text: `基金 ${fundCode} 不存在，请先通过 manage_watchlist (action=add) 添加关注。` }],
          }
        }
        return { isError: true, content: [{ type: 'text', text: `设置失败: ${error.message}` }] }
      }
    }

    // --- Action: Clear (清空策略) ---
    if (action === 'clear') {
      try {
        const updated = await setFundStrategyTiers(fundCode, null)
        return {
          content: [{
            type: 'text',
            text: `✅ 已清空基金 ${updated.name} (${updated.code}) 的档位策略。(旧版自由文本保留作历史参考, 不再参与决策)`,
          }],
        }
      }
      catch (error: any) {
        if (error instanceof FundNotFoundError) {
          return {
            isError: true,
            content: [{ type: 'text', text: `基金 ${fundCode} 不存在，请先通过 manage_watchlist (action=add) 添加关注。` }],
          }
        }
        return { isError: true, content: [{ type: 'text', text: `清空失败: ${error.message}` }] }
      }
    }

    return { isError: true, content: [{ type: 'text', text: 'Invalid action.' }] }
  },
})
