// File: server/tasks/fund/runStrategies.ts
/* eslint-disable no-console */
import { ofetch } from 'ofetch'
import { strategySignals } from '~~/server/database/schemas'
import { useDb } from '~~/server/utils/db'

const STRATEGIES_TO_RUN = ['rsi', 'bollinger_bands', 'ma_cross', 'dual_confirmation']

const STRATEGIES_REQUIRING_HOLDING_STATUS = [
  'bollinger_bands',
  'ma_cross',
  'dual_confirmation',
]

export default defineTask({
  meta: {
    name: 'fund:runStrategies',
    description: '每日为所有持仓基金执行策略分析并保存信号',
  },
  async run() {
    console.log('开始执行基金策略分析任务...')
    const db = useDb()
    const config = useRuntimeConfig()
    const strategyApiBaseUrl = config.strategyApiUrl // 从 runtimeConfig 获取

    if (!strategyApiBaseUrl) {
      console.error('策略 API 地址 (NUXT_PUBLIC_STRATEGY_API_URL) 未配置，任务终止。')
      return { result: 'Failed: Missing config' }
    }

    const allHoldings = await db.query.holdings.findMany()
    let successCount = 0
    let errorCount = 0

    for (const holding of allHoldings) {
      for (const strategyName of STRATEGIES_TO_RUN) {
        try {
          const url = `${strategyApiBaseUrl}/strategies/${strategyName}/${holding.code}`
          const params: Record<string, any> = {}

          // [修改] 使用新的列表来判断是否需要添加 is_holding 参数
          if (STRATEGIES_REQUIRING_HOLDING_STATUS.includes(strategyName)) {
            params.is_holding = +holding.shares > 0
          }

          const signalData = await ofetch(url, { params })

          // 将获取到的数据插入新表
          await db.insert(strategySignals).values({
            fundCode: signalData.fund_code,
            strategyName: signalData.strategy_name,
            signal: signalData.signal,
            reason: signalData.reason,
            latestDate: signalData.latest_date,
            latestClose: signalData.latest_close,
            metrics: signalData.metrics,
          })
          console.log(`成功获取并保存基金 ${holding.code} 的 ${strategyName} 策略信号。`)
          successCount++
        }
        catch (e: any) {
          console.error(`获取基金 ${holding.code} 的 ${strategyName} 策略时出错:`, e.data?.detail || e.message)
          errorCount++
        }
      }
    }

    console.log(`基金策略分析任务完成。成功: ${successCount}, 失败: ${errorCount}`)
    return { result: JSON.stringify({ success: successCount, failed: errorCount }) }
  },
})
