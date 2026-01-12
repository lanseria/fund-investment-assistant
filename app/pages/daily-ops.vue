<!-- eslint-disable no-alert -->
<!-- app/pages/daily-ops.vue -->
<script setup lang="ts">
import { appName } from '~/constants'

useHead({
  title: `每日操作 - ${appName}`,
})

const dayjs = useDayjs()

// --- 状态管理 ---
const selectedDate = ref(dayjs().format('YYYY-MM-DD')) // 当前选中的日期
const viewDate = ref(dayjs()) // 当前日历视图显示的月份

// 展开/折叠的用户组集合
const expandedGroups = ref<Set<string>>(new Set())

// --- 获取数据 ---
const { data: transactions, pending, refresh } = await useAsyncData(
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

// 复制 Prompt
async function handleCopyPrompt(userId: number, username: string) {
  isLogLoading.value = true
  try {
    const log = await apiFetch<{ prompt: string }>(`/api/admin/ai-logs`, {
      params: { userId, date: selectedDate.value },
    })

    // 复制到剪贴板
    const { copy } = useClipboard({ legacy: true })
    await copy(log.prompt)
    alert(`用户 ${username} 的 Prompt 已复制到剪贴板！`)
  }
  catch (e: any) {
    alert(`获取日志失败: ${e.data?.message || '未找到日志或发生错误'}`)
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
  return transactions.value?.some(tx => tx.status === 'pending') ?? false
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

// --- 分组逻辑 ---
const groupedTransactions = computed(() => {
  if (!transactions.value)
    return []

  // [修改] 类型定义增加 id
  const groups: Record<string, { user: { id: number, username: string, isAiAgent: boolean }, txs: any[] }> = {}

  for (const tx of transactions.value) {
    const username = tx.username
    if (!groups[username]) {
      groups[username] = {
        // [修改] 从 tx 中获取 userId (注意：后端返回的字段通常是 userId，但 transactions 接口使用了 join，需要确认)
        // 检查 `server/routes/api/transactions/daily.get.ts`，它并没有返回 `userId`。
        // 我们需要先去修改后端接口 daily.get.ts
        user: { id: tx.userId || 0, username, isAiAgent: tx.isAiAgent },
        txs: [],
      }
    }
    groups[username]!.txs.push(tx)
  }

  // 按用户名排序
  return Object.values(groups).sort((a, b) => a.user.username.localeCompare(b.user.username))
})

// 当数据更新时，默认展开所有有数据的组
watch(groupedTransactions, (groups) => {
  const newSet = new Set<string>()
  groups.forEach(g => newSet.add(g.user.username))
  expandedGroups.value = newSet
}, { immediate: true })

function toggleGroup(username: string) {
  if (expandedGroups.value.has(username))
    expandedGroups.value.delete(username)
  else
    expandedGroups.value.add(username)
}

// --- 日历逻辑 (复用自 news.vue) ---
const weekDays = ['日', '一', '二', '三', '四', '五', '六']

const calendarDays = computed(() => {
  const year = viewDate.value.year()
  const month = viewDate.value.month()
  const firstDayOfMonth = dayjs(new Date(year, month, 1))
  const daysInMonth = firstDayOfMonth.daysInMonth()
  const startDayOfWeek = firstDayOfMonth.day()

  const days = []
  for (let i = 0; i < startDayOfWeek; i++) {
    days.push({ day: null, dateStr: '' })
  }
  for (let i = 1; i <= daysInMonth; i++) {
    const dateStr = dayjs(new Date(year, month, i)).format('YYYY-MM-DD')
    days.push({
      day: i,
      dateStr,
      isToday: dateStr === dayjs().format('YYYY-MM-DD'),
      isSelected: dateStr === selectedDate.value,
    })
  }
  return days
})

function changeMonth(delta: number) {
  viewDate.value = viewDate.value.add(delta, 'month')
}

function selectDate(dateStr: string) {
  if (!dateStr)
    return
  selectedDate.value = dateStr
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
      <!-- 左侧：日历 -->
      <div class="p-4 card w-full select-none md:flex-shrink-0 md:w-auto">
        <div class="mb-4 flex items-center justify-between">
          <button class="icon-btn p-1" @click="changeMonth(-1)">
            <div i-carbon-chevron-left />
          </button>
          <span class="text-lg font-bold">
            {{ viewDate.format('YYYY年 MM月') }}
          </span>
          <button class="icon-btn p-1" @click="changeMonth(1)">
            <div i-carbon-chevron-right />
          </button>
        </div>

        <div class="mb-2 gap-1 grid grid-cols-7">
          <div v-for="wd in weekDays" :key="wd" class="text-xs text-gray-400 font-medium text-center flex h-8 items-center justify-center">
            {{ wd }}
          </div>
        </div>

        <div class="gap-1 grid grid-cols-7">
          <template v-for="(item, index) in calendarDays" :key="index">
            <div v-if="!item.day" class="h-10 w-10" />
            <button
              v-else
              class="text-sm rounded-full flex h-10 w-10 transition-all items-center justify-center relative"
              :class="[
                item.isSelected
                  ? 'bg-primary text-white shadow-md font-bold'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200',
                item.isToday && !item.isSelected ? 'border border-primary text-primary font-bold' : '',
              ]"
              @click="selectDate(item.dateStr)"
            >
              {{ item.day }}
              <span v-if="item.isToday && !item.isSelected" class="rounded-full bg-primary h-1 w-1 bottom-1 absolute" />
            </button>
          </template>
        </div>

        <div class="mt-4 text-center">
          <button class="text-xs text-primary hover:underline" @click="selectDate(dayjs().format('YYYY-MM-DD')); viewDate = dayjs()">
            回到今天
          </button>
        </div>
      </div>

      <!-- 右侧：操作列表 -->
      <div class="flex-grow w-full space-y-4">
        <!-- 标题栏 -->
        <div class="flex items-center justify-between">
          <h2 class="text-xl font-bold flex gap-2 items-center">
            {{ selectedDate }} 操作记录
            <span v-if="transactions" class="text-sm text-gray-500 font-normal px-2 py-0.5 rounded-full bg-gray-100 dark:text-gray-400 dark:bg-gray-800">
              共 {{ transactions.length }} 笔
            </span>
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

        <!-- 空状态 -->
        <div v-else-if="!transactions || transactions.length === 0" class="text-gray-400 py-16 text-center card">
          <div i-carbon-roadmap class="text-5xl mx-auto mb-3 opacity-50" />
          <p>该日期暂无任何操作记录</p>
        </div>

        <!-- 按用户分组列表 (Collapsible) -->
        <div v-else class="space-y-4">
          <div v-for="group in groupedTransactions" :key="group.user.username" class="border rounded-lg bg-white shadow-sm overflow-hidden dark:border-gray-700 dark:bg-gray-800">
            <!-- 组头部：点击展开/折叠 -->
            <div
              class="px-4 py-3 bg-gray-50 flex cursor-pointer transition-colors items-center justify-between dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700"
              @click="toggleGroup(group.user.username)"
            >
              <div class="flex gap-3 items-center">
                <!-- 头像 -->
                <div class="text-sm text-primary font-bold border rounded-full bg-white flex h-8 w-8 shadow-sm items-center justify-center dark:text-gray-200 dark:border-gray-500 dark:bg-gray-600">
                  {{ group.user.username.charAt(0).toUpperCase() }}
                </div>
                <!-- 用户名 -->
                <div class="flex gap-2 items-center">
                  <span class="text-gray-800 font-bold dark:text-gray-200">{{ group.user.username }}</span>
                  <span v-if="group.user.isAiAgent" class="i-carbon-bot text-xs text-primary" title="AI 代理账户" />
                  <span class="text-xs text-gray-500 ml-1">({{ group.txs.length }} 笔)</span>
                </div>

                <!-- 管理员操作按钮组 -->
                <div class="ml-4 flex gap-2" @click.stop>
                  <button
                    class="text-xs px-2 py-1 border rounded bg-white flex dark:border-gray-500 dark:bg-gray-600 hover:bg-gray-50 dark:hover:bg-gray-500"
                    title="复制 AI Prompt"
                    @click="handleCopyPrompt(group.txs[0].userId, group.user.username)"
                  >
                    <div class="i-carbon-copy" /> Prompt
                  </button>
                  <button
                    class="text-xs text-blue-600 px-2 py-1 border rounded bg-white flex dark:text-blue-300 dark:border-gray-500 dark:bg-gray-600 hover:bg-gray-50 dark:hover:bg-gray-500"
                    title="人工修正 (Import JSON)"
                    @click="openImportModal({ id: group.txs[0].userId, username: group.user.username })"
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

            <!-- 如果组展开且无数据（理论上不会发生，因为只显示有数据的组） -->
            <div v-if="expandedGroups.has(group.user.username) && group.txs.length === 0" class="text-sm text-gray-400 p-4 text-center">
              无操作记录
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
