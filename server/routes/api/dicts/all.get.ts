import { getUserFromEvent } from '~~/server/utils/auth'
import { useDb } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  // 权限校验：确保用户已登录即可访问
  // 如果未来需要，可以放开为公开接口
  getUserFromEvent(event)

  const db = useDb()
  // 一次性查询所有字典数据
  const allData = await db.query.dictionaryData.findMany({
    orderBy: (data, { asc }) => [asc(data.dictType), asc(data.sortOrder)],
  })

  // 将扁平的数据列表按 'dictType' 字段进行分组
  const grouped = allData.reduce((acc, item) => {
    const key = item.dictType;
    // 如果累加器中还没有这个 key，就初始化为一个空数组
    (acc[key] = acc[key] || []).push(item)
    return acc
  }, {} as Record<string, typeof allData>)

  return grouped
})
