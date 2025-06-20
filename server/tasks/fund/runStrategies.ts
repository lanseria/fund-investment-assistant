// server/tasks/fund/runStrategies.ts
/* eslint-disable no-console */
import { runStrategiesForAllHoldings } from '~~/server/utils/strategies'

export default defineTask({
  meta: {
    name: 'fund:runStrategies',
    description: '每日为所有持仓基金执行策略分析并保存信号',
  },
  async run() {
    console.log('开始执行基金策略分析定时任务...')
    // 直接调用封装好的函数
    const result = await runStrategiesForAllHoldings()
    console.log('基金策略分析定时任务完成。')
    return { result }
  },
})
