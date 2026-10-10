/* eslint-disable no-console */
// server/tasks/ai/calibrateTiers.ts
// 每周档位策略 AI 校准任务:
// 对每只已配置档位的基金, 基于最新已确认净值/均线/RSI/乖离率让 AI 复核并调整档位,
// 新档位写回 funds.strategy_tiers 并落一条 source='ai' 的历史快照。
import { desc, eq, isNotNull } from 'drizzle-orm'
import OpenAI from 'openai'
import { z } from 'zod'
import { funds, navHistory } from '~~/server/database/schemas'
import { useDb } from '~~/server/utils/db'
import { setFundStrategyTiers } from '~~/server/utils/fundService'
import { buildTierIndicatorContext, describeStrategyTiers, evaluateStrategyTiers } from '~~/server/utils/tierStrategy'
import { normalizeStrategyTiers, parseStrategyTiers, strategyTiersSchema } from '~~/shared/strategyTiers'

/** AI 返回结构: 新档位 + 调整理由 */
const aiTiersResponseSchema = z.object({
  tiers: strategyTiersSchema,
  reason: z.string().min(1).max(2000),
})

/**
 * 校验 AI 产出的档位是否在安全护栏内, 返回 null 表示拒绝采纳 (保留旧档位):
 * - 买入百分比为可用现金的 0.5% ~ 50%
 * - 档位净值在最新净值合理区间内, 且低吸档低于最新净值、高抛档高于最新净值
 */
function guardAiTiers(tiers: unknown, nav: number) {
  const parsed = parseStrategyTiers(tiers)
  if (!parsed)
    return null
  for (const t of parsed.buyTiers) {
    if (t.percentOfCash < 0.5 || t.percentOfCash > 50)
      return null
    if (t.nav > nav * 1.05 || t.nav < nav * 0.65)
      return null
  }
  for (const t of parsed.sellTiers) {
    if (t.nav < nav * 0.95 || t.nav > nav * 1.35)
      return null
  }
  return normalizeStrategyTiers(parsed)
}

/** 取基金最近 300 条净值构建指标上下文 */
async function getContext(code: string) {
  const db = useDb()
  const rows = await db.select().from(navHistory).where(eq(navHistory.code, code)).orderBy(desc(navHistory.navDate)).limit(300)
  return buildTierIndicatorContext(rows.reverse().map(r => ({ date: r.navDate, nav: Number(r.nav) })))
}

const SYSTEM_PROMPT = [
  '你是基金档位策略校准器。档位策略结构: trigger(低吸前置条件 RSI14上限/bias20下限, 任一满足),',
  'buyTiers(净值≤阈值时买入用户可用现金的百分比 percentOfCash, 取最深满足档),, sellTiers(净值≥阈值减仓百分比, 取最高满足档),',
  'clearRule(泡沫清仓: RSI14与bias20同时越线), halveBelowMa250(低于年线低吸金额减半)。',
  '校准原则: 1) 以最新净值 (nav) 为基准重新铺档, 低吸第一档通常在 nav 下方 4%-8%, 每档间距 4%-6%, 越深百分比越大 (观察仓 3%-6%, 小额持仓 5%-12%, 核心仓 8%-18%);',
  '2) 高抛第一档参考 MA20/MA60 上方, 分 2-3 档;',
  '3) 保留原有的 trigger/clearRule/halveBelowMa250 语义, 除非指标显著变化;',
  '4) 单次调整保守: 百分比调整幅度一般不超过 ±30%;',
  '5) 只输出 JSON: { "tiers": <完整档位对象>, "reason": "<一句中文调整说明>" }, 不要输出其他内容。',
].join('\n')

function buildUserPrompt(fund: { code: string, name: string }, current: ReturnType<typeof parseStrategyTiers>, ctx: ReturnType<typeof buildTierIndicatorContext>, decision: ReturnType<typeof evaluateStrategyTiers>) {
  if (!current || !ctx || !decision)
    return ''
  return [
    `基金: ${fund.name} (${fund.code})`,
    `最新确认净值: ${ctx.nav} (${ctx.date})`,
    `MA20=${ctx.ma20} MA60=${ctx.ma60} MA250(年线)=${ctx.ma250}`,
    `RSI14=${ctx.rsi14} Bias20=${ctx.bias20}%`,
    `当前档位: ${describeStrategyTiers(current)}`,
    `当前档位决策: ${decision.action} - ${decision.reason}`,
    '请基于以上指标校准档位, 输出完整的新档位 JSON 与调整理由。',
  ].join('\n')
}

export default defineTask({
  meta: {
    name: 'ai:calibrateTiers',
    description: '每周对每只基金的档位策略进行 AI 分析校准并记录历史',
  },
  async run() {
    console.log('🧠 [AI CalibrateTiers] 档位校准任务触发...')
    const config = useRuntimeConfig()
    if (!config.openRouterApiKey) {
      console.error('系统未配置 OpenRouter API Key, 任务终止。')
      return { result: 'Failed', reason: 'missing api key' }
    }

    const db = useDb()
    const openai = new OpenAI({
      baseURL: config.openRouterBaseUrl,
      apiKey: config.openRouterApiKey,
      maxRetries: 3,
    })
    const model = config.aiCalibrateModel || 'deepseek-v4.1-flash'

    const fundRows = await db.query.funds.findMany({
      where: isNotNull(funds.strategyTiers),
      columns: { code: true, name: true, strategyTiers: true },
    })

    console.log(`共 ${fundRows.length} 只基金待校准。`)
    let ok = 0
    let skipped = 0
    let failed = 0

    for (const fund of fundRows) {
      const current = parseStrategyTiers(fund.strategyTiers)
      if (!current || !current.enabled) {
        skipped++
        continue
      }

      try {
        const ctx = await getContext(fund.code)
        if (!ctx) {
          skipped++
          continue
        }
        const decision = evaluateStrategyTiers(current, ctx)
        const userPrompt = buildUserPrompt(fund, current, ctx, decision)

        const completion = await openai.chat.completions.create({
          model,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.2,
        })
        const content = (completion.choices[0]?.message?.content || '')
          .replace(/^```json\s*/, '')
          .replace(/```$/, '')
          .trim()
        const validated = aiTiersResponseSchema.parse(JSON.parse(content))
        const guarded = guardAiTiers(validated.tiers, ctx.nav)
        if (!guarded) {
          console.warn(`[AI CalibrateTiers] ${fund.code} 产出超出护栏, 保留旧档位。reason: ${validated.reason.slice(0, 80)}`)
          failed++
          continue
        }

        await setFundStrategyTiers(fund.code, guarded, {
          source: 'ai',
          reason: validated.reason,
          context: ctx,
        })
        ok++
        console.log(`✅ ${fund.code} ${fund.name}: ${validated.reason.slice(0, 60)}`)
      }
      catch (e: any) {
        failed++
        console.error(`[AI CalibrateTiers] ${fund.code} 校准失败:`, e?.message ?? e)
      }
    }

    console.log(`🧠 [AI CalibrateTiers] 完成: 成功=${ok} 跳过=${skipped} 失败=${failed}`)
    return { result: 'OK', ok, skipped, failed }
  },
})
