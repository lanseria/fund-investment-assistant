import { eq } from 'drizzle-orm'
import { dictionaryData } from '~~/server/database/schemas'
import { getUserFromEvent } from '~~/server/utils/auth'
import { useDb } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const admin = getUserFromEvent(event)
  if (admin.role !== 'admin')
    throw createError({ status: 403, statusText: 'Forbidden: Admins only' })

  // 从 URL 路径中获取要删除的数据项 ID
  const id = getRouterParam(event, 'id')
  if (!id)
    throw createError({ status: 400, statusText: 'ID 是必需的' })

  const db = useDb()
  // 删除指定 ID 的数据项
  const result = await db.delete(dictionaryData).where(eq(dictionaryData.id, Number(id)))

  // Drizzle 的 delete 会返回一个包含 rowCount 的对象，可以用来检查是否真的删除了数据
  if (result.rowCount === 0)
    throw createError({ status: 404, statusText: '未找到要删除的字典数据项' })

  // 设置响应状态码为 204 No Content，表示成功但无返回体
  setResponseStatus(event, 204)
})
