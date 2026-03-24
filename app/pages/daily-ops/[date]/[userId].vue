<!-- eslint-disable no-alert -->
<script setup lang="ts">
import { useDayjs } from '#imports'
import AiAgentBadge from '~/components/AiAgentBadge.vue'
import { appName } from '~/constants'
import { formatCurrency } from '~/utils/format'

const route = useRoute<'daily-ops-date-userId'>()
const dayjs = useDayjs()
const { getLabel } = useDictStore()

const dateStr = route.params.date as string
const userId = Number(route.params.userId)

useHead({
  title: `操作详情 - ${dateStr} - ${appName}`,
})

const { data, pending, error, refresh } = await useAsyncData(
  `daily-ops-detail-${dateStr}-${userId}`,
  () => apiFetch<{ user: any, txs: any[] }>(`/api/transactions/daily/${dateStr}/${userId}`),
)

// --- 辅助显示函数 ---
function getActionStyle(type: string) {
  switch (type) {
    case 'buy': return 'text-red-600 bg-red-50 border-red-100 dark:text-red-400 dark:bg-red-900/20 dark:border-red-800'
    case 'sell': return 'text-green-600 bg-green-50 border-green-100 dark:text-green-400 dark:bg-green-900/20 dark:border-green-800'
    case 'convert_in': return 'text-purple-600 bg-purple-50 border-purple-100 dark:text-purple-400 dark:bg-purple-900/20 dark:border-purple-800'
    case 'convert_out': return 'text-blue-600 bg-blue-50 border-blue-100 dark:text-blue-400 dark:bg-blue-900/20 dark:border-blue-800'
    default: return 'text-gray-600 bg-gray-50 border-gray-100'
  }
}

function getActionLabel(type: string) {
  const map: Record<string, string> = {
    buy: '买入',
    sell: '卖出',
    convert_in: '转入',
    convert_out: '转出',
  }
  return map[type] || type
}

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
    refresh()
  }
  catch (e: any) {
    alert(`操作失败: ${e.message}`)
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

        <div v-if="data.txs.length === 0" class="text-sm text-gray-400 p-10 text-center">
          该用户当日无任何交易操作
        </div>

        <div v-else class="divide-y dark:divide-gray-700">
          <div
            v-for="tx in data.txs"
            :key="tx.id"
            class="group text-sm px-6 py-4 flex flex-col gap-3 transition-colors hover:bg-blue-50/30 sm:flex-row sm:gap-6 sm:items-center dark:hover:bg-gray-700/30"
            :class="{ 'opacity-60 grayscale': tx.status === 'failed' }"
          >
            <!-- 1. 时间 & 状态图标 -->
            <div class="text-xs text-gray-400 font-mono flex flex-shrink-0 gap-2 w-24 items-center">
              <span>{{ dayjs(tx.createdAt).format('HH:mm:ss') }}</span>
              <div v-if="tx.status === 'draft'" class="i-carbon-edit text-purple-500" title="预操作(草稿)" />
              <div v-else-if="tx.status === 'pending'" class="i-carbon-hourglass text-yellow-500" title="待确认" />
              <div v-else-if="tx.status === 'failed'" class="i-carbon-close-filled text-red-500" title="失败" />
              <div v-else class="i-carbon-checkmark-filled text-green-500" title="已确认" />
            </div>

            <!-- 2. 类型标签 -->
            <div class="flex-shrink-0 w-16">
              <span class="text-xs font-medium px-2 py-0.5 border rounded whitespace-nowrap" :class="getActionStyle(tx.type)">
                {{ getActionLabel(tx.type) }}
              </span>
            </div>

            <!-- 3.  基金名称、代码 -->
            <div class="flex flex-grow flex-col gap-1 min-w-0 sm:flex-row sm:gap-2 sm:items-center">
              <div class="flex gap-2 truncate items-baseline">
                <span class="text-gray-900 font-medium truncate dark:text-gray-100" :title="tx.fundName">
                  {{ tx.fundName || '未知基金' }}
                </span>
                <span class="text-xs text-gray-500 font-mono flex-shrink-0">
                  {{ tx.fundCode }}
                </span>
              </div>
            </div>

            <!-- 4. 申报详情 -->
            <div class="flex flex-shrink-0 gap-1 items-center sm:text-right sm:w-32 sm:justify-end">
              <span class="text-xs text-gray-400 sm:hidden">申报:</span>
              <span class="text-gray-700 font-medium font-mono dark:text-gray-300">
                <span v-if="tx.orderAmount">{{ formatCurrency(tx.orderAmount) }}</span>
                <span v-else>{{ Number(tx.orderShares).toFixed(4) }} 份</span>
              </span>
            </div>

            <!-- 5. 确认详情 / 备注 -->
            <div class="flex flex-shrink-0 gap-1 min-h-[20px] items-center sm:text-right sm:w-48 sm:justify-end">
              <template v-if="tx.status === 'confirmed'">
                <span class="text-xs text-gray-400 sm:hidden">成交:</span>
                <span class="text-gray-900 font-mono font-semibold dark:text-gray-100">
                  <span v-if="tx.confirmedAmount">{{ formatCurrency(tx.confirmedAmount) }}</span>
                  <span v-else>-</span>
                </span>
              </template>
              <template v-else-if="tx.note">
                <span class="text-xs text-gray-400 text-right w-full truncate italic" :title="tx.note">
                  {{ tx.note }}
                </span>
              </template>
              <span v-else class="text-gray-300">-</span>
            </div>
          </div>
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
