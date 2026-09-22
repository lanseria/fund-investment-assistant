import { asc, desc, eq } from 'drizzle-orm'
import { dcaPlans } from '~~/server/database/schemas'
import { getUserFromEvent } from '~~/server/utils/auth'
import { useDb } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const user = getUserFromEvent(event)
  const db = useDb()

  const plans = await db.query.dcaPlans.findMany({
    where: eq(dcaPlans.userId, user.id),
    // 启用中的在前,同组内按下次扣款日升序
    orderBy: [desc(dcaPlans.enabled), asc(dcaPlans.nextExecutionDate)],
    with: { fund: true },
  })

  return plans.map(plan => ({
    id: plan.id,
    fundCode: plan.fundCode,
    fundName: plan.fund?.name,
    amount: Number(plan.amount),
    frequency: plan.frequency,
    anchorDay: plan.anchorDay,
    enabled: plan.enabled,
    nextExecutionDate: plan.nextExecutionDate,
    lastExecutionDate: plan.lastExecutionDate,
  }))
})
