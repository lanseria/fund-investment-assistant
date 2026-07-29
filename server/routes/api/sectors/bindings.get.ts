import { getUserFromEvent } from '~~/server/utils/auth'
import { useDb } from '~~/server/utils/db'

/**
 * 公开只读接口：返回所有板块绑定关系。
 * 任意登录用户可读，供 /sector-capital 页面展示东财板块的绑定状态。
 */
export default defineEventHandler(async (event) => {
  // 需要登录
  getUserFromEvent(event)

  const db = useDb()
  const bindings = await db.query.sectorBindings.findMany()

  return bindings
})
