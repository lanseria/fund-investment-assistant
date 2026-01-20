import { and, desc, eq, ilike, or } from 'drizzle-orm'
import { z } from 'zod'
import { newsItems } from '~~/server/database/schemas'
import { useDb } from '~~/server/utils/db'

export default defineMcpTool({
  name: 'search_market_news',
  description: '在本地新闻数据库中搜索市场情报。支持按关键词（搜索标题、内容、标签）和日期筛选。当用户询问“某板块最近有什么消息”或“某天发生了什么”时使用此工具。',
  inputSchema: {
    query: z.string().optional().describe('搜索关键词（例如："半导体"、"美联储"、"降息"）。将同时在标题、内容和标签中进行模糊匹配。'),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '格式需为 YYYY-MM-DD').optional().describe('特定日期 (YYYY-MM-DD)。如果只关心某一天的新闻请提供此参数。'),
    limit: z.number().min(1).max(50).default(15).optional().describe('返回的最大条目数，默认为 15。'),
  },
  handler: async ({ query, date, limit }) => {
    // 1. 认证检查
    const event = useEvent()
    const userId = event.context.userId

    if (!userId) {
      return {
        isError: true,
        content: [{
          type: 'text',
          text: 'Authentication required. Please provide a valid API key.',
        }],
      }
    }

    const db = useDb()
    const conditions = []

    // 2. 构建查询条件
    // 如果提供了日期
    if (date) {
      conditions.push(eq(newsItems.date, date))
    }

    // 如果提供了关键词 (使用 ilike 进行不区分大小写的模糊匹配)
    if (query && query.trim()) {
      const searchPattern = `%${query.trim()}%`
      conditions.push(or(
        ilike(newsItems.title, searchPattern),
        ilike(newsItems.content, searchPattern),
        ilike(newsItems.tag, searchPattern),
      ))
    }

    // 如果既没提供日期也没提供关键词，则默认返回最近的新闻
    // 这里不需要额外逻辑，conditions为空时 where(and(...[])) 等同于无条件，直接由 orderBy 决定返回最新的

    try {
      // 3. 执行查询
      const results = await db.select({
        date: newsItems.date,
        title: newsItems.title,
        content: newsItems.content,
        tag: newsItems.tag,
        url: newsItems.url,
      })
        .from(newsItems)
        .where(and(...conditions))
        .orderBy(desc(newsItems.date), desc(newsItems.id)) // 按日期倒序，同一天按ID倒序
        .limit(limit || 15)

      // 4. 结果处理
      if (results.length === 0) {
        return {
          content: [{
            type: 'text',
            text: `未找到符合条件的新闻 (Query: "${query || '无'}", Date: "${date || '无'}").`,
          }],
        }
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(results, null, 2),
        }],
      }
    }
    catch (error: any) {
      return {
        isError: true,
        content: [{
          type: 'text',
          text: `搜索出错: ${error.message}`,
        }],
      }
    }
  },
})
