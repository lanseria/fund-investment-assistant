import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { sectorBindings } from '~~/server/database/schemas'
import { getUserFromEvent } from '~~/server/utils/auth'
import { useDb } from '~~/server/utils/db'
import { findSectorFromUpstream } from '~~/server/utils/sectorSnapshot'

const updateBindingSchema = z.object({
  /** 东财板块代码 (BKxxxx) */
  sectorCode: z.string().min(1, '东财板块代码不能为空'),
  /** 板块类型：'industry' | 'concept' */
  sectorType: z.enum(['industry', 'concept']),
  /** 东财板块名称（可选） */
  sectorName: z.string().optional(),
})

/**
 * 管理员接口：修改板块绑定关系（重新绑定到另一个东财板块）。
 * 路径参数 dictValue 为项目板块 value（不可变，作为身份标识）。
 */
export default defineEventHandler(async (event) => {
  const admin = getUserFromEvent(event)
  if (admin.role !== 'admin')
    throw createError({ status: 403, statusText: 'Forbidden: Admins only' })

  const dictValue = getRouterParam(event, 'dictValue')
  if (!dictValue)
    throw createError({ status: 400, statusText: 'dictValue 是必需的' })

  const body = await readBody(event)
  const data = await updateBindingSchema.parseAsync(body)

  const db = useDb()

  // 尝试从上游获取板块名称
  let sectorName = data.sectorName
  if (!sectorName) {
    const upstream = await findSectorFromUpstream(data.sectorType, data.sectorCode)
    if (upstream)
      sectorName = upstream.name
  }

  const [updated] = await db.update(sectorBindings)
    .set({
      sectorCode: data.sectorCode,
      sectorType: data.sectorType,
      sectorName: sectorName ?? null,
    })
    .where(eq(sectorBindings.dictValue, dictValue))
    .returning()

  if (!updated)
    throw createError({ status: 404, statusText: `未找到项目板块 "${dictValue}" 的绑定关系` })

  return updated
})
