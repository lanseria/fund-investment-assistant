// File: server/routes/api/fund/holdings/[code]/sync-history.post.ts

export default defineEventHandler(async (event) => {
  const code = getRouterParam(event, 'code')
  if (!code)
    throw createError({ statusCode: 400, message: 'Fund code is required.' })

  try {
    const count = await syncSingleFundHistory(code)
    return {
      message: `同步完成！新增 ${count} 条历史记录。`,
      count,
    }
  }
  catch (error) {
    if (error instanceof HoldingNotFoundError)
      throw createError({ statusCode: 404, message: error.message })

    console.error(`手动同步基金 ${code} 历史数据时出错:`, error)
    throw createError({ statusCode: 500, message: '同步失败，请查看服务器日志。' })
  }
})
