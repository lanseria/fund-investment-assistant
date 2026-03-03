import { syncSectorStats } from '~~/server/utils/sectorSync'
import { isTradingDay } from '~~/shared/market'

export default defineTask({
  meta: {
    name: 'market:syncSectors',
    description: '定时同步东方财富和同花顺的板块分析数据',
  },
  async run() {
    const check = isTradingDay()
    if (!check.isTrading) {
      return { result: 'Skipped', reason: check.reason }
    }

    try {
      const count = await syncSectorStats()
      return { result: 'Success', count }
    }
    catch (e: any) {
      return { result: 'Failed', error: e.message }
    }
  },
})
