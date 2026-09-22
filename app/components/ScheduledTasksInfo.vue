<script setup lang="ts">
/**
 * 定时任务说明：图标按钮 + 弹框。
 * 通过 scope 展示与当前页面相关的任务子集，
 * 任务清单与时间需与 nuxt.config.ts 中的 scheduledTasks 配置保持一致。
 */
interface ScheduledTask {
  time: string
  name: string
  desc: string
}

const props = withDefaults(defineProps<{ scope?: 'dashboard' | 'dailyOps' }>(), {
  scope: 'dashboard',
})

const TASK_GROUPS: Record<'dashboard' | 'dailyOps', { intro: string, tasks: ScheduledTask[] }> = {
  // 首页（持仓列表）：关注数据何时更新、交易何时生效
  dashboard: {
    intro: '持仓页的数据更新与交易结算由以下定时任务自动完成（北京时间）：',
    tasks: [
      { time: '02:00', name: 'fund:syncHistory', desc: '同步全部基金的历史净值，官方 T-1 净值入库并更新昨日净值。' },
      { time: '02:30', name: 'fund:processTransactions', desc: '交易结算：将「待处理」交易按最新确认净值成交（先卖后买），更新持仓与现金；基金转换先确认转出，再按实际到账金额买入。' },
      { time: '06:00', name: 'fund:runStrategies', desc: '为所有持仓基金运行策略分析，生成 RSI、布林带等买卖信号。' },
      { time: '09:30–16:30 每5分钟', name: 'fund:syncSelfEstimate', desc: '按重仓股实时行情加权自算估值（A股收盘后港股仍在交易，故放宽到 16:30）；黄金基金无重仓持仓，按国内金价 Au99.99 涨跌幅自算。与官方盘中估算并存。' },
      { time: '10:00–16:30 每半小时', name: 'fund:syncEstimate', desc: '同步盘中官方估值。' },
      { time: '14:30 工作日', name: 'ai:runAutoTrade', desc: '为开启 AI 代理的用户生成当日交易决策：auto 模式直接转为「待处理」，draft 模式生成「预操作」等待人工确认。' },
      { time: '17:30', name: 'fund:syncStockHoldings', desc: '同步重仓股持仓明细（季报口径，供自算估值），完成后触发一次自算估值。' },
    ],
  },
  // 每日操作：关注交易从生成到结算的生命周期
  dailyOps: {
    intro: '交易从生成到结算的生命周期由以下定时任务自动推进（北京时间）：AI 于交易日 14:30 生成决策，「待处理」交易在每日 02:30（历史净值同步完成后）按最新确认净值正式成交。',
    tasks: [
      { time: '02:00', name: 'fund:syncHistory', desc: '同步官方历史净值，为交易结算提供确认净值。' },
      { time: '02:30', name: 'fund:processTransactions', desc: '交易结算：将「待处理」交易按最新确认净值成交（先卖后买），更新持仓与现金；基金转换先确认转出，再按实际到账金额买入。' },
      { time: '10:00', name: 'fund:cleanDustShares', desc: '清理 AI 用户 ≤0.01 份的灰尘残留份额，归零后转为「仅关注」。' },
      { time: '14:30 工作日', name: 'ai:runAutoTrade', desc: '为开启 AI 代理的用户生成当日交易决策：auto 模式直接转为「待处理」，draft 模式生成「预操作」等待人工确认。' },
    ],
  },
}

const notes = [
  '周末与法定节假日，结算、估值、AI 交易等任务会通过内置的交易日校验自动跳过。',
  '执行时间可通过对应的 CRON_* 环境变量调整；本地开发模式默认禁用调度器（可用 DISABLE_SCHEDULER=false 开启）。',
]

const isModalOpen = ref(false)
const group = computed(() => TASK_GROUPS[props.scope])
</script>

<template>
  <button class="icon-btn" title="定时任务说明" @click="isModalOpen = true">
    <div class="i-carbon-timer text-lg" />
  </button>

  <Modal v-model="isModalOpen" title="定时任务说明">
    <p class="text-xs text-gray-500 leading-relaxed dark:text-gray-400">
      {{ group.intro }}
    </p>
    <ol class="mt-4 space-y-3">
      <li v-for="task in group.tasks" :key="task.name" class="flex flex-col gap-1 sm:flex-row sm:gap-3">
        <span class="text-xs text-gray-500 font-mono shrink-0 dark:text-gray-400 sm:text-right sm:w-40">{{ task.time }}</span>
        <div class="min-w-0">
          <code class="text-xs text-primary font-mono px-1.5 py-0.5 rounded bg-primary/5 break-all">{{ task.name }}</code>
          <p class="text-xs text-gray-600 leading-relaxed mt-1 dark:text-gray-300">
            {{ task.desc }}
          </p>
        </div>
      </li>
    </ol>
    <div class="text-xs text-gray-400 mt-4 pt-3 border-t border-gray-100 space-y-1.5 dark:text-gray-500 dark:border-gray-700">
      <p v-for="note in notes" :key="note" class="flex gap-1.5">
        <span class="i-carbon-information mt-0.5 shrink-0" />
        <span>{{ note }}</span>
      </p>
    </div>
  </Modal>
</template>
