<script setup lang="ts">
const props = defineProps<{
  userId: number
}>()

const dayjs = useDayjs()
const todayStr = dayjs().format('YYYY-MM-DD')

const { data, pending, error, refresh } = useAsyncData(
  `today-txs-${props.userId}-${todayStr}`,
  () => apiFetch<{ user: any, txs: any[] }>(`/api/transactions/daily/${todayStr}/${props.userId}`),
)

// 暴露 refresh 给父组件以便在交易后主动更新
defineExpose({ refresh })
</script>

<template>
  <div class="card overflow-hidden">
    <div class="px-6 py-4 border-b bg-gray-50 flex items-center justify-between dark:border-gray-700 dark:bg-gray-700/50">
      <h3 class="text-gray-800 font-bold dark:text-gray-200">
        今日操作 <span v-if="data" class="text-sm text-gray-500 font-normal">({{ data.txs.length }}笔)</span>
      </h3>
    </div>

    <div v-if="pending" class="py-8 flex justify-center">
      <div class="i-carbon-circle-dash text-3xl text-primary animate-spin" />
    </div>

    <div v-else-if="error" class="text-red-500 py-8 text-center">
      加载失败: {{ error.message }}
    </div>

    <EmptyState
      v-else-if="data && data.txs.length === 0"
      icon="i-carbon-document-blank"
      message="今日暂无任何操作记录"
    />

    <div v-else-if="data" class="max-h-[350px] overflow-y-auto divide-y dark:divide-gray-700">
      <TransactionRow
        v-for="tx in data.txs"
        :key="tx.id"
        :tx="tx"
      />
    </div>
  </div>
</template>
