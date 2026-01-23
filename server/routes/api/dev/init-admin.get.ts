/* eslint-disable no-console */
import { env } from 'node:process'

export default defineEventHandler(async () => {
  // [安全措施] 仅在开发环境中允许此操作
  if (env.NODE_ENV !== 'development') {
    throw createError({
      status: 403,
      statusText: 'Forbidden: This endpoint is only available in development mode.',
    })
  }

  console.log('API trigger received for task: init:admin')

  try {
    // 调用 'init:admin' 任务
    // 注意：runTask 返回一个 { result: any, success: boolean, ... } 结构的对象
    const taskResult = await runTask('initAdmin')

    if (taskResult.result === 'Success') {
      return {
        status: 200,
        statusText: 'Admin initialization task completed successfully.',
        details: 'Admin user has been created. Check server logs for credentials.',
      }
    }
    else if (taskResult.result === 'Skipped') {
      return {
        status: 200,
        statusText: 'Admin initialization task was skipped.',
        details: 'An admin user already exists.',
      }
    }
    else {
      // 如果任务内部有未捕获的错误，runTask 可能不会抛出，而是返回失败状态
      throw new Error('Task execution failed with an unknown result.')
    }
  }
  catch (error: any) {
    console.error('Error running init:admin task via API:', error)
    throw createError({
      status: 500,
      statusText: 'Failed to run the admin initialization task.',
      data: {
        error: error.message,
      },
    })
  }
})
