<script setup lang="ts">
import type { PullbackAccount, PullbackStrategyResponse } from '~~/shared/pullbackStrategy'
import { computePullbackRiskPlan } from '~~/shared/pullbackStrategy'
import PullbackStrategyChart from './PullbackStrategyChart.vue'

/**
 * 「强势基金回调买入法（场外日线分批版）」面板：状态判定 + 风险计划 + 可视化 + 降级说明。
 *
 * 仅用于场外基金（页面按 fundType === 'open' 挂载，接口亦会二次校验）。
 * 仓位建议结合账户总资产/可用现金在前端计算（查看他人持仓时不计算）。
 */
const props = defineProps<{
  code: string
  targetUserId?: number | null
}>()

const holdingStore = useHoldingStore()

const { data, pending } = useAsyncData<PullbackStrategyResponse | null>(
  `fund-pullback-${props.code}`,
  () => apiFetch<PullbackStrategyResponse>(`/api/fund/holdings/${props.code}/pullback`).catch(() => null),
  { lazy: true, server: false, default: () => null },
)

const account = computed<PullbackAccount>(() => ({
  totalAssets: Number(holdingStore.summary?.totalAssets ?? 0),
  cash: Number(holdingStore.summary?.cash ?? 0),
}))

/** 查看他人持仓时账户资产不是同一人的，不做仓位建议 */
const riskPlan = computed(() => {
  if (props.targetUserId || !data.value?.levels)
    return null
  return computePullbackRiskPlan(data.value.levels, account.value, data.value.params)
})

interface StatusMeta { cls: string, icon: string, banner: string }

const FALLBACK_STATUS_META: StatusMeta = {
  cls: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
  icon: 'i-carbon-chart-line-data',
  banner: 'border-l-gray-400',
}

const statusMeta: Record<string, StatusMeta> = {
  buy_ready: { cls: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300', icon: 'i-carbon-arrow-down', banner: 'border-l-red-500' },
  watching: { cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300', icon: 'i-carbon-time', banner: 'border-l-amber-500' },
  breakdown: { cls: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300', icon: 'i-carbon-arrow-down-right', banner: 'border-l-gray-400' },
  not_strong: { cls: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300', icon: 'i-carbon-misuse', banner: 'border-l-gray-400' },
  no_base: { cls: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300', icon: 'i-carbon-misuse', banner: 'border-l-gray-400' },
  insufficient: { cls: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300', icon: 'i-carbon-data-base', banner: 'border-l-gray-400' },
}

function metaOf(status: string | undefined): StatusMeta {
  return (status ? statusMeta[status] : undefined) ?? FALLBACK_STATUS_META
}

const metricCard = 'flex flex-col gap-0.5 p-2.5 rounded-lg bg-secondary'
const metricLabel = 'text-[10px] tracking-wide color-fade'
const metricValue = 'font-mono tabular-nums text-sm'

function num(v: number | null | undefined, digits = 4) {
  return v === null || v === undefined || Number.isNaN(v) ? '—' : v.toFixed(digits)
}
function pct(v: number | null | undefined, digits = 2) {
  if (v === null || v === undefined || Number.isNaN(v))
    return '—'
  return `${v > 0 ? '+' : ''}${v.toFixed(digits)}%`
}
function lastOf(arr: (number | null)[] | undefined) {
  if (!arr || arr.length === 0)
    return null
  for (let i = arr.length - 1; i >= 0; i--) {
    if (arr[i] !== null && arr[i] !== undefined)
      return arr[i]
  }
  return null
}

const metrics = computed(() => {
  const d = data.value
  if (!d?.series || !d.params)
    return []
  const s = d.series
  const st = d.structure
  return [
    { label: `净值 ${d.latestDate ?? ''}`, value: num(d.latestNav) },
    { label: `EMA${d.params.emaFast}`, value: num(lastOf(s.emaFast)) },
    { label: `EMA${d.params.emaMid}`, value: num(lastOf(s.emaMid)) },
    { label: `EMA${d.params.emaSlow}`, value: num(lastOf(s.emaSlow)) },
    { label: '近1月涨幅', value: pct(st?.perf1m ?? null, 1) },
    { label: '近3月涨幅', value: pct(st?.perf3m ?? null, 1) },
    { label: '近6月涨幅', value: pct(st?.perf6m ?? null, 1) },
    { label: `${d.params.contractionWindow}日区间波动`, value: pct(lastOf(s.rangePct) ?? null, 1) },
  ]
})

/** 整理结构逐项判定 */
const structureRows = computed(() => {
  const d = data.value
  const st = d?.structure
  if (!d?.params || !st)
    return []
  const lows = st.swingLows.slice(-3).map(l => `${l.nav}(${l.date})`).join(' → ')
  return [
    {
      label: '强势前提',
      ok: st.strong,
      text: st.strong ? st.strongReasons.join('；') : `未达门槛（近1月≥${d.params.strongPerf.m1}% / 近3月≥${d.params.strongPerf.m3}% / 近6月≥${d.params.strongPerf.m6}%，任一满足）`,
    },
    {
      label: '回调低点抬高',
      ok: st.lowsRising === true,
      text: st.lowsRising === null ? '摆动低点不足，无法判定' : (st.lowsRising ? `最近低点 ${lows}` : `低点未抬高：${lows}`),
    },
    {
      label: '波动收敛',
      ok: st.contracting,
      text: st.contractionRatio === null ? '无法判定' : `近期/前期区间幅度 = ${st.contractionRatio}（≤${d.params.contractionRatio} 视为收敛）`,
    },
    {
      label: '站上均线',
      ok: st.aboveEma,
      text: st.aboveEma ? `净值同时位于 EMA${d.params.emaFast} 与 EMA${d.params.emaMid} 上方` : `净值未同时站上 EMA${d.params.emaFast}/EMA${d.params.emaMid}`,
    },
    {
      label: '均线方向',
      ok: st.emaFastUp && st.emaMidUp,
      text: `EMA${d.params.emaFast} ${st.emaFastUp ? '走平/向上' : '向下'} · EMA${d.params.emaMid} ${st.emaMidUp ? '走平/向上' : '向下'}`,
    },
    {
      label: '距区间高点',
      ok: st.drawdownFromHighPct <= 12,
      text: `回撤 ${st.drawdownFromHighPct}%（${d.params.structureLookback} 日区间高点）`,
    },
  ]
})

const zoneText = computed(() => {
  const z = data.value?.primaryZone
  if (!z)
    return '—'
  return `${z.low} ~ ${z.high}（${z.parts.map(p => p.label).join(' + ')}）`
})

/** 关键支撑区（成分得分最高者）：跌破判定失效时以它为准 */
const keyZoneText = computed(() => {
  const z = data.value?.keyZone
  if (!z)
    return '—'
  return `${z.low} ~ ${z.high}（${z.parts.map(p => p.label).join(' + ')}）`
})
</script>

<template>
  <!-- 加载中 -->
  <section v-if="!data && pending" class="p-4 card md:p-5">
    <div class="flex h-60 items-center justify-center">
      <div class="i-carbon-circle-dash text-4xl text-primary animate-spin" />
    </div>
  </section>

  <!-- 仅场外基金展示；场内或接口不可用时静默隐藏（页面已按 fundType 挂载） -->
  <section v-else-if="data?.supported" class="p-4 card md:p-5">
    <header class="mb-4 flex flex-wrap gap-3 items-center justify-between">
      <h2 class="text-base font-semibold flex gap-2.5 items-center">
        <span class="text-primary rounded-lg bg-primary/10 flex h-8 w-8 items-center justify-center">
          <div class="i-carbon-chart-line-data" />
        </span>
        回调买入法 · 场外日线分批版
      </h2>
      <div class="text-sm flex flex-wrap gap-2 items-center">
        <span
          class="font-medium px-2 py-0.5 rounded flex gap-1 items-center"
          :class="metaOf(data.status).cls"
        >
          <div :class="metaOf(data.status).icon" />
          {{ data.statusLabel }}
        </span>
      </div>
    </header>

    <!-- 策略状态横幅 -->
    <div
      class="bg-secondary/60 text-sm mb-4 px-3.5 py-2.5 border border-base border-l-3 rounded-lg flex flex-wrap gap-x-3 gap-y-1.5 items-center"
      :class="metaOf(data.status).banner"
    >
      <span class="color-fade">
        <template v-if="data.status === 'buy_ready'">
          价格回踩至支撑区并重新站上走平/向上的 EMA，符合回调买入法的日线触发条件；场外需按次日净值分批申购。
        </template>
        <template v-else-if="data.status === 'watching'">
          强势后进入整理（{{ data.structure?.contracting ? '波动收敛' : '低点抬高' }}），等待回踩支撑区后再分批低吸，不追高。
        </template>
        <template v-else-if="data.status === 'breakdown'">
          已跌破关键支撑区下沿（{{ keyZoneText }}），形态失效，继续等待新的整理结构，不接刀。
        </template>
        <template v-else-if="data.status === 'not_strong'">
          未满足强势前提，不符合"强势基金回调买入法"的选股条件。
        </template>
        <template v-else-if="data.status === 'no_base'">
          强势但尚未形成整理结构（低点抬高与波动收敛均未成立），暂不具备回调买点。
        </template>
        <template v-else>
          {{ data.dataNote }}
        </template>
      </span>
      <span v-if="data.structure" class="text-xs color-fade font-mono tabular-nums">
        主支撑区 {{ zoneText }}
      </span>
    </div>

    <!-- 指标快照 -->
    <div v-if="metrics.length > 0" class="mb-4 gap-2 grid grid-cols-2 lg:grid-cols-4 sm:grid-cols-3">
      <div v-for="m in metrics" :key="m.label" :class="metricCard">
        <div :class="metricLabel">
          {{ m.label }}
        </div>
        <div :class="metricValue">
          {{ m.value }}
        </div>
      </div>
    </div>

    <div class="mb-4 gap-4 grid lg:grid-cols-2">
      <!-- 整理结构判定 -->
      <div class="bg-secondary/60 p-3.5 border border-base rounded-lg">
        <div class="text-sm font-medium mb-3 flex gap-2 items-center">
          <span class="i-carbon-catalog text-primary" />
          整理结构判定
        </div>
        <div v-if="structureRows.length === 0" class="text-xs color-fade py-4 text-center">
          {{ data.dataNote ?? '历史净值不足，无法判定。' }}
        </div>
        <div v-else class="text-xs space-y-2">
          <div v-for="row in structureRows" :key="row.label" class="flex gap-2 items-start">
            <div
              class="mt-0.5 shrink-0"
              :class="row.ok ? 'i-carbon-checkmark-outline text-green-500' : 'i-carbon-close-outline color-fade'"
            />
            <span class="font-medium shrink-0 w-20">{{ row.label }}</span>
            <span class="color-fade">{{ row.text }}</span>
          </div>
        </div>
      </div>

      <!-- 风险计划：先定止损与仓位，再等触发下单 -->
      <div class="bg-secondary/60 p-3.5 border border-base rounded-lg">
        <div class="text-sm font-medium mb-3 flex gap-2 items-center">
          <span class="i-carbon-calculator text-primary" />
          风险计划（先定止损与仓位）
        </div>

        <div v-if="targetUserId" class="text-xs color-fade py-4 text-center">
          正在查看他人持仓，仓位建议按本人账户资产计算会失真，故此处不展示。
        </div>

        <template v-else-if="data.levels">
          <div class="text-xs space-y-2">
            <div class="flex justify-between">
              <span class="color-fade">进场参考（最新净值）</span>
              <b class="font-mono tabular-nums">{{ data.levels.entry }}</b>
            </div>
            <div class="flex justify-between">
              <span class="color-fade">止损参考</span>
              <b class="text-red-500 font-mono tabular-nums dark:text-red-400">{{ data.levels.stop }}（-{{ data.levels.stopPct }}%）</b>
            </div>
            <div class="flex justify-between">
              <span class="color-fade">每份风险 R</span>
              <b class="font-mono tabular-nums">{{ data.levels.perShareRisk }}</b>
            </div>
            <div v-for="t in data.levels.targets" :key="t.r" class="flex justify-between">
              <span class="color-fade">{{ t.r }}R 分批止盈</span>
              <b class="text-green-600 font-mono tabular-nums dark:text-green-400">{{ t.nav }} · 减 {{ t.portionPct }}%</b>
            </div>
            <div class="flex justify-between">
              <span class="color-fade">剩余仓位跟踪</span>
              <span class="font-mono tabular-nums">{{ data.levels.remainderPct }}% 跟随 EMA{{ data.params.emaFast }}，跌破则减仓</span>
            </div>
          </div>

          <div class="mt-3 pt-3 border-t border-base">
            <template v-if="riskPlan">
              <div class="text-xs space-y-2">
                <div class="flex justify-between">
                  <span class="color-fade">账户总资产 / 可用现金</span>
                  <span class="font-mono tabular-nums">¥{{ riskPlan.riskBase }} / ¥{{ account.cash }}</span>
                </div>
                <div class="flex justify-between">
                  <span class="color-fade">允许亏损（{{ data.params.riskPerTradePct }}% 账户风险）</span>
                  <b class="font-mono tabular-nums">¥{{ riskPlan.riskAmount }}</b>
                </div>
                <div class="flex justify-between">
                  <span class="color-fade">建议买入金额</span>
                  <b class="text-primary font-mono tabular-nums">¥{{ riskPlan.amount }}</b>
                </div>
                <div class="flex justify-between">
                  <span class="color-fade">估算份额 / 实际风险</span>
                  <span class="font-mono tabular-nums">{{ riskPlan.shares }} 份 / ¥{{ riskPlan.actualRisk }}</span>
                </div>
                <div class="flex justify-between">
                  <span class="color-fade">占账户 / 占现金</span>
                  <span class="font-mono tabular-nums">{{ riskPlan.amountPctOfAssets }}% / {{ riskPlan.amountPctOfCash }}%</span>
                </div>
              </div>
              <div v-if="riskPlan.cappedByCash" class="text-xs text-amber-600 mt-2 dark:text-amber-400">
                建议金额已按可用现金截断（理论金额 ¥{{ riskPlan.amountExact }}）。
              </div>
            </template>
            <div v-else class="text-xs color-fade">
              账户资产数据未就绪（等待持仓汇总加载），暂无法给出份额建议。
            </div>
          </div>

          <div class="text-xs color-fade leading-relaxed mt-3">
            止损口径：{{ data.levels.stopSource }}
            <span v-if="data.levels.stopTightened" class="text-amber-600 dark:text-amber-400">（支撑区距离超出 3% 纪律上限，已收紧）</span>
            <span v-if="data.levels.stopWidened" class="text-amber-600 dark:text-amber-400">（支撑过近，已按最小带宽外推）</span>
          </div>
        </template>

        <div v-else class="text-xs color-fade py-4 text-center">
          <template v-if="data.status === 'breakdown'">
            已跌破关键支撑区，形态失效，不生成进场计划；等待新的整理结构。
          </template>
          <template v-else-if="data.status === 'not_strong'">
            未满足强势前提，不属于回调买入法的适用对象，不生成进出场计划。
          </template>
          <template v-else>
            当前无可判定的支撑区，暂不生成进出场计划。
          </template>
        </div>
      </div>
    </div>

    <!-- 图表 -->
    <PullbackStrategyChart
      v-if="data.series"
      :series="data.series"
      :zones="data.zones"
      :primary-zone="data.primaryZone"
      :levels="data.levels"
      :signals="data.signals"
      :params="data.params"
      title="净值 × EMA × 支撑区 × R 倍数"
    />

    <!-- 场外降级说明：必须显式展示，避免按场内规则操作 -->
    <div class="bg-secondary/60 mt-4 p-3.5 border border-base border-l-3 border-l-amber-500/70 rounded-lg">
      <div class="text-sm font-medium mb-2 flex gap-2 items-center">
        <span class="i-carbon-warning-alt text-amber-500" />
        场外口径限制说明
      </div>
      <ul class="text-xs color-fade space-y-1.5">
        <li v-for="(item, i) in data.limitations" :key="i" class="flex gap-2">
          <span class="shrink-0">·</span>
          <span>{{ item }}</span>
        </li>
      </ul>
    </div>
  </section>
</template>
