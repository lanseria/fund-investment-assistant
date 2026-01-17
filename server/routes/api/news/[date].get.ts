import { desc, eq } from 'drizzle-orm'
import { dailyNews, newsItems } from '~~/server/database/schemas'
import { useDb } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  // 获取日期参数 (格式 YYYY-MM-DD)
  const dateStr = getRouterParam(event, 'date')

  if (!dateStr) {
    throw createError({ statusCode: 400, message: 'Date is required' })
  }

  const db = useDb()

  // 1. 获取 Raw 报告
  const record = await db.query.dailyNews.findFirst({
    where: eq(dailyNews.date, dateStr),
  })

  // 2. 获取结构化列表
  const items = await db.query.newsItems.findMany({
    where: eq(newsItems.date, dateStr),
    orderBy: [desc(newsItems.id)], // 后进先出
  })

  return {
    date: dateStr,
    title: record?.title || null,
    content: record?.content || null, // Raw Markdown
    items: items || [], // Structured List
  }
})
