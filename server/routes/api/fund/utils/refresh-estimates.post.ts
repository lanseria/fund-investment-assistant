// server/routes/api/fund/utils/refresh-estimates.post.ts

export default defineEventHandler(async () => {
  try {
    // [REFACTOR] 调用新的函数，它会更新公共的 funds 表
    const result = await syncAllFundsEstimates()
    return {
      message: '所有基金公共估值刷新完成。',
      ...result,
    }
  }
  catch (error: any) {
    console.error('刷新所有基金估值时出错:', error)
    throw createError({
      statusCode: 500,
      message: `刷新失败: ${error.message}`,
    })
  }
})
