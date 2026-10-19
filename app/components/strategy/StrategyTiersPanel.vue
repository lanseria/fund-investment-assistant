<script setup lang="ts">
import type { StrategyTiers } from '~~/shared/strategyTiers'
import TierStrategyChart from './TierStrategyChart.vue'

/**
 * 档位策略面板：决策展示 + 档位手动配置 + 可视化图表。
 * 档位为基金级全局配置 (所有用户共享)，保存后 AI 分析与自动交易都会参考。
 */
const props = defineProps<{ code: string }>()

const toast = useToast()

interface StrategyResponse {
  code: string
  name: string
  latestNav: number
  defaultTiers: StrategyTiers
  tiers: StrategyTiers | null
  summary: string | null
  context: {
    nav: number
    date: string | null
    ma20: number | null
    ma60: number | null
    ma250: number | null
    rsi14: number | null
    bias20: number | null
  } | null
  decision: {
    action: 'buy' | 'sell' | 'clear' | 'hold'
    amount: number | null
    percent: number | null
    triggerMatched: boolean | null
    halved: boolean
    reason: string
  } | null
  series: {
    dates: string[]
    nav: number[]
    ma20: (number | null)[]
    ma60: (number | null)[]
    ma250: (number | null)[]
    rsi14: (number | null)[]
  } | null
}

const data = ref<StrategyResponse | null>(null)
const loading = ref(false)
const saving = ref(false)
/** 可编辑副本 */
const draft = ref<StrategyTiers | null>(null)

// --- 样式常量：组合 token 一次定义，模板复用 ---
/** 指标小卡 */
const metricCard = 'flex flex-col gap-0.5 p-2.5 rounded-lg bg-secondary'
const metricLabel = 'text-[10px] tracking-wide color-fade'
const metricValue = 'font-mono tabular-nums text-sm'
/** 分区块：浅表面 + 基础边框，再按语义叠加左侧色条 */
const section = 'p-3.5 rounded-lg border border-base bg-secondary/60'
const sectionHead = 'text-sm font-medium mb-3 flex items-center gap-2'
const sectionDesc = 'text-xs font-normal color-fade'
/** 档位编辑行 */
const tierRow = 'group/row text-sm flex flex-wrap gap-x-2 gap-y-1 items-center p-2 rounded-md transition-colors hover:bg-active'
const tierIndex = 'shrink-0 w-14 text-xs color-fade'
const tierNumInput = 'input-num !py-1'
const tierRemoveBtn = 'shrink-0 p-1 rounded op-40 hover:op-100 hover:text-red-500 hover:bg-red-500/10 transition-all cursor-pointer'

async function load() {
  loading.value = true
  try {
    data.value = await apiFetch<StrategyResponse>(`/api/fund/strategies/${props.code}`)
    draft.value = data.value.tiers
      ? JSON.parse(JSON.stringify(data.value.tiers)) as StrategyTiers
      : null
    if (draft.value && draft.value.clearRule === null)
      draft.value.clearRule = { rsi14Min: null, bias20MinPct: null }
  }
  catch (e: any) {
    toast.error(`档位策略加载失败: ${e?.message ?? e}`)
  }
  finally {
    loading.value = false
  }
}

onMounted(load)

// --- 档位设定历史 (手动编辑 / MCP 修改 / 每周重铺) ---
interface TiersHistoryRow {
  date: string
  source: string
  tiers: StrategyTiers
  nav: string | null
  rsi14: number | null
  bias20: number | null
  reason: string | null
  updatedAt: string
}

const historyVisible = ref(false)
const historyLoading = ref(false)
const historyRows = ref<TiersHistoryRow[]>([])

async function loadHistory() {
  historyLoading.value = true
  try {
    const res = await apiFetch<{ code: string, history: TiersHistoryRow[] }>(`/api/fund/strategies/${props.code}/history`, { params: { limit: 30 } })
    historyRows.value = res.history ?? []
  }
  catch (e: any) {
    toast.error(`档位历史加载失败: ${e?.message ?? e}`)
  }
  finally {
    historyLoading.value = false
  }
}

function toggleHistory() {
  historyVisible.value = !historyVisible.value
  if (historyVisible.value && historyRows.value.length === 0)
    loadHistory()
}

const sourceMeta: Record<string, { label: string, cls: string }> = {
  weekly: { label: '每周重铺', cls: 'bg-blue-500/10 text-blue-600 dark:text-blue-300' },
  manual: { label: '手动', cls: 'bg-secondary color-fade' },
  mcp: { label: 'MCP', cls: 'bg-purple-500/10 text-purple-600 dark:text-purple-300' },
  ai: { label: 'AI校准', cls: 'bg-amber-500/10 text-amber-600 dark:text-amber-300' },
  migrated: { label: '迁移', cls: 'bg-secondary color-fade' },
}

function buyTierText(t: { nav: number, amount?: number }): string {
  return `≤${t.nav} 买¥${t.amount ?? '-'}`
}

function historyTierSummary(row: TiersHistoryRow): string {
  return (row.tiers?.buyTiers ?? []).map(buyTierText).join('；')
}

function initFromDefault() {
  if (!data.value)
    return
  draft.value = JSON.parse(JSON.stringify(data.value.defaultTiers)) as StrategyTiers
  if (draft.value.clearRule === null)
    draft.value.clearRule = { rsi14Min: null, bias20MinPct: null }
}

function addBuyTier() {
  draft.value?.buyTiers.push({ nav: Number((data.value?.latestNav ?? 1) * 0.9), amount: 500 })
}
function addSellTier() {
  draft.value?.sellTiers.push({ nav: Number((data.value?.latestNav ?? 1) * 1.1), percent: 20 })
}
function removeBuyTier(i: number) {
  draft.value?.buyTiers.splice(i, 1)
}
function removeSellTier(i: number) {
  draft.value?.sellTiers.splice(i, 1)
}

async function save() {
  if (!draft.value)
    return
  saving.value = true
  try {
    await apiFetch(`/api/fund/strategies/${props.code}`, {
      method: 'PUT',
      body: { tiers: draft.value },
    })
    toast.success('档位策略已保存')
    await load()
  }
  catch (e: any) {
    toast.error(`保存失败: ${e?.message ?? e}`)
  }
  finally {
    saving.value = false
  }
}

/** 决策动作元信息：徽章、图标、横幅左侧色条 */
const actionMeta: Record<string, { label: string, cls: string, icon: string, banner: string }> = {
  buy: { label: '低吸买入', cls: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300', icon: 'i-carbon-arrow-down', banner: 'border-l-green-500' },
  sell: { label: '高抛减仓', cls: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300', icon: 'i-carbon-arrow-up', banner: 'border-l-red-500' },
  clear: { label: '泡沫清仓', cls: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300', icon: 'i-carbon-warning', banner: 'border-l-red-600' },
  hold: { label: '持有观望', cls: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300', icon: 'i-carbon-pause', banner: 'border-l-gray-400' },
}

/** 指标上下文卡片：由 context 派生，模板 v-for 渲染 */
const metrics = computed(() => {
  const c = data.value?.context
  if (!c)
    return []
  return [
    { label: `净值 ${c.date ?? '最新'}`, value: num(c.nav) },
    { label: 'MA20', value: num(c.ma20) },
    { label: 'MA60', value: num(c.ma60) },
    { label: '年线 MA250', value: num(c.ma250) },
    { label: 'RSI14', value: num(c.rsi14, 2) },
    { label: 'Bias20 (%)', value: num(c.bias20, 2) },
  ]
})

function num(v: number | null | undefined, digits = 4) {
  return v === null || v === undefined ? '—' : v.toFixed(digits)
}
</script>

<template>
  <section class="p-4 card md:p-5">
    <header class="mb-4 flex flex-wrap gap-3 items-center justify-between">
      <h2 class="text-base font-semibold flex gap-2.5 items-center">
        <span class="text-primary rounded-lg bg-primary/10 flex h-8 w-8 items-center justify-center">
          <div class="i-carbon-rule" />
        </span>
        档位策略
      </h2>
      <button v-if="!draft" class="btn-sm" :disabled="loading" @click="initFromDefault">
        初始化默认档位
      </button>
    </header>

    <div v-if="loading && !data" class="flex h-60 items-center justify-center">
      <div class="i-carbon-circle-dash text-4xl text-primary animate-spin" />
    </div>

    <template v-else-if="data">
      <!-- 当前决策 -->
      <div
        v-if="data.decision && draft"
        class="bg-secondary/60 text-sm mb-4 px-3.5 py-2.5 border border-base border-l-3 rounded-lg flex flex-wrap gap-x-3 gap-y-1.5 items-center"
        :class="actionMeta[data.decision.action]?.banner"
      >
        <span
          class="font-medium px-2 py-0.5 rounded flex shrink-0 gap-1 items-center"
          :class="actionMeta[data.decision.action]?.cls"
        >
          <div :class="actionMeta[data.decision.action]?.icon" />
          {{ actionMeta[data.decision.action]?.label }}
        </span>
        <span class="color-fade">{{ data.decision.reason }}</span>
        <span v-if="data.decision.action === 'buy'" class="text-green-600 font-mono font-semibold tabular-nums dark:text-green-400">
          建议买入 ¥{{ data.decision.amount }}
        </span>
        <span v-else-if="data.decision.action !== 'hold'" class="text-red-600 font-mono font-semibold tabular-nums dark:text-red-400">
          建议卖出 {{ data.decision.percent }}%
        </span>
      </div>

      <!-- 指标上下文 -->
      <div v-if="metrics.length > 0" class="mb-4 gap-2 grid grid-cols-2 lg:grid-cols-6 sm:grid-cols-3">
        <div v-for="m in metrics" :key="m.label" :class="metricCard">
          <div :class="metricLabel">
            {{ m.label }}
          </div>
          <div :class="metricValue">
            {{ m.value }}
          </div>
        </div>
      </div>

      <!-- 档位可视化 -->
      <TierStrategyChart
        v-if="draft && data.series && data.series.dates.length > 0"
        :series="data.series"
        :tiers="draft"
        title="净值 × 档位 × RSI14"
      />

      <!-- 未配置提示 -->
      <div v-if="!draft" class="text-sm color-fade py-8 text-center flex flex-col gap-2 items-center">
        <div class="i-carbon-chart-line-dashed text-3xl op-30" />
        <span>该基金尚未配置档位策略，点击右上角「初始化默认档位」基于最新净值 {{ num(data.latestNav) }} 生成模板后再调整。</span>
      </div>

      <!-- 编辑器 -->
      <div v-if="draft" class="mt-4 space-y-4">
        <div class="bg-secondary/60 text-sm p-3 rounded-lg flex flex-wrap gap-x-6 gap-y-2 items-center">
          <label class="flex gap-2 cursor-pointer select-none items-center">
            <input v-model="draft.enabled" type="checkbox" class="accent-primary">
            启用档位策略
          </label>
          <label class="flex gap-2 cursor-pointer select-none items-center">
            <input v-model="draft.halveBelowMa250" type="checkbox" class="accent-primary">
            低于年线低吸减半
          </label>
        </div>

        <!-- 触发条件 -->
        <div :class="section" class="border-l-3 border-l-blue-500/70">
          <div :class="sectionHead">
            <span class="i-carbon-filter text-blue-500" />
            低吸前置条件
            <span :class="sectionDesc">任一满足即可；留空表示仅按净值档位触发</span>
          </div>
          <div class="text-sm flex flex-wrap gap-x-6 gap-y-2">
            <label class="flex gap-1.5 items-center">
              RSI14 ≤
              <input
                v-model.number="draft.trigger.rsi14Max"
                type="number" min="0" max="100" step="0.5"
                :class="tierNumInput" class="!w-20"
                placeholder="如 35"
              >
              <button
                class="text-xs color-fade transition-colors hover:text-red-500"
                @click="draft.trigger.rsi14Max = null"
              >清除</button>
            </label>
            <label class="flex gap-1.5 items-center">
              Bias20 ≤
              <input
                v-model.number="draft.trigger.bias20MinPct"
                type="number" min="-100" max="0" step="0.5"
                :class="tierNumInput" class="!w-20"
                placeholder="如 -5"
              >
              %
              <button
                class="text-xs color-fade transition-colors hover:text-red-500"
                @click="draft.trigger.bias20MinPct = null"
              >清除</button>
            </label>
          </div>
        </div>

        <!-- 低吸档位 -->
        <div :class="section" class="border-l-3 border-l-green-500/70">
          <div class="mb-2 flex flex-wrap gap-2 items-center justify-between">
            <div :class="sectionHead">
              <span class="i-carbon-arrow-down text-green-500" />
              低吸档位
              <span :class="sectionDesc">净值 ≤ 阈值时买入，取最深满足档</span>
            </div>
            <button class="text-xs text-green-700 px-2 py-1 rounded-md bg-green-500/10 transition-colors dark:text-green-300 hover:bg-green-500/20" @click="addBuyTier">
              + 添加档位
            </button>
          </div>
          <div class="space-y-1.5">
            <div v-for="(tier, i) in draft.buyTiers" :key="i" :class="tierRow">
              <span :class="tierIndex">第{{ i + 1 }}档</span>
              <span>净值 ≤</span>
              <input v-model.number="tier.nav" type="number" step="0.0001" min="0" :class="tierNumInput" class="!w-28">
              <span>买入 ¥</span>
              <input v-model.number="tier.amount" type="number" step="100" min="0" :class="tierNumInput" class="!w-28">
              <button :class="tierRemoveBtn" title="删除该档位" @click="removeBuyTier(i)">
                <div class="i-carbon-trash-can" />
              </button>
            </div>
            <div v-if="draft.buyTiers.length === 0" class="text-xs color-fade py-3 text-center border border-base rounded-md border-dashed">
              暂无低吸档位
            </div>
          </div>
        </div>

        <!-- 高抛档位 -->
        <div :class="section" class="border-l-3 border-l-red-500/70">
          <div class="mb-2 flex flex-wrap gap-2 items-center justify-between">
            <div :class="sectionHead">
              <span class="i-carbon-arrow-up text-red-500" />
              高抛档位
              <span :class="sectionDesc">净值 ≥ 阈值时减仓，取最高满足档</span>
            </div>
            <button class="text-xs text-red-700 px-2 py-1 rounded-md bg-red-500/10 transition-colors dark:text-red-300 hover:bg-red-500/20" @click="addSellTier">
              + 添加档位
            </button>
          </div>
          <div class="space-y-1.5">
            <div v-for="(tier, i) in draft.sellTiers" :key="i" :class="tierRow">
              <span :class="tierIndex">第{{ i + 1 }}档</span>
              <span>净值 ≥</span>
              <input v-model.number="tier.nav" type="number" step="0.0001" min="0" :class="tierNumInput" class="!w-28">
              <span>减仓</span>
              <input v-model.number="tier.percent" type="number" step="5" min="1" max="100" :class="tierNumInput" class="!w-20">
              <span>%</span>
              <button :class="tierRemoveBtn" title="删除该档位" @click="removeSellTier(i)">
                <div class="i-carbon-trash-can" />
              </button>
            </div>
            <div v-if="draft.sellTiers.length === 0" class="text-xs color-fade py-3 text-center border border-base rounded-md border-dashed">
              暂无高抛档位
            </div>
          </div>
        </div>

        <!-- 泡沫清仓 -->
        <div :class="section" class="border-l-3 border-l-amber-500/70">
          <div :class="sectionHead">
            <span class="i-carbon-warning-alt text-amber-500" />
            泡沫清仓条件
            <span :class="sectionDesc">两者同时满足时清仓</span>
          </div>
          <div v-if="draft.clearRule" class="text-sm flex flex-wrap gap-x-6 gap-y-2">
            <label class="flex gap-1.5 items-center">
              RSI14 ≥
              <input
                v-model.number="draft.clearRule.rsi14Min"
                type="number" min="50" max="100" step="1"
                :class="tierNumInput" class="!w-20"
                placeholder="如 85"
              >
            </label>
            <label class="flex gap-1.5 items-center">
              Bias20 ≥
              <input
                v-model.number="draft.clearRule.bias20MinPct"
                type="number" min="0" max="100" step="1"
                :class="tierNumInput" class="!w-20"
                placeholder="如 20"
              >
              %
            </label>
          </div>
        </div>

        <textarea
          v-model="draft.note"
          class="input-base w-full" rows="2" maxlength="500"
          placeholder="备注 (仅供人读，不参与决策)"
        />

        <div class="flex flex-wrap gap-3 items-center">
          <button class="btn" :disabled="saving" @click="save">
            <span :class="saving ? 'i-carbon-circle-dash animate-spin' : 'i-carbon-save'" class="mr-1" />
            {{ saving ? '保存中...' : '保存档位策略' }}
          </button>
          <span v-if="data.summary" class="text-xs color-fade">{{ data.summary }}</span>
        </div>
      </div>

      <!-- 档位设定历史 -->
      <div class="mt-4 pt-3 border-t border-base">
        <button class="text-sm font-medium flex w-full items-center justify-between" @click="toggleHistory">
          <span class="flex gap-2 items-center">
            <span class="i-carbon-calendar text-primary" />
            档位设定历史
            <span class="text-xs color-fade font-normal">(手动 / MCP / 每周一重铺)</span>
          </span>
          <span class="i-carbon-chevron-down text-xs transition-transform" :class="{ 'rotate-180': historyVisible }" />
        </button>
        <div v-if="historyVisible" class="mt-3">
          <div v-if="historyLoading" class="flex h-16 items-center justify-center">
            <span class="i-carbon-circle-dash text-2xl text-primary animate-spin" />
          </div>
          <div v-else-if="historyRows.length === 0" class="text-xs color-fade py-4 text-center">
            暂无历史记录 (手动编辑、MCP 修改或每周一重铺后会产生快照)
          </div>
          <div v-else class="max-h-80 overflow-y-auto space-y-2">
            <div v-for="row in historyRows" :key="row.date + row.source" class="bg-secondary/60 text-xs p-2.5 rounded-lg">
              <div class="mb-1 flex flex-wrap gap-2 items-center">
                <span class="font-mono">{{ row.date }}</span>
                <span class="px-1.5 py-0.5 rounded" :class="sourceMeta[row.source]?.cls ?? sourceMeta.manual?.cls">
                  {{ sourceMeta[row.source]?.label ?? row.source }}
                </span>
                <span v-if="row.nav" class="color-fade">净值 {{ row.nav }}</span>
                <span v-if="row.rsi14 != null" class="color-fade">RSI14 {{ row.rsi14 }}</span>
                <span v-if="row.bias20 != null" class="color-fade">Bias20 {{ row.bias20 }}%</span>
              </div>
              <div class="color-fade">
                {{ historyTierSummary(row) }}
              </div>
              <div v-if="row.reason" class="color-fade mt-1">
                {{ row.reason }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </section>
</template>
