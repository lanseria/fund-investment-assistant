/* eslint-disable no-console */
import dayjs from 'dayjs'
import { eq } from 'drizzle-orm'
import { aiDailyAnalysis, dailyNews, newsItems } from '~~/server/database/schemas'
import { processNewsWithAi } from '~~/server/utils/aiNews'
import { useDb } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  try {
    // 1. 读取 POST 请求体数据
    const body = await readBody(event)
    const { markdown } = body

    if (!markdown || !markdown.text) {
      console.warn('[Webhook] 收到的数据缺少 markdown.text 字段，跳过处理。')
      return { status: 'skipped', message: 'Missing markdown text' }
    }

    const todayStr = dayjs().format('YYYY-MM-DD')
    const incomingText = markdown.text
    const incomingTitle = markdown.title || 'TrendRadar 每日汇总'

    console.log(`[Webhook] 收到 TrendRadar 数据，日期: ${todayStr}，长度: ${incomingText.length}`)

    const db = useDb()

    // --- 1. 保存原始报告 (覆盖模式) ---
    const existingRecord = await db.query.dailyNews.findFirst({
      where: eq(dailyNews.date, todayStr),
    })

    if (existingRecord) {
      // [修改] 覆盖更新
      await db.update(dailyNews)
        .set({
          content: incomingText,
          updatedAt: new Date(),
        })
        .where(eq(dailyNews.id, existingRecord.id))
      console.log(`[Webhook] 今日 (${todayStr}) 原始报告已覆盖更新。`)
    }
    else {
      // 插入新记录
      await db.insert(dailyNews).values({
        date: todayStr,
        title: incomingTitle,
        content: incomingText,
      })
      console.log(`[Webhook] 已创建今日 (${todayStr}) 原始报告。`)
    }

    // --- 2. 提取并保存 AI 热点分析 (覆盖模式) ---

    // [核心修改] 使用针对性优化的正则进行分割
    // 匹配逻辑：找行首的 "# ✨ AI 热点分析" 或类似变体，并捕获其后所有内容
    const aiAnalysisRegex = /((?:^|\n)#+\s*(?:(?:🤖|✨)\s*)?AI\s*(?:热点|深度)?(?:分析|汇总|报告)[\s\S]*)/i
    const match = incomingText.match(aiAnalysisRegex)

    // 如果匹配到了，match[1] 就是包含标题在内的所有后续内容
    // .trim() 去除首尾多余空白
    const extractedAiContent = match ? match[1].trim() : null

    if (extractedAiContent) {
      console.log(`[Webhook] 成功提取 AI 分析板块，长度: ${extractedAiContent.length}`)

      const existingAnalysis = await db.query.aiDailyAnalysis.findFirst({
        where: eq(aiDailyAnalysis.date, todayStr),
      })

      if (existingAnalysis) {
        await db.update(aiDailyAnalysis)
          .set({
            content: extractedAiContent,
            updatedAt: new Date(),
          })
          .where(eq(aiDailyAnalysis.id, existingAnalysis.id))
      }
      else {
        await db.insert(aiDailyAnalysis).values({
          date: todayStr,
          content: extractedAiContent,
        })
      }
    }
    else {
      console.log('[Webhook] 未检测到 "### ✨ AI 热点分析" 或类似段落，跳过 AI 分析表更新。')
    }

    // --- 3. 触发 AI 清洗 (News Items) ---
    // (保持原有逻辑)
    try {
      // ... (此处保持不变，省略以节省空间) ...
      // 如果您需要这部分代码也请告诉我，通常这部分不需要变动
      console.log(`[Webhook] 开始 AI 清洗 (Structured Items)...`)
      const structuredItems = await processNewsWithAi(incomingText)

      if (structuredItems.length > 0) {
        await db.transaction(async (tx) => {
          await tx.delete(newsItems).where(eq(newsItems.date, todayStr))
          const rowsToInsert = structuredItems.map(item => ({
            date: todayStr,
            title: item.title,
            content: item.content,
            url: item.url,
            tag: item.tag,
          }))
          await tx.insert(newsItems).values(rowsToInsert)
        })
        console.log(`[Webhook] AI 清洗完成，已覆盖存入 ${structuredItems.length} 条结构化新闻。`)
      }
    }
    catch (aiError) {
      console.error(`[Webhook] AI 处理过程出错:`, aiError)
    }

    return {
      status: 'success',
      message: 'Data processed successfully (Overwritten)',
      date: todayStr,
    }
  }
  catch (error: any) {
    console.error('[Webhook] Error:', error)
    throw createError({ status: 500, statusText: 'Internal Server Error' })
  }
})
