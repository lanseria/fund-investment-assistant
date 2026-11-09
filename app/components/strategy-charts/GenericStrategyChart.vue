<script setup lang="ts">
import type { Hs300PenetrationDailySeries } from '~~/shared/hs300Penetration'
import type { EstimatePoint, RsiChartData } from '~/types/chart'
import type { HoldingHistoryPoint } from '~/types/holding'
import type { SectorCapitalHistoryResponse } from '~/types/sector'

defineProps<{
  history: HoldingHistoryPoint[]
  signals: any[]
  transactions?: any[] // 接收交易记录
  title: string
  dataZoomStart: number
  dataZoomEnd: number
  /** 板块主力行为历史（可选）。传入后将作为子图叠加在走势图下方 */
  sectorHistory?: SectorCapitalHistoryResponse['history']
  /** RSI 策略数据（可选）。传入后将作为子图叠加在走势图下方 */
  rsiData?: RsiChartData
  /** 当日盘中估值点（可选）。估值日期晚于历史最后净值日期时，以虚线延伸到该估值点 */
  estimate?: EstimatePoint
  /** 沪深300基金占比日频序列（可选）。传入后在主图叠加占比折线（右侧 % 轴），与净值同图对比 */
  penetrationDaily?: Hs300PenetrationDailySeries
  /** 用户持仓成本价（可选）。传入后在主图叠加一条水平「我的成本」虚线，直观对比当前净值的盈亏 */
  costPrice?: number | null
}>()

const emit = defineEmits(['signal-click', 'transaction-click'])

function handleSignalClick(signal: any) {
  emit('signal-click', signal)
}
function handleTransactionClick(tx: any) {
  emit('transaction-click', tx)
}
</script>

<template>
  <div class="p-4 card">
    <FundChart
      :history="history"
      :signals="signals"
      :transactions="transactions"
      :title="title"
      :data-zoom-start="dataZoomStart"
      :data-zoom-end="dataZoomEnd"
      :sector-history="sectorHistory"
      :rsi-data="rsiData"
      :estimate="estimate"
      :penetration-daily="penetrationDaily"
      :cost-price="costPrice"
      @signal-click="handleSignalClick"
      @transaction-click="handleTransactionClick"
    />
  </div>
</template>
