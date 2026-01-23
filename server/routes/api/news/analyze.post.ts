import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { dailyNews, newsItems } from '~~/server/database/schemas'
import { processNewsWithAi } from '~~/server/utils/aiNews'
import { getUserFromEvent } from '~~/server/utils/auth'
import { useDb } from '~~/server/utils/db'

const analyzeSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
})

export default defineEventHandler(async (event) => {
  // 1. 权限校验
  getUserFromEvent(event)

  // 2. 参数校验
  const body = await readBody(event)
  const { date } = await analyzeSchema.parseAsync(body)

  const db = useDb()

  // 3. 获取当日原始报告
  const record = await db.query.dailyNews.findFirst({
    where: eq(dailyNews.date, date),
  })

  if (!record || !record.content) {
    throw createError({
      status: 404,
      statusText: '当日暂无原始报告数据，无法执行分析。',
    })
  }

  try {
    // 4. 执行 AI 清洗
    // console.log(`[Manual Analyze] 开始分析 ${date} 的新闻...`)
    const structuredItems = await processNewsWithAi(record.content)

    if (structuredItems.length === 0) {
      throw createError({
        status: 500,
        statusText: 'AI 未能提取有效信息，请检查原始报告内容是否为空或格式异常。',
      })
    }

    // 5. 数据库事务：清除旧数据并插入新数据
    await db.transaction(async (tx) => {
      // 先删除当日已有的结构化数据（避免重复）
      await tx.delete(newsItems).where(eq(newsItems.date, date))

      // 插入新数据
      const rowsToInsert = structuredItems.map(item => ({
        date,
        title: item.title,
        content: item.content,
        url: item.url,
        tag: item.tag,
      }))

      await tx.insert(newsItems).values(rowsToInsert)
    })

    return {
      message: `分析完成，生成 ${structuredItems.length} 条精选新闻。`,
      count: structuredItems.length,
    }
  }
  catch (error: any) {
    console.error('手动触发 AI 分析失败:', error)
    throw createError({
      status: 500,
      statusText: error.message || '分析过程中发生错误',
    })
  }
})
