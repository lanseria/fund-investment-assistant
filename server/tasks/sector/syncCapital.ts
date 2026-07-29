// server/tasks/sector/syncCapital.ts
/* eslint-disable no-console */
import { syncSectorCapitalSnapshot } from '~~/server/utils/sectorSnapshot'

/**
 * 每日板块主力资金快照任务。
 * 默认每个工作日 15:30 收盘后抓取所有已绑定板块的当日最终状态。
 */
export default defineTask({
  meta: {
    name: 'sector:syncCapital',
    description: '抓取所有已绑定板块的当日主力资金快照并落库',
  },
  async run() {
    console.log('开始执行板块主力资金快照任务...')
    try {
      const result = await syncSectorCapitalSnapshot()
      console.log(`板块主力资金快照任务完成：绑定 ${result.total} 个，保存 ${result.saved} 条，跳过 ${result.skipped} 个。`)
      return { result: 'Success', ...result }
    }
    catch (e) {
      console.error('板块主力资金快照任务失败:', e)
      return { result: 'Failed' }
    }
  },
})
