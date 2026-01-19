<script setup lang="ts">
defineProps<{
  isRefreshing: boolean
  isDataLoading: boolean
  isProcessingTransactions: boolean
  isHeldOnly: boolean
  isGroupedBySector: boolean
}>()

const emit = defineEmits([
  'refresh-estimates',
  'refresh-data',
  'process-transactions',
  'toggle-held',
  'toggle-group',
  'import',
  'export',
  'copy-info',
  'add-fund',
])
</script>

<template>
  <header class="mb-8 flex flex-col gap-4 items-start justify-between sm:flex-row sm:items-center">
    <div>
      <h1 class="text-2xl font-bold sm:text-3xl">
        我的持仓
      </h1>
      <p class="text-gray-500 mt-1 dark:text-gray-400">
        概览您的基金投资组合
      </p>
    </div>
    <div class="flex gap-2 items-center sm:gap-4">
      <button class="icon-btn" title="同步实时估值" :disabled="isRefreshing" @click="emit('refresh-estimates')">
        <div i-carbon-update-now :class="{ 'animate-spin': isRefreshing }" />
      </button>
      <button class="icon-btn" title="刷新列表数据" :disabled="isDataLoading" @click="emit('refresh-data')">
        <div i-carbon-renew :class="{ 'animate-spin': isDataLoading }" />
      </button>
      <button class="icon-btn" title="手动处理待确认交易" :disabled="isProcessingTransactions" @click="emit('process-transactions')">
        <div i-carbon-calculator-check :class="{ 'animate-pulse': isProcessingTransactions }" />
      </button>
      <button
        class="icon-btn"
        :class="{ 'text-primary': isHeldOnly }"
        :title="isHeldOnly ? '显示全部' : '仅显示持仓'"
        @click="emit('toggle-held')"
      >
        <div i-carbon-wallet />
      </button>
      <button
        class="icon-btn"
        :class="{ 'text-primary': isGroupedBySector }"
        title="按板块分组"
        @click="emit('toggle-group')"
      >
        <div i-carbon-table-split />
      </button>
      <button class="icon-btn" title="导入数据" @click="emit('import')">
        <div i-carbon-upload />
      </button>
      <button class="icon-btn" title="导出数据" @click="emit('export')">
        <div i-carbon-download />
      </button>
      <button class="icon-btn" title="复制持仓信息" @click="emit('copy-info')">
        <div i-carbon-copy />
      </button>
      <button class="btn flex items-center" @click="emit('add-fund')">
        <div i-carbon-add mr-1 />
        添加基金
      </button>
    </div>
  </header>
</template>
