<!-- app/pages/daily-ops.vue -->
<!-- eslint-disable no-alert -->
<script setup lang="ts">
import type { AiModel } from '~~/shared/ai-models'
import { useClipboard } from '@vueuse/core'
import { AI_MODELS } from '~~/shared/ai-models'
import CalendarWidget from '~/components/CalendarWidget.vue'
import { appName } from '~/constants'
import { formatCurrency } from '~/utils/format'

useHead({
  title: `每日操作 - ${appName}`,
})

const dayjs = useDayjs()
const authStore = useAuthStore() // 获取当前用户信息用于权限控制
// --- 状态管理 ---
const selectedDate = ref(dayjs().format('YYYY-MM-DD')) // 当前选中的日期

// 移除 expandedGroups 状态

// --- 获取数据 ---
// 后端现在返回结构化的 { user, txs } 数组
const { data: groupedTransactions, pending, refresh } = await useAsyncData(
  `daily-ops-${selectedDate.value}`,
  () => apiFetch<any[]>('/api/transactions/daily', { params: { date: selectedDate.value } }),
  {
    watch: [selectedDate],
  },
)

// --- 批量操作逻辑 ---
const isClearing = ref(false)
// 状态
const isLogLoading = ref(false)
const isImportModalOpen = ref(false)
const importTargetUser = ref<{ id: number, username: string } | null>(null)
const importJsonContent = ref('')
const isImporting = ref(false)
const isAiFixModalOpen = ref(false)
const aiFixTargetUser = ref<{ id: number, username: string } | null>(null)
const aiFixModel = ref<AiModel>('doubao-seed-2.0-pro')
const isAiFixSubmitting = ref(false)

// 动态获取 Prompt，不再依赖日志表
async function handleCopyPrompt(userId: number, username: string) {
  isLogLoading.value = true
  try {
    const res = await apiFetch<{ prompt: string }>('/api/ai/prompt-preview', {
      params: { userId },
    })

    // 复制到剪贴板
    const { copy } = useClipboard({ legacy: true })
    await copy(res.prompt)
    alert(`用户 ${username} 的 Prompt (实时生成) 已复制到剪贴板！`)
  }
  catch (e: any) {
    alert(`获取 Prompt 失败: ${e.data?.statusMessage || '未知错误'}`)
  }
  finally {
    isLogLoading.value = false
  }
}

// 打开导入模态框
function openImportModal(user: { id: number, username: string }) {
  importTargetUser.value = { ...user, id: Number(user.id) } // 确保 id 是数字
  importJsonContent.value = '' // 清空
  isImportModalOpen.value = true
}

function openAiFixModal(user: { id: number, username: string }) {
  aiFixTargetUser.value = { ...user, id: Number(user.id) }
  aiFixModel.value = 'doubao-seed-2.0-pro'
  isAiFixModalOpen.value = true
}

function setGroupLoading(userId: number, loading: boolean) {
  if (!groupedTransactions.value)
    return
  const target = groupedTransactions.value.find(g => g.user.id === userId)
  if (target)
    target.loading = loading
}

// 提交 JSON 替换
async function handleImportJsonSubmit() {
  if (!importTargetUser.value || !importJsonContent.value)
    return

  // 简单的 JSON 校验
  let decisions = []
  try {
    const parsed = JSON.parse(importJsonContent.value)
    // 兼容 { decisions: [...] } 格式或直接 [...] 格式
    decisions = Array.isArray(parsed) ? parsed : (parsed.decisions || [])
    if (!Array.isArray(decisions))
      throw new Error('Format error')
  }
  catch (e) {
    console.error(e)
    alert('JSON 格式错误，请检查。需为包含 decisions 数组的对象或直接为数组。')
    return
  }

  isImporting.value = true
  try {
    await apiFetch('/api/admin/transactions/batch-replace', {
      method: 'POST',
      body: {
        userId: importTargetUser.value.id,
        date: selectedDate.value,
        decisions,
      },
    })
    alert('批量修正成功！')
    isImportModalOpen.value = false
    refresh() // 刷新列表
  }
  catch (e: any) {
    alert(`提交失败: ${e.data?.statusMessage || e.message}`)
  }
  finally {
    isImporting.value = false
  }
}

async function handleAiFixSubmit() {
  if (!aiFixTargetUser.value)
    return

  isAiFixSubmitting.value = true
  try {
    await apiFetch('/api/admin/transactions/ai-fix', {
      method: 'POST',
      body: {
        userId: aiFixTargetUser.value.id,
        date: selectedDate.value,
        model: aiFixModel.value,
      },
    })
    setGroupLoading(aiFixTargetUser.value.id, true)
    isAiFixModalOpen.value = false
    refresh()
  }
  catch (e: any) {
    alert(`AI 修正提交失败: ${e.data?.statusMessage || e.message}`)
  }
  finally {
    isAiFixSubmitting.value = false
  }
}

// 计算当前列表中是否有待处理的交易
const hasPendingTransactions = computed(() => {
  return groupedTransactions.value?.some(group => group.counts.pending > 0) ?? false
})

async function handleClearPending() {
  if (!confirm(`确定要清空 ${selectedDate.value} 所有 [待处理] 的交易记录吗？\n此操作不可恢复。`))
    return

  isClearing.value = true
  try {
    const res = await apiFetch<{ count: number }>('/api/transactions/daily', {
      method: 'DELETE',
      params: { date: selectedDate.value },
    })
    alert(`清理完成，共移除 ${res.count} 条待处理记录。`)
    refresh() // 刷新列表
  }
  catch (e: any) {
    alert(`操作失败: ${e.message}`)
  }
  finally {
    isClearing.value = false
  }
}
</script>

<template>
  <div class="mx-auto p-4 max-w-7xl lg:p-8 sm:p-6">
    <header class="mb-8">
      <h1 class="text-2xl font-bold sm:text-3xl">
        每日操作
      </h1>
      <p class="text-gray-500 mt-1 dark:text-gray-400">
        查看全站用户的每日基金交易动态
      </p>
    </header>

    <div class="flex flex-col gap-8 items-start md:flex-row">
      <!-- 左侧：日历使用组件 -->
      <CalendarWidget v-model="selectedDate" />

      <!-- 右侧：操作列表 -->
      <div class="flex-grow w-full space-y-4">
        <!-- 标题栏 -->
        <div class="flex items-center justify-between">
          <h2 class="text-xl font-bold flex gap-2 items-center">
            {{ selectedDate }} 操作记录
          </h2>
          <!-- 清空按钮 -->
          <button
            v-if="hasPendingTransactions"
            class="text-sm text-red-600 px-3 py-1.5 border border-red-200 rounded-md bg-red-50 flex gap-2 transition-colors items-center dark:text-red-400 dark:border-red-900/50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40"
            :disabled="isClearing"
            @click="handleClearPending"
          >
            <div i-carbon-clean :class="{ 'animate-pulse': isClearing }" />
            {{ isClearing ? '清空中...' : '清空待处理' }}
          </button>
        </div>

        <!-- 加载状态 -->
        <div v-if="pending" class="py-20 flex justify-center">
          <div i-carbon-circle-dash class="text-4xl text-primary animate-spin" />
        </div>

        <!-- 列表 -->
        <div v-else class="space-y-4">
          <div v-for="group in groupedTransactions" :key="group.user.username" class="border rounded-lg bg-white shadow-sm overflow-hidden dark:border-gray-700 dark:bg-gray-800">
            <!-- 组头部 -->
            <div class="p-4 flex flex-col gap-4 transition-colors hover:bg-gray-50 sm:flex-row sm:items-center sm:justify-between dark:hover:bg-gray-700/50">
              <!-- 左侧：用户信息与资产概览 -->
              <div class="flex flex-grow flex-col gap-2">
                <div class="flex gap-3 items-center">
                  <!-- 头像 -->
                  <div
                    class="text-sm font-bold border rounded-full flex h-10 w-10 shadow-sm items-center justify-center dark:border-gray-500"
                    :class="group.counts.total > 0 ? 'bg-white text-primary dark:bg-gray-600 dark:text-gray-200' : 'bg-gray-100 text-gray-400 dark:bg-gray-700'"
                  >
                    {{ group.user.username.charAt(0).toUpperCase() }}
                  </div>
                  <!-- 用户名与资产信息 -->
                  <div>
                    <div class="flex gap-2 items-center">
                      <span class="text-lg text-gray-900 font-bold dark:text-gray-100" :class="{ 'text-gray-400': group.counts.total === 0 }">
                        {{ group.user.username }}
                      </span>
                      <AiAgentBadge v-if="group.user.isAiAgent" />
                    </div>
                    <!--  资产统计条 -->
                    <div class="text-xs text-gray-500 mt-1 flex flex-col flex-wrap gap-y-1">
                      <span title="总资产">
                        <span class="text-gray-400">总额:</span>
                        <span class="text-gray-700 font-medium font-numeric ml-1 dark:text-gray-300">{{ formatCurrency(group.user.stats.totalAssets) }}</span>
                      </span>
                      <span title="持仓市值">
                        <span class="text-gray-400">持仓:</span>
                        <span class="text-gray-700 font-medium font-numeric ml-1 dark:text-gray-300">{{ formatCurrency(group.user.stats.fundValue) }}</span>
                      </span>
                      <span title="可用现金">
                        <span class="text-gray-400">现金:</span>
                        <span class="text-gray-700 font-medium font-numeric ml-1 dark:text-gray-300">{{ formatCurrency(group.user.stats.cash) }}</span>
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <!-- 右侧：交易统计与操作 -->
              <div class="flex flex-col gap-3 sm:items-end">
                <!-- 交易统计 badges -->
                <div v-if="group.counts.total > 0" class="text-xs flex flex-wrap gap-2">
                  <span v-if="group.counts.buy > 0" class="text-red-600 px-2 py-0.5 border border-red-100 rounded-full bg-red-50 dark:text-red-400 dark:border-red-800 dark:bg-red-900/20">
                    买入: {{ group.counts.buy }}
                  </span>
                  <span v-if="group.counts.sell > 0" class="text-green-600 px-2 py-0.5 border border-green-100 rounded-full bg-green-50 dark:text-green-400 dark:border-green-800 dark:bg-green-900/20">
                    卖出: {{ group.counts.sell }}
                  </span>
                  <span v-if="group.counts.convert_in > 0" class="text-purple-600 px-2 py-0.5 border border-purple-100 rounded-full bg-purple-50 dark:text-purple-400 dark:border-purple-800 dark:bg-purple-900/20">
                    转入: {{ group.counts.convert_in }}
                  </span>
                  <span v-if="group.counts.convert_out > 0" class="text-blue-600 px-2 py-0.5 border border-blue-100 rounded-full bg-blue-50 dark:text-blue-400 dark:border-blue-800 dark:bg-blue-900/20">
                    转出: {{ group.counts.convert_out }}
                  </span>
                  <span v-if="group.counts.pending > 0" class="text-yellow-600 px-2 py-0.5 border border-yellow-100 rounded-full bg-yellow-50 dark:text-yellow-400 dark:border-yellow-800 dark:bg-yellow-900/20">
                    待处理: {{ group.counts.pending }}
                  </span>
                </div>
                <div v-else class="text-sm text-gray-400">
                  今日无操作
                </div>

                <!-- 按钮组 -->
                <div class="flex gap-2">
                  <button
                    class="text-xs px-2 py-1.5 border rounded bg-white flex gap-1 items-center dark:border-gray-500 dark:bg-gray-600 hover:bg-gray-50 dark:hover:bg-gray-500"
                    title="生成并复制当前上下文的 Prompt"
                    @click="handleCopyPrompt(group.user.id, group.user.username)"
                  >
                    <div class="i-carbon-copy" /> <span class="hidden sm:inline">提示词</span>
                  </button>

                  <button
                    v-if="authStore.isAdmin || authStore.user?.id === group.user.id"
                    class="text-xs text-emerald-600 px-2 py-1.5 border rounded bg-white flex gap-1 items-center dark:text-emerald-300 dark:border-gray-500 dark:bg-gray-600 hover:bg-gray-50 dark:hover:bg-gray-500"
                    :disabled="group.loading"
                    title="由系统调用 AI 自动生成修正交易"
                    @click="openAiFixModal({ id: group.user.id, username: group.user.username })"
                  >
                    <div class="i-carbon-bot" :class="{ 'animate-pulse': group.loading }" />
                    <span class="hidden sm:inline">{{ group.loading ? 'AI修正中' : 'AI修正' }}</span>
                  </button>

                  <button
                    v-if="authStore.isAdmin || authStore.user?.id === group.user.id"
                    class="text-xs text-blue-600 px-2 py-1.5 border rounded bg-white flex gap-1 items-center dark:text-blue-300 dark:border-gray-500 dark:bg-gray-600 hover:bg-gray-50 dark:hover:bg-gray-500"
                    title="人工修正 (Import JSON)"
                    @click="openImportModal({ id: group.user.id, username: group.user.username })"
                  >
                    <div class="i-carbon-edit" />
                  </button>

                  <NuxtLink
                    v-if="group.counts.total > 0 || authStore.isAdmin || authStore.user?.id === group.user.id"
                    :to="`/daily-ops/${selectedDate}/${group.user.id}`"
                    class="text-xs text-primary px-3 py-1.5 border border-primary/20 rounded bg-primary/5 flex gap-1 transition-colors items-center hover:bg-primary/10"
                  >
                    详情 <div class="i-carbon-chevron-right" />
                  </NuxtLink>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <!-- JSON 导入/修正模态框 -->
      <Modal v-model="isImportModalOpen" :title="`人工修正 - ${importTargetUser?.username} (${selectedDate})`">
        <div class="space-y-4">
          <p class="text-sm text-gray-500">
            请输入修正后的 JSON 数据。提交后，该用户当日所有 [待处理] 交易将被此处的内容替换。
          </p>
          <textarea
            v-model="importJsonContent"
            rows="10"
            class="text-xs font-mono input-base w-full"
            placeholder="{ &quot;decisions&quot;: [ { &quot;fundCode&quot;: &quot;...&quot;, &quot;action&quot;: &quot;buy&quot;, &quot;amount&quot;: 1000, &quot;reason&quot;: &quot;...&quot; } ] }"
          />
          <div class="flex gap-3 justify-end">
            <button class="px-4 py-2 rounded bg-gray-100 dark:bg-gray-700" @click="isImportModalOpen = false">
              取消
            </button>
            <button class="btn" :disabled="!importJsonContent || isImporting" @click="handleImportJsonSubmit">
              {{ isImporting ? '处理中...' : '确认替换' }}
            </button>
          </div>
        </div>
      </Modal>

      <!-- AI 自动修正模态框 -->
      <Modal v-model="isAiFixModalOpen" :title="`AI 自动修正 - ${aiFixTargetUser?.username} (${selectedDate})`">
        <div class="space-y-4">
          <p class="text-sm text-gray-500">
            系统将根据当前上下文生成交易决策并自动替换该用户当日所有 [待处理] 记录。
            提交后立即返回，处理期间会显示 “AI修正中”。
          </p>
          <div>
            <label class="text-sm font-medium mb-1 block">选择模型</label>
            <div class="relative">
              <select
                v-model="aiFixModel"
                class="input-base appearance-none"
                required
              >
                <option
                  v-for="model in AI_MODELS"
                  :key="model"
                  :value="model"
                >
                  {{ model }}
                </option>
              </select>
              <div class="text-gray-500 px-3 flex pointer-events-none items-center inset-y-0 right-0 absolute">
                <div i-carbon-chevron-down />
              </div>
            </div>
          </div>
          <div class="flex gap-3 justify-end">
            <button class="px-4 py-2 rounded bg-gray-100 dark:bg-gray-700" @click="isAiFixModalOpen = false">
              取消
            </button>
            <button class="btn" :disabled="isAiFixSubmitting" @click="handleAiFixSubmit">
              {{ isAiFixSubmitting ? '提交中...' : '开始修正' }}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  </div>
</template>
