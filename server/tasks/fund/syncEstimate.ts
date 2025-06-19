/* eslint-disable no-console */
// [修改] 直接导入 syncAllHoldingsEstimates 函数
import { syncAllHoldingsEstimates } from '~~/server/utils/holdings'

export default defineTask({
  meta: {
    name: 'fund:syncEstimate',
    description: '盘中定时同步所有持仓基金的实时估值',
  },
  async run() {
    // [修改] 简化任务的 run 方法
    console.log('开始执行基金实时估值同步定时任务...')

    // 直接调用我们封装好的批量处理函数
    const result = await syncAllHoldingsEstimates()

    // syncAllHoldingsEstimates 内部已经有详细的日志，这里只打印一个结束标志
    console.log('基金实时估值同步定时任务完成。')

    // 返回更详细的执行结果
    return { result }
  },
})
