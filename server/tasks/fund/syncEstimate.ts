// server/tasks/fund/syncEstimate.ts

// 导入新的 syncAllFundsEstimates 函数
import { syncAllFundsEstimates } from '~~/server/utils/holdings'

export default defineTask({
  meta: {
    name: 'fund:syncEstimate',
    description: '盘中定时同步所有基金的实时估值 (更新公共 funds 表)',
  },
  async run() {
    // 调用我们封装好的批量处理函数
    const result = await syncAllFundsEstimates()
    // 任务完成后，通过 mitt 发出事件通知
    if (result.success > 0) {
      try {
        emitter.emit('holdings:updated')
      }
      catch (e) {
        console.error(`[Task] Failed to emit event:`, e)
      }
    }

    return { result }
  },
})
