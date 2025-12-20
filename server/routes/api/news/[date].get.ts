// server/routes/api/news/[date].get.ts
import { eq } from 'drizzle-orm'
import { dailyNews } from '~~/server/database/schemas'
import { useDb } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  // 获取日期参数 (格式 YYYY-MM-DD)
  const dateStr = getRouterParam(event, 'date')

  if (!dateStr) {
    throw createError({ statusCode: 400, message: 'Date is required' })
  }

  const db = useDb()
  const record = await db.query.dailyNews.findFirst({
    where: eq(dailyNews.date, dateStr),
  })

  // 如果没有找到记录，返回空对象或特定状态，这里返回 null 内容让前端处理
  if (!record) {
    return {
      date: dateStr,
      content: null,
      title: null,
    }
  }

  return record
})
