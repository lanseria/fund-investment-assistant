<script setup lang="ts">
import { marketGroups } from '~~/shared/market'

const marketStore = useMarketStore()
// [核心修改] 从 store 中获取完整的 indices 对象，而不仅仅是激活的
const { activeGroup, indices, activeGroupIndices, sseStatus } = storeToRefs(marketStore)

// [核心修改] 创建一个新的计算属性，用于生成每个分组的涨跌统计和颜色
const groupSummaries = computed(() => {
  // Object.entries 将 marketGroups 转换为 [key, value] 数组，方便遍历
  return Object.entries(marketGroups).map(([key, group]) => {
    let risers = 0 // 上涨数量
    let fallers = 0 // 下跌数量

    // 遍历当前分组下的所有指数代码
    for (const code of group.codes) {
      const indexData = indices.value[code]
      if (indexData) {
        if (indexData.changeRate > 0)
          risers++
        else if (indexData.changeRate < 0)
          fallers++
      }
    }

    // 根据涨跌数量决定分组的整体颜色
    let color: 'red' | 'green' | 'gray' = 'gray'
    if (risers > fallers)
      color = 'red'
    else if (fallers > risers)
      color = 'green'

    return {
      key: key as keyof typeof marketGroups,
      label: group.label,
      risers,
      fallers,
      color,
    }
  })
})

// [核心修改] 一个辅助函数，根据状态返回不同的样式类，让模板更清晰
function getGroupButtonClass(summary: typeof groupSummaries.value[0]) {
  const isActive = activeGroup.value === summary.key
  if (isActive)
    return 'bg-primary text-white border-primary shadow-md'

  switch (summary.color) {
    case 'red':
      return 'border-red-500/30 text-red-500 bg-red-500/5 hover:bg-red-500/10 dark:border-red-400/30 dark:text-red-400 dark:bg-red-400/5 dark:hover:bg-red-400/10'
    case 'green':
      return 'border-green-500/30 text-green-500 bg-green-500/5 hover:bg-green-500/10 dark:border-green-400/30 dark:text-green-400 dark:bg-green-400/5 dark:hover:bg-green-400/10'
    default:
      return 'border-gray-500/30 text-gray-500 bg-gray-500/5 hover:bg-gray-500/10 dark:border-gray-400/30 dark:text-gray-400 dark:bg-gray-400/5 dark:hover:bg-gray-400/10'
  }
}
</script>

<template>
  <div class="mb-8">
    <!-- [重构] 新的分组切换器 -->
    <div class="mb-4 flex flex-wrap gap-3">
      <button
        v-for="summary in groupSummaries"
        :key="summary.key"
        class="text-sm font-semibold p-2 border rounded-lg flex flex-col h-16 min-w-24 transition-all duration-200 items-center justify-center"
        :class="getGroupButtonClass(summary)"
        @click="marketStore.setActiveGroup(summary.key)"
      >
        <!-- 分组名称 -->
        <span class="text-base">{{ summary.label }}</span>
        <!-- 涨跌统计 -->
        <div class="text-xs font-numeric mt-1 flex gap-2 items-center">
          <span class="text-red-500 flex items-center dark:text-red-400">
            <div i-carbon-arrow-up class="mr-0.5" /> {{ summary.risers }}
          </span>
          <span class="text-green-500 flex items-center dark:text-green-400">
            <div i-carbon-arrow-down class="mr-0.5" /> {{ summary.fallers }}
          </span>
        </div>
      </button>
    </div>

    <div v-if="sseStatus === 'OPEN' && activeGroupIndices.length > 0" class="gap-4 grid grid-cols-2 lg:grid-cols-5 md:grid-cols-4 sm:grid-cols-3">
      <IndexCard
        v-for="index in activeGroupIndices"
        :key="index!.code"
        :data="index!"
      />
    </div>
    <div v-else class="text-gray-500 card flex h-32 items-center justify-center">
      <div v-if="sseStatus === 'CONNECTING'" class="flex gap-2 items-center">
        <div i-carbon-circle-dash class="text-2xl text-primary animate-spin" />
        <span>行情连接中...</span>
      </div>
      <div v-else>
        暂无行情数据
      </div>
    </div>
  </div>
</template>
