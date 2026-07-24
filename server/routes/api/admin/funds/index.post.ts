import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { funds } from '~~/server/database/schemas'
import { getUserFromEvent } from '~~/server/utils/auth'
import { useDb } from '~~/server/utils/db'
import { findOrCreateFund } from '~~/server/utils/fundService'

// 仅需提供基金代码，基础信息由上游 Python 接口自动获取
const createFundSchema = z.object({
  code: z.string().length(6, '基金代码必须为6位').regex(/^\d{6}$/, '基金代码必须为6位数字'),
})

export default defineEventHandler(async (event) => {
  // 权限校验
  const admin = getUserFromEvent(event)
  if (admin.role !== 'admin')
    throw createError({ status: 403, statusText: 'Forbidden: Admins only' })

  const body = await readBody(event)
  const { code } = await createFundSchema.parseAsync(body)

  const db = useDb()

  // 已存在则直接返回 409
  const existing = await db.query.funds.findFirst({ where: eq(funds.code, code) })
  if (existing)
    throw createError({ status: 409, statusText: `基金 ${code} 已存在` })

  try {
    // 复用 findOrCreateFund：上游接口会自动识别真实 fundType 并写入历史净值/费率/实时估值
    // 新建时暂传 'open'，上游返回的 fundType 会覆盖
    const fund = await findOrCreateFund(code, 'open')
    setResponseStatus(event, 201) // Created
    return fund
  }
  catch (error: any) {
    // 上游接口对无效代码返回空数据时 fundService 抛出 Error
    throw createError({ status: 400, statusText: error.message || `无法获取基金 ${code} 的信息` })
  }
})
