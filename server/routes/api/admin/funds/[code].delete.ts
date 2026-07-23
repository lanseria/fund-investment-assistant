/* eslint-disable no-console */
import { eq } from 'drizzle-orm'
import { funds, navHistory, strategySignals } from '~~/server/database/schemas'
import { getUserFromEvent } from '~~/server/utils/auth'
import { useDb } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  // 权限校验
  const admin = getUserFromEvent(event)
  if (admin.role !== 'admin')
    throw createError({ status: 403, statusText: 'Forbidden: Admins only' })

  const code = getRouterParam(event, 'code')
  if (!code)
    throw createError({ status: 400, statusText: '基金代码 (code) 是必需的' })

  const db = useDb()

  // 1. 手动清理无外键约束的关联表：
  //    - navHistory (历史净值)
  //    - strategySignals (策略信号)
  //    holdings / fundFees / fundTransactions 由数据库 ON DELETE CASCADE 自动清理
  const [deletedNav, deletedSignals] = await Promise.all([
    db.delete(navHistory).where(eq(navHistory.code, code)),
    db.delete(strategySignals).where(eq(strategySignals.fundCode, code)),
  ])

  // 2. 删除基金主记录 (触发 holdings/fundFees/fundTransactions 的级联删除)
  const result = await db.delete(funds).where(eq(funds.code, code))

  if (result.rowCount === 0)
    throw createError({ status: 404, statusText: `未找到基金 ${code}` })

  console.log(
    `[Admin] 管理员 '${admin.username}' 删除了基金 ${code} `
    + `(净值记录: ${deletedNav.rowCount ?? 0}, 策略信号: ${deletedSignals.rowCount ?? 0})`,
  )

  // 成功删除，返回 204 No Content
  setResponseStatus(event, 204)
})
