import { z } from 'zod'
import { getUserFromEvent } from '~~/server/utils/auth'
import { FundNotFoundError } from '~~/server/utils/errors'
import { setFundStrategyTiers } from '~~/server/utils/fundService'
import { normalizeStrategyTiers, strategyTiersSchema } from '~~/shared/strategyTiers'

const bodySchema = z.object({
  /** null 表示清空档位 */
  tiers: strategyTiersSchema.nullable(),
  /** 变更理由 (可选, 记入历史快照) */
  reason: z.string().max(500).optional(),
})

/**
 * 保存基金的结构化档位策略 (全局共享)。
 */
export default defineEventHandler(async (event) => {
  getUserFromEvent(event)
  const code = getRouterParam(event, 'code')
  if (!code)
    throw createError({ status: 400, statusText: '基金代码不能为空。' })

  try {
    const body = await readBody(event)
    const { tiers, reason } = await bodySchema.parseAsync(body)
    const normalized = tiers === null ? null : normalizeStrategyTiers(tiers)
    const updated = await setFundStrategyTiers(code, normalized, { source: 'manual', reason: reason ?? undefined })
    return { code: updated.code, name: updated.name, tiers: updated.strategyTiers ?? null }
  }
  catch (error) {
    if (error instanceof FundNotFoundError)
      throw createError({ status: 404, statusText: error.message })
    if (error instanceof z.ZodError)
      throw createError({ status: 400, statusText: error.message || '档位数据无效。' })
    console.error(`保存基金 ${code} 档位策略时出错:`, error)
    throw createError({ status: 500, statusText: '服务器内部错误' })
  }
})
