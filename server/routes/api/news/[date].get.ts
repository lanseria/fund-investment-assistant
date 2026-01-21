import { desc, eq } from 'drizzle-orm'
import { aiDailyAnalysis, dailyNews, newsItems } from '~~/server/database/schemas'
import { useDb } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  // 获取日期参数 (格式 YYYY-MM-DD)
  const dateStr = getRouterParam(event, 'date')

  if (!dateStr) {
    throw createError({ statusCode: 400, message: 'Date is required' })
  }

  const db = useDb()

  // 1. 获取 Raw 报告
  const rawRecord = await db.query.dailyNews.findFirst({
    where: eq(dailyNews.date, dateStr),
  })

  // 2. [新增] 获取 AI 分析
  const aiRecord = await db.query.aiDailyAnalysis.findFirst({
    where: eq(aiDailyAnalysis.date, dateStr),
  })

  // 3. 获取结构化列表
  const items = await db.query.newsItems.findMany({
    where: eq(newsItems.date, dateStr),
    orderBy: [desc(newsItems.id)],
  })

  return {
    date: dateStr,
    title: rawRecord?.title || null,
    content: rawRecord?.content || null, // Raw Markdown
    aiAnalysis: aiRecord?.content || null, // [新增] Extracted AI Analysis
    items: items || [], // Structured List
  }
})
