// server/tasks/tier/repaveTiers.ts
// 每周档位重铺 (v1 金额制最小版)：每周一 08:00 以最新已确认净值重铺档位净值，
// 保留金额/触发条件/高抛比例，并把变更写入档位历史表。
/* eslint-disable no-console */
import { repaveAllFundTiers } from '~~/server/utils/tierRepave'

export default defineTask({
  meta: {
    name: 'tier:repaveTiers',
    description: '每周以最新确认净值重铺所有已配置基金的档位净值 (保留金额与触发条件) 并写入档位历史',
  },
  async run() {
    console.log('开始执行每周档位重铺任务...')
    const result = await repaveAllFundTiers()
    console.log(`每周档位重铺完成: total=${result.total} repaved=${result.repaved} unchanged=${result.unchanged} skipped=${result.skipped} failed=${result.failed}`)
    if (result.errors.length > 0)
      console.error('档位重铺失败明细:', result.errors)
    return { result }
  },
})
