import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { dcaPlans } from '~~/server/database/schemas'
import { getUserFromEvent } from '~~/server/utils/auth'
import { useDb } from '~~/server/utils/db'
import { dcaPlanUpdateSchema, validatePlanRules } from '~~/server/utils/dcaPlan'
import { computeNextExecutionDate } from '~~/shared/dcaPlan'

export default defineEventHandler(async (event) => {
  const user = getUserFromEvent(event)
  const id = getRouterParam(event, 'id')

  if (!id)
    throw createError({ status: 400, statusText: 'Plan ID is required' })

  const body = await readBody(event)

  try {
    const patch = await dcaPlanUpdateSchema.parseAsync(body)
    const db = useDb()

    const plan = await db.query.dcaPlans.findFirst({
      where: and(eq(dcaPlans.id, Number(id)), eq(dcaPlans.userId, user.id)),
    })
    if (!plan)
      throw createError({ status: 404, statusText: '未找到该定投计划' })

    // 合并后再校验频率/锚点组合 (如周计划改月计划时锚点含义随之变化)
    const frequency = patch.frequency ?? plan.frequency
    // daily/biweekly 不使用锚点,统一置 null
    const noAnchor = frequency === 'daily' || frequency === 'biweekly'
    const anchorDay = patch.anchorDay !== undefined
      ? (noAnchor ? null : patch.anchorDay)
      : (noAnchor ? null : plan.anchorDay)
    const ruleError = validatePlanRules(frequency, anchorDay)
    if (ruleError)
      throw createError({ status: 400, statusText: ruleError })

    // 频率或扣款日变化时,基于今天重算下次扣款日;仅启停/改金额则保持原日期
    const ruleChanged = frequency !== plan.frequency || anchorDay !== plan.anchorDay
    const nextExecutionDate = ruleChanged
      ? computeNextExecutionDate(new Date(), frequency, anchorDay)
      : plan.nextExecutionDate

    const [record] = await db.update(dcaPlans)
      .set({
        amount: patch.amount !== undefined ? String(patch.amount) : plan.amount,
        frequency,
        anchorDay,
        enabled: patch.enabled ?? plan.enabled,
        nextExecutionDate,
        updatedAt: new Date(),
      })
      .where(eq(dcaPlans.id, plan.id))
      .returning()

    return { statusText: '定投计划已更新', record }
  }
  catch (error) {
    if (error instanceof z.ZodError) {
      throw createError({ status: 400, statusText: error.issues[0]?.message || '输入无效' })
    }
    throw error
  }
})
