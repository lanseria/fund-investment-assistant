<!-- eslint-disable no-alert -->
<script setup lang="ts">
import { appName } from '~/constants'

const route = useRoute<'daily-ops-date-userId'>()

const dateStr = route.params.date as string
const userId = Number(route.params.userId)

useHead({
  title: `操作详情 - ${dateStr} - ${appName}`,
})

const { data, pending, error, refresh } = await useAsyncData(
  `daily-ops-detail-${dateStr}-${userId}`,
  () => apiFetch<{ user: any, txs: any[] }>(`/api/transactions/daily/${dateStr}/${userId}`),
)

const toast = useToast()
const authStore = useAuthStore()
const isApproving = ref(false)
const hasDraft = computed(() => data.value?.txs.some(t => t.status === 'draft') ?? false)

async function handleApproveAllDraft() {
  if (!confirm('确认将当前所有的 [预操作] 转为 [待处理] 状态吗？'))
    return
  isApproving.value = true
  try {
    await apiFetch('/api/transactions/daily-approve', {
      method: 'PUT',
      body: { userId, date: dateStr },
    })
    toast.success('已将预操作转为待处理')
    refresh()
  }
  catch (e: any) {
    toast.error(`操作失败: ${e.message}`)
  }
  finally {
    isApproving.value = false
  }
}

const isStrategyModalOpen = ref(false)
</script>

<template>
  <div class="mx-auto p-4 max-w-5xl lg:p-8 sm:p-6">
    <header class="mb-8">
      <div class="text-sm text-gray-500 mb-4 inline-flex gap-2 cursor-pointer transition-colors items-center hover:text-primary-hover" @click="$router.back()">
        <div class="i-carbon-arrow-left" />
        返回每日操作
      </div>
      <h1 class="text-2xl font-bold flex gap-3 items-center sm:text-3xl">
        操作详情
        <span class="text-base text-gray-500 font-mono font-normal">({{ dateStr }})</span>
      </h1>
    </header>

    <div v-if="pending" class="py-20 flex justify-center">
      <div class="i-carbon-circle-dash text-4xl text-primary animate-spin" />
    </div>
    <div v-else-if="error" class="text-red-500 py-20 text-center card">
      <div class="i-carbon-warning-alt text-5xl mx-auto mb-4" />
      <p>加载失败: {{ error.message }}</p>
    </div>
    <div v-else-if="data" class="space-y-6">
      <div class="p-6 card bg-white flex gap-4 items-center dark:bg-gray-800">
        <div class="text-xl text-primary font-bold rounded-full bg-primary/10 flex h-14 w-14 shadow-sm items-center justify-center dark:text-gray-200 dark:bg-gray-700">
          {{ data.user.username.charAt(0).toUpperCase() }}
        </div>
        <div>
          <div class="flex gap-2 items-center">
            <h2 class="text-xl font-bold">
              {{ data.user.username }}
            </h2>
            <AiAgentBadge v-if="data.user.aiMode !== 'off'" :mode="data.user.aiMode" />
            <span
              v-if="data.user.aiOperating"
              class="text-xs text-blue-500 flex gap-0.5 items-center"
              title="AI 操作中"
            >
              <div class="i-carbon-circle-dash animate-spin" />
              <span>操作中</span>
            </span>
            <button
              v-if="data.user.aiSystemPrompt"
              class="icon-btn text-gray-400 transition-colors dark:text-gray-500 hover:text-primary dark:hover:text-primary"
              title="查看操作策略"
              @click="isStrategyModalOpen = true"
            >
              <div class="i-carbon-catalog text-xl" />
            </button>
          </div>
          <p class="text-sm text-gray-500 font-mono mt-1">
            ID: {{ data.user.id }}
          </p>
        </div>
      </div>

      <div class="card overflow-hidden">
        <div class="px-6 py-4 border-b bg-gray-50 flex items-center justify-between dark:border-gray-700 dark:bg-gray-700/50">
          <h3 class="text-gray-800 font-bold dark:text-gray-200">
            交易记录 ({{ data.txs.length }}笔)
          </h3>
          <button
            v-if="hasDraft && (authStore.isAdmin || authStore.user?.id === userId)"
            class="text-xs text-purple-600 px-3 py-1.5 border border-purple-200 rounded-md bg-white flex gap-1 transition-colors items-center dark:text-purple-400 dark:border-purple-800 dark:bg-gray-800 hover:bg-purple-50 dark:hover:bg-gray-700"
            :disabled="isApproving"
            @click="handleApproveAllDraft"
          >
            <div class="i-carbon-checkmark-outline" :class="{ 'animate-spin i-carbon-circle-dash': isApproving }" />
            {{ isApproving ? '处理中...' : '全部转为待处理' }}
          </button>
        </div>

        <EmptyState
          v-if="data.txs.length === 0"
          icon="i-carbon-document-blank"
          message="该用户当日无任何交易操作"
        />

        <div v-else class="divide-y dark:divide-gray-700">
          <TransactionRow
            v-for="tx in data.txs"
            :key="tx.id"
            :tx="tx"
          />
        </div>
      </div>
    </div>

    <!-- 操作策略展示模态框 -->
    <Modal v-model="isStrategyModalOpen" :title="`${data?.user.username} 的操作策略`">
      <div class="pr-2 max-h-[60vh] overflow-y-auto">
        <pre class="text-sm text-gray-700 font-mono p-4 rounded-md bg-gray-50 whitespace-pre-wrap dark:text-gray-300 dark:bg-gray-800">{{ data?.user.aiSystemPrompt }}</pre>
      </div>
      <div class="mt-6 flex justify-end">
        <button class="btn" @click="isStrategyModalOpen = false">
          关闭
        </button>
      </div>
    </Modal>
  </div>
</template>
