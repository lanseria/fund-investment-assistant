<!-- eslint-disable no-alert -->
<script setup lang="ts">
const props = withDefaults(defineProps<{
  isAiAgent: boolean
  aiTotalAmount?: number | string | null
  aiSystemPrompt?: string | null
  // 模式: 'immediate' (个人中心，独立保存) | 'form' (后台管理，仅表单)
  mode?: 'immediate' | 'form'
  loading?: boolean
}>(), {
  mode: 'immediate',
  loading: false,
})

const emit = defineEmits<{
  'update:isAiAgent': [value: boolean]
  'update:aiTotalAmount': [value: number]
  'update:aiSystemPrompt': [value: string]
  'toggle': [value: boolean] // 仅 immediate 模式使用
  'save-config': [] // 仅 immediate 模式使用
}>()

// 本地状态，用于绑定 input
const localAmount = ref(props.aiTotalAmount ? Number(props.aiTotalAmount) : 100000)
const localPrompt = ref(props.aiSystemPrompt || '')
const isEditingConfig = ref(false)

// 监听 props 变化同步到本地 (用于 Admin 模态框打开时回显)
watch(() => props.aiTotalAmount, val => localAmount.value = val ? Number(val) : 100000)
watch(() => props.aiSystemPrompt, val => localPrompt.value = val || '')

// 监听本地变化同步回父组件 (v-model 支持)
watch(localAmount, val => emit('update:aiTotalAmount', val))
watch(localPrompt, val => emit('update:aiSystemPrompt', val))

// 默认模板逻辑
const DEFAULT_PROMPT_TEMPLATE = `#### 1. Role & Profile
你是一位拥有15年实战经验的**资深量化策略分析师**，擅长多因子模型、网格交易及交易行为分析。你的核心职责是充当用户的“交易执行官”。
**核心指令**：结合 **JSON数据**（实时行情、持仓、自选、舆情、**近期交易记录**），对列表中的**每一个**标的（包括 holdings 和 watchlist）给出明确的交易决策。

#### 2. Constraints & Context
- **当前时间**: {{timestamp}}
- **资金体量**: 总资金 {{total_amount}} 元。
- **决策优先级**: 
  1. 宏观风险 > 2. **交易回溯逻辑 (Recent Transaction Check)** > 3. 技术面量化信号 > 4. 舆情。

#### 3. Workflow & Logic Process (全流程扫描)

**Step 1: 宏观定调 (Market Sentiment)**
- 分析 input 中的 \`market_indices\` 和 \`market_news\`，设定当日基础仓位策略（进攻/防御/撤退）。

**Step 2: 持仓全量诊断 (Holdings Audit) - 核心逻辑增强**
- **前置检查：交易回溯 (Recent Transaction Analysis)**
  - 读取 \`recentTransactions\` 数组中最近一次操作 \`LastOp\`。
  - **场景 A：刚卖出 (\`LastOp.type == 'sell'\`)**
    - 若 \`percentageChange\` (今日涨跌) 显示大跌 (>2%): **接回判断** —— 视为“做T成功”，建议**buy**接回筹码（金额 = \`LastOp.amount\` 或 50%）。
    - 若 \`percentageChange\` 显示上涨: **踏空判断** —— 除非出现强力买入信号，否则**严禁追高**，建议**hold**。
  - **场景 B：刚买入 (\`LastOp.type == 'buy'\`)**
    - 若今日仅微跌: **过热保护** —— 拒绝频繁补仓，建议**hold**。
    - 若今日大涨 (>3%): **网格止盈** —— 建议**sell**获利部分。

- **常规量化逻辑 (若无近期敏感操作)**
  - **强力减仓**: \`profitRate\` > 15% 且 signals 中含 '卖出'。
  - **防御减仓**: \`profitRate\` > 5% 且 出现死叉信号。
  - **左侧定投**: \`profitRate\` < -5% 且 signals 中含 '买入' (RSI低位)。
  - **止损清仓**: 逻辑崩坏或亏损 > 20%。

**Step 3: 自选股全量扫描 (Watchlist Audit)**
- **建仓**: signals 中含 '买入' 且宏观配合 -> **buy**。
- **观望**: 价格过高或下跌中继 -> **hold**。

#### 4. Output Format (Strict JSON)
必须严格返回如下 JSON 格式，不要包含 Markdown 标记：
{
  "decisions": [
    { 
      "fundCode": "000001", 
      "fundName": "某某基金",
      "action": "buy" | "sell" | "hold", 
      "amount": 1000, // 仅 buy 时需要
      "shares": 100,  // 仅 sell 时需要
      "reason": "策略分析：最近一次于3天前卖出，今日跌幅2.5%，触发做T接回逻辑..." 
    }
  ]
}`

function copyDefaultPrompt() {
  if (localPrompt.value && !confirm('当前编辑框已有内容，确定要覆盖为默认模板吗？'))
    return
  localPrompt.value = DEFAULT_PROMPT_TEMPLATE
}

function handleToggle() {
  const newState = !props.isAiAgent
  if (props.mode === 'immediate') {
    emit('toggle', newState)
  }
  else {
    emit('update:isAiAgent', newState)
  }
}
</script>

<template>
  <div class="mt-4 pt-4 border-t dark:border-gray-700">
    <h2 class="text-lg font-bold mb-3">
      AI 智能代理设置
    </h2>

    <!-- 主开关 -->
    <div class="mb-4 p-4 border rounded-lg bg-gray-50 flex items-center justify-between dark:border-gray-700 dark:bg-gray-800">
      <div>
        <div class="font-medium flex gap-2 items-center">
          <div class="i-carbon-bot text-xl" />
          AI 自动操作开关
        </div>
        <p class="text-xs text-gray-500 mt-1">
          开启后，系统将在每个交易日 14:40 自动执行 AI 分析与下单。
        </p>
      </div>
      <button
        class="border-2 border-transparent rounded-full inline-flex flex-shrink-0 h-6 w-11 cursor-pointer transition-colors duration-200 ease-in-out relative focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
        :class="isAiAgent ? 'bg-primary' : 'bg-gray-200 dark:bg-gray-600'"
        :disabled="loading"
        type="button"
        @click="handleToggle"
      >
        <span
          class="rounded-full bg-white h-5 w-5 inline-block pointer-events-none ring-0 shadow transform transition duration-200 ease-in-out"
          :class="isAiAgent ? 'translate-x-5' : 'translate-x-0'"
        />
      </button>
    </div>

    <!-- 高级配置折叠面板 -->
    <div class="border rounded-lg overflow-hidden dark:border-gray-700">
      <button
        class="p-4 bg-gray-50 flex w-full transition-colors items-center justify-between dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700"
        type="button"
        @click="isEditingConfig = !isEditingConfig"
      >
        <span class="font-medium flex gap-2 items-center">
          <div class="i-carbon-settings-adjust" />
          高级配置 (Prompt / 模型 / 资金)
        </span>
        <div class="i-carbon-chevron-down transition-transform" :class="{ 'rotate-180': isEditingConfig }" />
      </button>

      <!-- 展开的内容 -->
      <div v-if="isEditingConfig" class="p-4 border-t bg-white space-y-5 dark:border-gray-700 dark:bg-gray-900">
        <!-- 1. 资金设定 -->
        <div>
          <label class="text-sm text-gray-700 font-medium mb-1 block dark:text-gray-300">模拟总资金 (元)</label>
          <div class="relative">
            <span class="text-gray-500 left-3 top-2 absolute">¥</span>
            <input
              v-model.number="localAmount"
              type="number"
              class="input-base pl-7"
              placeholder="例如 100000"
            >
          </div>
          <p class="text-xs text-gray-400 mt-1">
            此金额将动态替换 Prompt 中的 <code v-pre class="px-1 rounded bg-gray-100 dark:bg-gray-800">{{ total_amount }}</code> 占位符。
          </p>
        </div>

        <!-- 3. System Prompt -->
        <div>
          <div class="mb-1 flex items-center justify-between">
            <label class="text-sm text-gray-700 font-medium block dark:text-gray-300">System Prompt (系统提示词)</label>
            <button type="button" class="text-xs text-primary hover:underline" @click="copyDefaultPrompt">
              复制默认模板
            </button>
          </div>
          <textarea
            v-model="localPrompt"
            rows="12"
            class="text-xs leading-relaxed font-mono input-base"
            placeholder="留空则使用系统默认 Prompt。支持 {{timestamp}} 和 {{total_amount}} 变量。"
          />
          <p class="text-xs text-gray-400 mt-1">
            提示：请保持 JSON 输出格式的约束，否则可能导致解析失败。
          </p>
        </div>

        <!-- 保存按钮 (仅在 Immediate 模式下显示) -->
        <div v-if="mode === 'immediate'" class="pt-2 flex justify-end">
          <button class="btn flex gap-2 items-center" :disabled="loading" @click="emit('save-config')">
            <div v-if="loading" class="i-carbon-circle-dash animate-spin" />
            保存配置
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
