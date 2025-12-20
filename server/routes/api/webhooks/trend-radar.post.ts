/* eslint-disable no-console */
// server/routes/api/webhooks/trend-radar.post.ts
import dayjs from 'dayjs'
import { eq } from 'drizzle-orm'
import { dailyNews } from '~~/server/database/schemas'
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

    // 2. 查询当天是否已有记录
    const existingRecord = await db.query.dailyNews.findFirst({
      where: eq(dailyNews.date, todayStr),
    })

    if (existingRecord) {
      // 3.A 如果存在，进行拼接 (追加模式)
      // 使用分隔符隔开多次推送的内容
      const separator = '\n\n---\n\n'
      const newContent = existingRecord.content + separator + incomingText

      await db.update(dailyNews)
        .set({
          content: newContent,
          updatedAt: new Date(), // 更新时间戳
        })
        .where(eq(dailyNews.id, existingRecord.id))

      console.log(`[Webhook] 已追加数据到今日 (${todayStr}) 记录。`)
    }
    else {
      // 3.B 如果不存在，创建新记录
      await db.insert(dailyNews).values({
        date: todayStr,
        title: incomingTitle,
        content: incomingText,
      })

      console.log(`[Webhook] 已创建今日 (${todayStr}) 新记录。`)
    }

    return {
      status: 'success',
      message: 'Data saved successfully',
      date: todayStr,
    }
  }
  catch (error: any) {
    console.error('[Webhook] 处理 TrendRadar 数据并保存数据库时出错:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Internal Server Error processing webhook',
    })
  }
})
