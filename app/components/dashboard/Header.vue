<script setup lang="ts">
import { vOnClickOutside } from '@vueuse/components'

defineProps<{
  isRefreshing: boolean
  isDataLoading: boolean
  isProcessingTransactions: boolean
  isHeldOnly: boolean
  isGroupedBySector: boolean
}>()

const emit = defineEmits([
  'refresh-client', // 客户端更新 (User Scope)
  'refresh-server-user', // 后端更新 (User Scope)
  'refresh-data',
  'process-transactions',
  'toggle-held',
  'toggle-group',
  'import',
  'export',
  'copy-info',
  'add-fund',
])

const isSyncMenuOpen = ref(false)

function handleServerUpdate() {
  emit('refresh-server-user')
  isSyncMenuOpen.value = false
}
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
      <!-- 同步估值下拉按钮组 -->
      <div v-on-click-outside="() => isSyncMenuOpen = false" class="flex items-center relative">
        <button
          class="px-2 border-r border-gray-300 rounded-l-md bg-gray-100 flex h-8 transition-colors items-center dark:border-gray-600 dark:bg-gray-700 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed dark:hover:bg-gray-600"
          :disabled="isRefreshing"
          title="客户端极速同步 (仅我的基金)"
          @click="emit('refresh-client')"
        >
          <div i-carbon-update-now :class="{ 'animate-spin': isRefreshing }" class="mr-1.5" />
          <span class="text-sm font-medium">同步</span>
        </button>
        <button
          class="px-1 rounded-r-md bg-gray-100 flex h-8 transition-colors items-center dark:bg-gray-700 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed dark:hover:bg-gray-600"
          :disabled="isRefreshing"
          @click="isSyncMenuOpen = !isSyncMenuOpen"
        >
          <div i-carbon-chevron-down class="text-xs transition-transform duration-200" :class="{ 'rotate-180': isSyncMenuOpen }" />
        </button>

        <!-- 下拉菜单 -->
        <Transition name="fade">
          <div
            v-if="isSyncMenuOpen"
            class="mt-1 py-1 border rounded-md bg-white w-36 shadow-lg right-0 top-full absolute z-50 dark:border-gray-600 dark:bg-gray-800"
          >
            <button
              class="text-sm px-4 py-2 text-left w-full hover:bg-gray-100 dark:hover:bg-gray-700"
              @click="handleServerUpdate"
            >
              后端强制更新
            </button>
          </div>
        </Transition>
      </div>

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
      <!-- 收益明细入口 -->
      <NuxtLink to="/profit-analysis" class="icon-btn" title="收益明细">
        <div i-carbon-chart-line-data />
      </NuxtLink>
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
