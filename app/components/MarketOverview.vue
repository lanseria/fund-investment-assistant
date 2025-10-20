<script setup lang="ts">
const marketStore = useMarketStore()
const { activeGroup, activeGroupIndices, sseStatus } = storeToRefs(marketStore)
</script>

<template>
  <div class="mb-8">
    <!-- 分组切换 -->
    <div class="mb-4 border-b flex gap-2 dark:border-gray-700">
      <button
        v-for="(group, key) in marketGroups"
        :key="key"
        class="text-sm font-semibold px-4 py-2 border-b-2 transition-colors"
        :class="[
          activeGroup === key
            ? 'border-primary text-primary'
            : 'border-transparent text-gray-500 hover:text-gray-800 dark:hover:text-gray-200',
        ]"
        @click="marketStore.setActiveGroup(key)"
      >
        {{ group.label }}
      </button>
    </div>

    <!-- 指数卡片网格 -->
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
