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

const actionMeta: Record<string, { label: string, cls: string }> = {
  buy: { label: '低吸买入', cls: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' },
  sell: { label: '高抛减仓', cls: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
  clear: { label: '泡沫清仓', cls: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
  hold: { label: '持有观望', cls: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300' },
}

function num(v: number | null | undefined, digits = 4) {
  return v === null || v === undefined ? '—' : v.toFixed(digits)
}
</script>

<template>
  <section class="p-4 card">
    <header class="mb-4 flex items-center justify-between">
      <h2 class="text-base font-semibold flex gap-2 items-center">
        <div class="i-carbon-rule" />
        档位策略
      </h2>
      <button v-if="!draft" class="text-sm btn !px-3 !py-1.5" :disabled="loading" @click="initFromDefault">
        初始化默认档位
      </button>
    </header>

    <div v-if="loading && !data" class="flex h-60 items-center justify-center">
      <div class="i-carbon-circle-dash text-4xl text-primary animate-spin" />
    </div>

    <template v-else-if="data">
      <!-- 当前决策 -->
      <div v-if="data.decision && draft" class="text-sm mb-4 p-3 rounded-lg bg-gray-50 flex flex-wrap gap-2 items-center dark:bg-gray-800/50">
        <span class="font-medium px-2 py-0.5 rounded" :class="actionMeta[data.decision.action]?.cls">
          {{ actionMeta[data.decision.action]?.label }}
        </span>
        <span class="text-gray-600 dark:text-gray-300">{{ data.decision.reason }}</span>
        <span v-if="data.decision.action === 'buy'" class="text-green-600 font-semibold">
          建议买入 ¥{{ data.decision.amount }}
        </span>
        <span v-else-if="data.decision.action !== 'hold'" class="text-red-600 font-semibold">
          建议卖出 {{ data.decision.percent }}%
        </span>
      </div>

      <!-- 指标上下文 -->
      <div v-if="data.context" class="text-xs mb-4 gap-2 grid grid-cols-2 lg:grid-cols-6 sm:grid-cols-3">
        <div class="p-2 rounded bg-gray-50 dark:bg-gray-800/50">
          <div class="text-gray-400">
            净值 ({{ data.context.date ?? '最新' }})
          </div>
          <div class="font-mono">
            {{ num(data.context.nav) }}
          </div>
        </div>
        <div class="p-2 rounded bg-gray-50 dark:bg-gray-800/50">
          <div class="text-gray-400">
            MA20
          </div>
          <div class="font-mono">
            {{ num(data.context.ma20) }}
          </div>
        </div>
        <div class="p-2 rounded bg-gray-50 dark:bg-gray-800/50">
          <div class="text-gray-400">
            MA60
          </div>
          <div class="font-mono">
            {{ num(data.context.ma60) }}
          </div>
        </div>
        <div class="p-2 rounded bg-gray-50 dark:bg-gray-800/50">
          <div class="text-gray-400">
            年线 MA250
          </div>
          <div class="font-mono">
            {{ num(data.context.ma250) }}
          </div>
        </div>
        <div class="p-2 rounded bg-gray-50 dark:bg-gray-800/50">
          <div class="text-gray-400">
            RSI14
          </div>
          <div class="font-mono">
            {{ num(data.context.rsi14, 2) }}
          </div>
        </div>
        <div class="p-2 rounded bg-gray-50 dark:bg-gray-800/50">
          <div class="text-gray-400">
            Bias20 (%)
          </div>
          <div class="font-mono">
            {{ num(data.context.bias20, 2) }}
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
      <div v-if="!draft" class="text-sm text-gray-500 py-6 text-center">
        该基金尚未配置档位策略，点击右上角「初始化默认档位」基于最新净值 {{ num(data.latestNav) }} 生成模板后再调整。
      </div>

      <!-- 编辑器 -->
      <div v-if="draft" class="mt-4 space-y-4">
        <div class="text-sm flex flex-wrap gap-4 items-center">
          <label class="flex gap-2 items-center">
            <input v-model="draft.enabled" type="checkbox">
            启用档位策略
          </label>
          <label class="flex gap-2 items-center">
            <input v-model="draft.halveBelowMa250" type="checkbox">
            低于年线低吸减半
          </label>
        </div>

        <!-- 触发条件 -->
        <div class="p-3 border rounded-lg dark:border-gray-700">
          <div class="text-sm font-medium mb-2">
            低吸前置条件 (任一满足即可；留空表示仅按净值档位触发)
          </div>
          <div class="text-sm flex flex-wrap gap-4">
            <label class="flex gap-1 items-center">
              RSI14 ≤
              <input
                v-model.number="draft.trigger.rsi14Max"
                type="number" min="0" max="100" step="0.5"
                class="input-base !w-20"
                placeholder="如 35"
              >
              <button
                class="text-xs text-gray-400 hover:text-red-500"
                @click="draft.trigger.rsi14Max = null"
              >清除</button>
            </label>
            <label class="flex gap-1 items-center">
              Bias20 ≤
              <input
                v-model.number="draft.trigger.bias20MinPct"
                type="number" min="-100" max="0" step="0.5"
                class="input-base !w-20"
                placeholder="如 -5"
              >
              %
              <button
                class="text-xs text-gray-400 hover:text-red-500"
                @click="draft.trigger.bias20MinPct = null"
              >清除</button>
            </label>
          </div>
        </div>

        <!-- 低吸档位 -->
        <div class="p-3 border rounded-lg dark:border-gray-700">
          <div class="text-sm font-medium mb-2 flex items-center justify-between">
            <span>低吸档位 (净值 ≤ 阈值时买入，取最深满足档)</span>
            <button class="text-sm btn !px-3 !py-1" @click="addBuyTier">
              + 添加
            </button>
          </div>
          <div class="space-y-2">
            <div v-for="(tier, i) in draft.buyTiers" :key="i" class="text-sm flex gap-2 items-center">
              <span class="text-gray-400 w-14">第{{ i + 1 }}档</span>
              <span>净值 ≤</span>
              <input v-model.number="tier.nav" type="number" step="0.0001" min="0" class="input-base !w-28">
              <span>买入 ¥</span>
              <input v-model.number="tier.amount" type="number" step="100" min="0" class="input-base !w-28">
              <button class="text-gray-400 hover:text-red-500" @click="removeBuyTier(i)">
                <div class="i-carbon-trash-can" />
              </button>
            </div>
            <div v-if="draft.buyTiers.length === 0" class="text-xs text-gray-400">
              暂无低吸档位
            </div>
          </div>
        </div>

        <!-- 高抛档位 -->
        <div class="p-3 border rounded-lg dark:border-gray-700">
          <div class="text-sm font-medium mb-2 flex items-center justify-between">
            <span>高抛档位 (净值 ≥ 阈值时减仓，取最高满足档)</span>
            <button class="text-sm btn !px-3 !py-1" @click="addSellTier">
              + 添加
            </button>
          </div>
          <div class="space-y-2">
            <div v-for="(tier, i) in draft.sellTiers" :key="i" class="text-sm flex gap-2 items-center">
              <span class="text-gray-400 w-14">第{{ i + 1 }}档</span>
              <span>净值 ≥</span>
              <input v-model.number="tier.nav" type="number" step="0.0001" min="0" class="input-base !w-28">
              <span>减仓</span>
              <input v-model.number="tier.percent" type="number" step="5" min="1" max="100" class="input-base !w-20">
              <span>%</span>
              <button class="text-gray-400 hover:text-red-500" @click="removeSellTier(i)">
                <div class="i-carbon-trash-can" />
              </button>
            </div>
            <div v-if="draft.sellTiers.length === 0" class="text-xs text-gray-400">
              暂无高抛档位
            </div>
          </div>
        </div>

        <!-- 泡沫清仓 -->
        <div class="p-3 border rounded-lg dark:border-gray-700">
          <div class="text-sm font-medium mb-2">
            泡沫清仓条件 (两者同时满足时清仓)
          </div>
          <div v-if="draft.clearRule" class="text-sm flex flex-wrap gap-4">
            <label class="flex gap-1 items-center">
              RSI14 ≥
              <input
                v-model.number="draft.clearRule.rsi14Min"
                type="number" min="50" max="100" step="1"
                class="input-base !w-20"
                placeholder="如 85"
              >
            </label>
            <label class="flex gap-1 items-center">
              Bias20 ≥
              <input
                v-model.number="draft.clearRule.bias20MinPct"
                type="number" min="0" max="100" step="1"
                class="input-base !w-20"
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

        <div class="flex gap-3 items-center">
          <button class="btn-primary btn" :disabled="saving" @click="save">
            {{ saving ? '保存中...' : '保存档位策略' }}
          </button>
          <span v-if="data.summary" class="text-xs text-gray-400">{{ data.summary }}</span>
        </div>
      </div>
    </template>
  </section>
</template>
