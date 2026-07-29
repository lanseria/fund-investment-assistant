import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { sectorBindings } from '~~/server/database/schemas'
import { getUserFromEvent } from '~~/server/utils/auth'
import { useDb } from '~~/server/utils/db'
import { findSectorFromUpstream } from '~~/server/utils/sectorSnapshot'

const createBindingSchema = z.object({
  /** 项目板块 value (字典 sectors 的 value) */
  dictValue: z.string().min(1, '项目板块 value 不能为空'),
  /** 东财板块代码 (BKxxxx) */
  sectorCode: z.string().min(1, '东财板块代码不能为空'),
  /** 板块类型：'industry' | 'concept' */
  sectorType: z.enum(['industry', 'concept']),
  /** 东财板块名称（可选，未提供时会尝试从上游获取） */
  sectorName: z.string().optional(),
})

/**
 * 管理员接口：创建板块绑定关系（1对1）。
 * 校验：dictValue 唯一；东财板块存在于上游（上游不可达时允许创建）。
 */
export default defineEventHandler(async (event) => {
  const admin = getUserFromEvent(event)
  if (admin.role !== 'admin')
    throw createError({ status: 403, statusText: 'Forbidden: Admins only' })

  const body = await readBody(event)
  const data = await createBindingSchema.parseAsync(body)

  const db = useDb()

  // 校验 dictValue 唯一（一个项目板块只能绑一个东财板块）
  const existing = await db.query.sectorBindings.findFirst({
    where: eq(sectorBindings.dictValue, data.dictValue),
  })
  if (existing)
    throw createError({ status: 409, statusText: `项目板块 "${data.dictValue}" 已绑定东财板块 ${existing.sectorCode}，请先解绑` })

  // 尝试从上游获取板块名称（同时校验板块代码存在）
  let sectorName = data.sectorName
  if (!sectorName) {
    const upstream = await findSectorFromUpstream(data.sectorType, data.sectorCode)
    if (upstream)
      sectorName = upstream.name
  }

  const [newBinding] = await db.insert(sectorBindings)
    .values({
      dictValue: data.dictValue,
      sectorCode: data.sectorCode,
      sectorType: data.sectorType,
      sectorName: sectorName ?? null,
    })
    .returning()

  setResponseStatus(event, 201)
  return newBinding
})
