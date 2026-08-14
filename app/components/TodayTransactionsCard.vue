<script setup lang="ts">
import { format } from 'date-fns'

const props = defineProps<{
  userId: number
}>()

const todayStr = format(new Date(), 'yyyy-MM-dd')

const { data, pending, error, refresh } = useAsyncData(
  `today-txs-${props.userId}-${todayStr}`,
  () => apiFetch<{ user: any, txs: any[] }>(`/api/transactions/daily/${todayStr}/${props.userId}`),
)

const authStore = useAuthStore()
const toast = useToast()

// 仅本人或 admin 可以在本卡片内直接操作（排行榜页会查看他人的卡片）
const canManage = computed(() => authStore.isAdmin || authStore.user?.id === props.userId)
const hasDraft = computed(() => data.value?.txs.some(t => t.status === 'draft') ?? false)

// 正在确认的单笔交易 id（行内按钮 loading / 防重复提交）
const actingId = ref<number | null>(null)

/** 确认单笔 AI 预操作（draft → pending） */
async function confirmDraft(tx: any) {
  if (actingId.value !== null)
    return
  actingId.value = tx.id
  try {
    await apiFetch(`/api/fund/transactions/${tx.id}/approve`, { method: 'PUT' })
    toast.success('已确认，转为待处理状态')
    await refresh()
  }
  catch (e: any) {
    toast.error(`确认失败: ${e?.data?.statusMessage || e.message}`)
  }
  finally {
    actingId.value = null
  }
}

/** 一键确认当日全部预操作（复用批量端点，与每日操作页一致） */
const isApprovingAll = ref(false)

async function approveAllDraft() {
  if (isApprovingAll.value)
    return
  isApprovingAll.value = true
  try {
    await apiFetch('/api/transactions/daily-approve', {
      method: 'PUT',
      body: { userId: props.userId, date: todayStr },
    })
    toast.success('已将全部预操作转为待处理')
    await refresh()
  }
  catch (e: any) {
    toast.error(`操作失败: ${e?.data?.statusMessage || e.message}`)
  }
  finally {
    isApprovingAll.value = false
  }
}

/** 撤销交易：先弹危险确认框，转出会级联删除关联的转入记录 */
const deleteTarget = ref<any>(null)
const isDeleting = ref(false)

const deleteImpacts = computed(() => {
  const impacts = ['撤销后该笔申报将被删除，且不可恢复']
  if (deleteTarget.value?.type === 'convert_out')
    impacts.push('关联的 [转入] 记录将一并被删除')
  return impacts
})

async function doDelete() {
  if (!deleteTarget.value || isDeleting.value)
    return
  isDeleting.value = true
  try {
    await apiFetch(`/api/fund/transactions/${deleteTarget.value.id}`, { method: 'DELETE' })
    toast.success('已撤销该交易')
    deleteTarget.value = null
    await refresh()
  }
  catch (e: any) {
    toast.error(`撤销失败: ${e?.data?.statusMessage || e.message}`)
  }
  finally {
    isDeleting.value = false
  }
}

// 暴露 refresh 给父组件以便在交易后主动更新
defineExpose({ refresh })
</script>

<template>
  <div class="card overflow-hidden">
    <div class="px-6 py-4 border-b bg-gray-50 flex items-center justify-between dark:border-gray-700 dark:bg-gray-700/50">
      <h3 class="text-gray-800 font-bold dark:text-gray-200">
        今日操作 <span v-if="data" class="text-sm text-gray-500 font-normal">({{ data.txs.length }}笔)</span>
      </h3>
      <!-- 一键确认当日全部 AI 预操作 -->
      <button
        v-if="hasDraft && canManage"
        class="text-xs text-purple-600 px-3 py-1.5 border border-purple-200 rounded-md bg-white flex gap-1 transition-colors items-center dark:text-purple-400 dark:border-purple-800 dark:bg-gray-800 hover:bg-purple-50 dark:hover:bg-gray-700"
        :disabled="isApprovingAll"
        title="将今日全部 AI 预操作转为待处理"
        @click="approveAllDraft"
      >
        <div :class="isApprovingAll ? 'i-carbon-circle-dash animate-spin' : 'i-carbon-checkmark-outline'" />
        {{ isApprovingAll ? '处理中...' : '全部转为待处理' }}
      </button>
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
        :show-actions="canManage"
        :busy="actingId === tx.id"
        @confirm="confirmDraft"
        @delete="deleteTarget = $event"
      />
    </div>

    <!-- 撤销确认弹窗 -->
    <DangerConfirm
      :open="!!deleteTarget"
      title="撤销交易"
      :message="`确定撤销「${deleteTarget?.fundName || deleteTarget?.fundCode || ''}」这笔操作吗？`"
      :impacts="deleteImpacts"
      confirm-label="确认撤销"
      :loading="isDeleting"
      @update:open="!$event && (deleteTarget = null)"
      @confirm="doDelete"
    />
  </div>
</template>
