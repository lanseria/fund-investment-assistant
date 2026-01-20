<!-- app/pages/daily-ops.vue -->
<!-- eslint-disable no-alert -->
<script setup lang="ts">
import { useClipboard } from '@vueuse/core'
import CalendarWidget from '~/components/CalendarWidget.vue' // [新增]
import { appName } from '~/constants'

useHead({
  title: `每日操作 - ${appName}`,
})

const dayjs = useDayjs()
const authStore = useAuthStore() // 获取当前用户信息用于权限控制

// --- 状态管理 ---
const selectedDate = ref(dayjs().format('YYYY-MM-DD')) // 当前选中的日期

// 展开/折叠的用户组集合
const expandedGroups = ref<Set<string>>(new Set())

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

// [修改] 动态获取 Prompt，不再依赖日志表
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
    alert(`获取 Prompt 失败: ${e.data?.message || '未知错误'}`)
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
    alert(`提交失败: ${e.data?.message || e.message}`)
  }
  finally {
    isImporting.value = false
  }
}

// 计算当前列表中是否有待处理的交易
const hasPendingTransactions = computed(() => {
  return groupedTransactions.value?.some(group =>
    group.txs.some((tx: any) => tx.status === 'pending'),
  ) ?? false
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

// 当数据更新时，默认展开所有有数据的组
watch(groupedTransactions, (groups) => {
  if (!groups)
    return
  const newSet = new Set<string>()
  groups.forEach((g) => {
    // 默认只展开有交易的用户，避免列表过长
    if (g.txs.length > 0) {
      newSet.add(g.user.username)
    }
  })
  expandedGroups.value = newSet
}, { immediate: true })

function toggleGroup(username: string) {
  if (expandedGroups.value.has(username))
    expandedGroups.value.delete(username)
  else
    expandedGroups.value.add(username)
}

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

function formatCurrency(val: any) {
  if (!val)
    return '-'
  return new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY' }).format(Number(val))
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
      <!-- 左侧：日历 [修改] 使用组件 -->
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
            <!-- 组头部：点击展开/折叠 -->
            <div
              class="px-4 py-3 bg-gray-50 flex cursor-pointer transition-colors items-center justify-between dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700"
              @click="toggleGroup(group.user.username)"
            >
              <div class="flex gap-3 items-center">
                <!-- 头像 -->
                <div
                  class="text-sm font-bold border rounded-full flex h-8 w-8 shadow-sm items-center justify-center dark:border-gray-500"
                  :class="group.txs.length > 0 ? 'bg-white text-primary dark:bg-gray-600 dark:text-gray-200' : 'bg-gray-200 text-gray-400 dark:bg-gray-700'"
                >
                  {{ group.user.username.charAt(0).toUpperCase() }}
                </div>
                <!-- 用户名 -->
                <div class="flex gap-2 items-center">
                  <span class="text-gray-800 font-bold dark:text-gray-200" :class="{ 'text-gray-400': group.txs.length === 0 }">
                    {{ group.user.username }}
                  </span>
                  <span v-if="group.user.isAiAgent" class="i-carbon-bot text-xs text-primary" title="AI 代理账户" />
                  <span v-if="group.txs.length > 0" class="text-xs text-gray-500 ml-1">({{ group.txs.length }} 笔)</span>
                  <span v-else class="text-xs text-gray-400 ml-1 italic">(无操作)</span>
                </div>

                <!-- 按钮组 -->
                <div class="ml-4 flex gap-2" @click.stop>
                  <!-- 复制 Prompt: 所有用户可见 -->
                  <button
                    class="text-xs px-2 py-1 border rounded bg-white flex dark:border-gray-500 dark:bg-gray-600 hover:bg-gray-50 dark:hover:bg-gray-500"
                    title="生成并复制当前上下文的 Prompt"
                    @click="handleCopyPrompt(group.user.id, group.user.username)"
                  >
                    <div class="i-carbon-copy" /> Prompt
                  </button>

                  <!-- 修正: 仅 Admin 或 自己 可见 -->
                  <button
                    v-if="authStore.isAdmin || authStore.user?.id === group.user.id"
                    class="text-xs text-blue-600 px-2 py-1 border rounded bg-white flex dark:text-blue-300 dark:border-gray-500 dark:bg-gray-600 hover:bg-gray-50 dark:hover:bg-gray-500"
                    title="人工修正 (Import JSON)"
                    @click="openImportModal({ id: group.user.id, username: group.user.username })"
                  >
                    <div class="i-carbon-edit" /> 修正
                  </button>
                </div>
              </div>

              <!-- 折叠图标 -->
              <div
                class="i-carbon-chevron-down text-gray-400 transition-transform duration-200"
                :class="{ 'rotate-180': expandedGroups.has(group.user.username) }"
              />
            </div>

            <!-- 交易列表：单行布局 -->
            <div v-show="expandedGroups.has(group.user.username)" class="border-t divide-y dark:border-gray-700 dark:divide-gray-700">
              <!-- 空状态 -->
              <div v-if="group.txs.length === 0" class="text-sm text-gray-400 p-4 text-center bg-gray-50/50 dark:bg-gray-800/50">
                该用户当日无任何交易操作
              </div>

              <div
                v-for="tx in group.txs"
                :key="tx.id"
                class="group text-sm px-4 py-3 flex flex-col gap-2 transition-colors hover:bg-blue-50/30 sm:flex-row sm:gap-4 sm:items-center dark:hover:bg-gray-700/30"
                :class="{ 'opacity-60 grayscale': tx.status === 'failed' }"
              >
                <!-- 1. 时间 & 状态图标 -->
                <div class="text-xs text-gray-400 font-mono flex flex-shrink-0 gap-2 items-center sm:w-24">
                  <span>{{ dayjs(tx.createdAt).format('HH:mm:ss') }}</span>
                  <!-- 状态Icon -->
                  <div
                    v-if="tx.status === 'pending'"
                    class="i-carbon-hourglass text-yellow-500"
                    title="待确认"
                  />
                  <div
                    v-else-if="tx.status === 'failed'"
                    class="i-carbon-close-filled text-red-500"
                    title="失败"
                  />
                  <div
                    v-else
                    class="i-carbon-checkmark-filled text-green-500"
                    title="已确认"
                  />
                </div>

                <!-- 2. 类型标签 -->
                <div class="flex-shrink-0 sm:w-16">
                  <span class="text-xs font-medium px-2 py-0.5 border rounded whitespace-nowrap" :class="getActionStyle(tx.type)">
                    {{ getActionLabel(tx.type) }}
                  </span>
                </div>

                <!-- 3. 基金名称与代码 -->
                <div class="flex flex-grow flex-col gap-1 min-w-0 sm:flex-row sm:gap-2 sm:items-baseline">
                  <span class="text-gray-900 font-medium truncate dark:text-gray-100" :title="tx.fundName">
                    {{ tx.fundName || '未知基金' }}
                  </span>
                  <span class="text-xs text-gray-500 font-mono flex-shrink-0">
                    {{ tx.fundCode }}
                  </span>
                </div>

                <!-- 4. 申报详情 -->
                <div class="flex flex-shrink-0 gap-1 items-center sm:text-right sm:w-32 sm:justify-end">
                  <span class="text-xs text-gray-400 sm:hidden">申报:</span>
                  <span class="text-gray-700 font-medium font-mono dark:text-gray-300">
                    <span v-if="tx.orderAmount">{{ formatCurrency(tx.orderAmount) }}</span>
                    <span v-else>{{ Number(tx.orderShares).toFixed(2) }} 份</span>
                  </span>
                </div>

                <!-- 5. 确认详情 / 备注 -->
                <div class="flex flex-shrink-0 gap-1 min-h-[20px] items-center sm:text-right sm:w-40 sm:justify-end">
                  <!-- 如果已确认，显示成交金额 -->
                  <template v-if="tx.status === 'confirmed'">
                    <span class="text-xs text-gray-400 sm:hidden">成交:</span>
                    <span class="text-gray-900 font-mono font-semibold dark:text-gray-100">
                      <span v-if="tx.confirmedAmount">{{ formatCurrency(tx.confirmedAmount) }}</span>
                      <span v-else>-</span>
                    </span>
                  </template>
                  <!-- 否则显示备注 -->
                  <template v-else-if="tx.note">
                    <span class="text-xs text-gray-400 max-w-[150px] truncate italic" :title="tx.note">
                      {{ tx.note }}
                    </span>
                  </template>
                  <span v-else class="text-gray-300">-</span>
                </div>
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
  </div>
</template>
