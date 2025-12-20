/* eslint-disable no-console */
// server/routes/api/webhooks/trend-radar.post.ts

export default defineEventHandler(async (event) => {
  try {
    // 1. 读取 POST 请求体数据
    const body = await readBody(event)

    // 2. 简单的日志记录 (后续可在此处添加写入数据库或消息队列的逻辑)
    console.log('\n==================================================')
    console.log(`[Webhook] 收到 TrendRadar 每日新闻推送`)
    console.log(`[Time]    ${new Date().toLocaleString()}`)
    console.log(`[Payload]`, JSON.stringify(body, null, 2))
    console.log('==================================================\n')

    // 3. 返回 200 OK 确认收到
    return {
      status: 'success',
      message: 'Data received',
      timestamp: new Date().toISOString(),
    }
  }
  catch (error: any) {
    console.error('[Webhook] 处理 TrendRadar 数据时出错:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Internal Server Error processing webhook',
    })
  }
})