<script setup lang="ts">
import type { Hs300PenetrationResponse } from '~~/shared/hs300Penetration'
import { formatQuarterLabel } from '~~/shared/hs300Penetration'
import Hs300PenetrationChart from '~/components/hs300/Hs300PenetrationChart.vue'
import Hs300PenetrationDailyChart from '~/components/hs300/Hs300PenetrationDailyChart.vue'
import { appName } from '~/constants'
import { getChangeColorClass } from '~/utils/format'

useHead({
  title: `沪深300基金占比 - ${appName}`,
})

/** 是否让服务端绕过 30 分钟缓存强制重抓上游（点刷新按钮时为 true） */
const forceRefresh = ref(false)

const { data, pending, error, refresh } = useAsyncData<Hs300PenetrationResponse>(
  'hs300-penetration',
  () => apiFetch<Hs300PenetrationResponse>('/api/market/hs300-penetration', {
    params: forceRefresh.value
      ? { refresh: 1 }
      : undefined,
  }),
)

const isRefreshing = ref(false)

async function handleRefresh() {
  isRefreshing.value = true
  // 刷新按钮需要真正回源：带上 refresh=1 让服务端绕过内存缓存
  forceRefresh.value = true
  try {
    await refresh()
  }
  finally {
    forceRefresh.value = false
    isRefreshing.value = false
  }
}

const series = computed(() => data.value?.series ?? [])
const latest = computed(() => series.value.at(-1))
const prev = computed(() => series.value.at(-2))

/** 最新报告期相对上一季的占比变化（百分点，无上一季时为 0） */
const ratioDelta = computed(() => {
  if (!latest.value || !prev.value)
    return 0
  return latest.value.ratio - prev.value.ratio
})

// 时间范围筛选（年数；季度口径按 年数×4 个季度点，日频口径按自然日倒推）
const rangeOptions = [
  { key: 'near1y', label: '近1年', years: 1 },
  { key: 'near3y', label: '近3年', years: 3 },
  { key: 'near5y', label: '近5年', years: 5 },
  { key: 'all', label: '全部', years: 0 },
] as const

type RangeKey = typeof rangeOptions[number]['key']

const activeRange = ref<RangeKey>('all')

const activeRangeYears = computed(
  () => rangeOptions.find(option => option.key === activeRange.value)?.years ?? 0,
)

/** 季度口径 dataZoom 起点：按年数折算季度点数（近1年 = 4 个季度点） */
const quarterZoomStart = computed(() => {
  const pointCount = series.value.length
  const count = activeRangeYears.value * 4
  if (count <= 0 || pointCount <= 1 || pointCount <= count)
    return 0
  return ((pointCount - count) / (pointCount - 1)) * 100
})

/** 日频 dataZoom 起点：取「最后一个交易日 - 年数×365 天」之后的第一个下标 */
function computeDailyZoomStart(dates: readonly string[], years: number): number {
  if (years <= 0 || dates.length <= 1)
    return 0
  const lastDate = dates[dates.length - 1]!
  const lastTime = Date.parse(`${lastDate}T00:00:00Z`)
  if (!Number.isFinite(lastTime))
    return 0
  const threshold = new Date(lastTime - years * 365 * 86_400_000).toISOString().slice(0, 10)
  const index = dates.findIndex(date => date >= threshold)
  if (index <= 0)
    return 0
  return (index / (dates.length - 1)) * 100
}

// 口径切换：日频估算（默认）/ 季度官方；日频不可用时自动降级为季度
const daily = computed(() => data.value?.daily ?? null)
const hasDaily = computed(() => Boolean(daily.value && daily.value.dates.length > 0))

type ChartMode = 'daily' | 'quarter'

const chartMode = ref<ChartMode>('daily')

const effectiveMode = computed<ChartMode>(() => hasDaily.value
  ? chartMode.value
  : 'quarter')

const dailyZoomStart = computed(
  () => computeDailyZoomStart(daily.value?.dates ?? [], activeRangeYears.value),
)

const chartZoomStart = computed(() => effectiveMode.value === 'daily'
  ? dailyZoomStart.value
  : quarterZoomStart.value)

const chartSubtitle = computed(() => effectiveMode.value === 'daily'
  ? '左轴：合计规模（亿元） · 右轴：占流通市值比例（%） · 日频估算口径'
  : '左轴：规模（亿元） · 右轴：占流通市值比例（%） · 官方季报口径')

/** 季度明细行（含环比，按报告期倒序展示） */
interface DetailRow {
  date: string
  tradeDate: string
  totalNetAssets: number
  floatCap: number
  indexClose: number
  ratio: number
  /** 相对上一季的占比变化（pp），首期为 null */
  delta: number | null
}

const detailRows = computed<DetailRow[]>(() => {
  const points = series.value
  return points
    .map((point, index) => ({
      date: point.date,
      tradeDate: point.tradeDate,
      totalNetAssets: point.totalNetAssets,
      floatCap: point.floatCap,
      indexClose: point.indexClose,
      ratio: point.ratio,
      delta: index > 0
        ? point.ratio - points[index - 1]!.ratio
        : null,
    }))
    .reverse()
})

/** 环比百分点格式化：正数补 + */
function formatPp(value: number): string {
  return `${value > 0
    ? '+'
    : ''}${value.toFixed(2)}`
}

const updatedAtText = computed(() => {
  const raw = data.value?.meta.updatedAt
  if (!raw)
    return '-'
  const date = new Date(raw)
  return Number.isNaN(date.getTime())
    ? raw
    : date.toLocaleString('zh-CN')
})
</script>

<template>
  <div class="p-4 lg:p-8 sm:p-6">
    <header class="mb-6 flex flex-wrap gap-3 items-start justify-between">
      <div>
        <h1 class="text-2xl font-bold sm:text-3xl">
          沪深300基金占比
        </h1>
        <p class="text-gray-500 mt-1 dark:text-gray-400">
          头部沪深300指数基金规模占沪深300流通市值的比例（日频估算 / 官方季报双口径）
        </p>
      </div>
      <button
        class="icon-btn p-2"
        title="刷新数据"
        :class="{ 'animate-spin': pending || isRefreshing }"
        :disabled="pending || isRefreshing"
        @click="handleRefresh"
      >
        <div i-carbon-renew />
      </button>
    </header>

    <!-- 加载态 -->
    <div v-if="pending && !data" class="card flex h-64 items-center justify-center">
      <div i-carbon-circle-dash class="text-3xl text-primary animate-spin" />
    </div>

    <!-- 错误态 -->
    <EmptyState
      v-else-if="error"
      icon="i-carbon-warning-alt"
      message="加载失败"
      :description="error.message"
    >
      <button class="btn" :disabled="isRefreshing" @click="handleRefresh">
        重试
      </button>
    </EmptyState>

    <!-- 空数据 -->
    <EmptyState
      v-else-if="!data || data.series.length === 0"
      icon="i-carbon-chart-line"
      message="暂无数据"
      description="暂未获取到沪深300指数基金的季报规模数据，请稍后刷新重试"
    />

    <!-- 数据区 -->
    <div v-else-if="data && latest" class="space-y-6">
      <!-- 指标卡 -->
      <div class="mb-6 card gap-4 grid grid-cols-2 md:grid-cols-4">
        <StatCard
          label="最新占比"
          :value="`${latest.ratio.toFixed(2)}%`"
          :hint="`${formatQuarterLabel(latest.date)} 报告期`"
        />
        <StatCard
          label="头部基金合计规模"
          :value="`${(latest.totalNetAssets / 1e8).toFixed(0)} 亿元`"
          :hint="`${data.funds.length} 只基金合计`"
        />
        <StatCard
          label="沪深300流通市值"
          :value="`${(latest.floatCap / 1e12).toFixed(2)} 万亿元`"
        />
        <StatCard
          label="环比上季"
          :value="Number(ratioDelta.toFixed(2))"
          colored
          hint="个百分点"
        />
      </div>

      <!-- 时间范围 + 锚点信息 -->
      <div class="flex flex-wrap gap-3 items-center justify-between">
        <div class="p-1 rounded-lg bg-gray-100 flex flex-wrap gap-1 dark:bg-gray-800">
          <button
            v-for="option in rangeOptions"
            :key="option.key"
            class="text-xs px-3 py-1.5 rounded-md transition-colors"
            :class="activeRange === option.key
              ? 'bg-primary text-white'
              : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'"
            @click="activeRange = option.key"
          >
            {{ option.label }}
          </button>
        </div>
        <p class="text-xs text-gray-400 font-mono">
          锚点：{{ data.anchor.date }} · 指数 {{ data.anchor.indexClose.toFixed(2) }} 点
        </p>
      </div>

      <!-- 规模与占比走势（口径可切换：日频估算 / 季度官方） -->
      <div class="mb-6 p-4 card">
        <div class="mb-4 flex flex-wrap gap-2 items-center justify-between">
          <div class="flex flex-wrap gap-2 items-baseline">
            <h2 class="text-lg font-bold">
              头部基金规模与占比走势
            </h2>
            <span class="text-xs text-gray-400">{{ chartSubtitle }}</span>
          </div>
          <div class="p-1 rounded-lg bg-gray-100 flex gap-1 dark:bg-gray-800">
            <button
              class="text-xs px-3 py-1.5 rounded-md transition-colors disabled:op-40 disabled:cursor-not-allowed"
              :class="effectiveMode === 'daily'
                ? 'bg-primary text-white'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'"
              :disabled="!hasDaily"
              :title="hasDaily
                ? '日频估算口径（份额取最近季报，规模随 ETF 价格逐日折算）'
                : '日频估算暂不可用'"
              @click="chartMode = 'daily'"
            >
              日频（估算）
            </button>
            <button
              class="text-xs px-3 py-1.5 rounded-md transition-colors"
              :class="effectiveMode === 'quarter'
                ? 'bg-primary text-white'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'"
              title="官方季报口径"
              @click="chartMode = 'quarter'"
            >
              季度（官方）
            </button>
          </div>
        </div>
        <Hs300PenetrationDailyChart
          v-if="effectiveMode === 'daily' && daily"
          :daily="daily"
          :index-name="data.meta.indexName"
          :zoom-start="chartZoomStart"
          :zoom-end="100"
        />
        <Hs300PenetrationChart
          v-else
          :funds="data.funds"
          :series="series"
          :index-name="data.meta.indexName"
          :zoom-start="chartZoomStart"
          :zoom-end="100"
        />
      </div>

      <!-- 季度明细（保持官方季报口径，不随图表口径切换） -->
      <div class="card max-h-[60vh] overflow-auto">
        <div class="p-4 pb-2 flex flex-wrap gap-2 items-baseline">
          <h2 class="text-lg font-bold">
            季度明细
          </h2>
          <span class="text-xs text-gray-400">官方季报口径</span>
        </div>
        <table class="text-left w-full table-fixed">
          <thead class="border-b border-gray-200 bg-gray-50/95 top-0 sticky z-sticky backdrop-blur dark:border-gray-700 dark:bg-gray-800/95">
            <tr>
              <th class="text-xs text-gray-500 font-semibold px-4 py-3 w-[20%] uppercase">
                报告期
              </th>
              <th class="text-xs text-gray-500 font-semibold px-4 py-3 text-right w-[18%] uppercase">
                合计规模（亿元）
              </th>
              <th class="text-xs text-gray-500 font-semibold px-4 py-3 text-right w-[20%] uppercase">
                沪深300流通市值（万亿元）
              </th>
              <th class="text-xs text-gray-500 font-semibold px-4 py-3 text-right w-[14%] uppercase">
                指数收盘
              </th>
              <th class="text-xs text-gray-500 font-semibold px-4 py-3 text-right w-[14%] uppercase">
                占比（%）
              </th>
              <th class="text-xs text-gray-500 font-semibold px-4 py-3 text-right w-[14%] uppercase">
                环比（pp）
              </th>
            </tr>
          </thead>
          <tbody class="bg-white divide-gray-100 divide-y dark:bg-gray-900 dark:divide-gray-800">
            <tr
              v-for="row in detailRows"
              :key="row.date"
              class="transition-colors duration-150 hover:bg-gray-50/80 dark:hover:bg-gray-800/60"
            >
              <td class="px-4 py-3 align-middle">
                <div class="flex flex-col">
                  <span class="font-semibold dark:text-gray-100">{{ formatQuarterLabel(row.date) }}</span>
                  <span class="text-[10px] text-gray-400 font-mono">{{ row.tradeDate }}</span>
                </div>
              </td>
              <td class="px-4 py-3 text-right align-middle">
                <span class="text-sm text-gray-600 font-mono tabular-nums dark:text-gray-300">{{ (row.totalNetAssets / 1e8).toFixed(2) }}</span>
              </td>
              <td class="px-4 py-3 text-right align-middle">
                <span class="text-sm text-gray-600 font-mono tabular-nums dark:text-gray-300">{{ (row.floatCap / 1e12).toFixed(3) }}</span>
              </td>
              <td class="px-4 py-3 text-right align-middle">
                <span class="text-sm text-gray-600 font-mono tabular-nums dark:text-gray-300">{{ row.indexClose.toFixed(2) }}</span>
              </td>
              <td class="px-4 py-3 text-right align-middle">
                <span class="text-sm text-gray-700 font-mono font-semibold tabular-nums dark:text-gray-200">{{ row.ratio.toFixed(3) }}</span>
              </td>
              <td class="px-4 py-3 text-right align-middle">
                <span
                  v-if="row.delta !== null"
                  class="text-sm font-mono font-semibold tabular-nums"
                  :class="getChangeColorClass(row.delta)"
                >{{ formatPp(row.delta) }}</span>
                <span v-else class="text-sm text-gray-400">-</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 口径与数据来源 -->
      <div class="p-4 card">
        <h2 class="text-lg font-bold mb-3">
          口径与数据来源
        </h2>
        <div class="space-y-4">
          <div>
            <h3 class="text-sm font-semibold mb-1.5">
              口径说明
            </h3>
            <ul class="text-xs text-gray-500 list-disc list-inside space-y-1 dark:text-gray-400">
              <li v-for="(item, index) in data.meta.methodology" :key="index">
                {{ item }}
              </li>
            </ul>
          </div>
          <div>
            <h3 class="text-sm font-semibold mb-1.5">
              数据来源
            </h3>
            <ul class="text-xs text-gray-500 list-disc list-inside space-y-1 dark:text-gray-400">
              <li v-for="(item, index) in data.meta.dataSources" :key="index">
                {{ item }}
              </li>
            </ul>
          </div>
          <p class="text-xs text-gray-400">
            更新于 {{ updatedAtText }}
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
