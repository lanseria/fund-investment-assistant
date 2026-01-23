<!-- eslint-disable no-alert -->
<script setup lang="ts">
import { apiFetch } from '~/utils/api'
import { formatCurrency } from '~/utils/format'

definePageMeta({
  layout: 'account',
})

interface AdminUserItem {
  id: number
  username: string
  role: string
  isAiAgent: boolean
  availableCash: string | number
  cash: number // 后端计算返回
  fundValue: number // 后端计算返回
  totalAssets: number // 后端计算返回
  holdingCount: number
  watchingCount: number
  createdAt: string
  aiSystemPrompt?: string
}

const { data: users, pending, error, refresh } = useAsyncData<AdminUserItem[]>('admin-users', () =>
  apiFetch<AdminUserItem[]>('/api/admin/users'))

// 控制模态框显示的状态
const isAddModalOpen = ref(false)
const isCloneModalOpen = ref(false)
const isEditModalOpen = ref(false)
const isSubmitting = ref(false)

// --- 合并持仓相关状态 ---
const isMergeModalOpen = ref(false)
const mergeSourceUser = ref<AdminUserItem | null>(null) // 来源用户 (当前点击的那行)
const mergeTargetUserId = ref<number | null>(null) // 目标用户 ID

// 打开合并模态框
function openMergeModal(user: AdminUserItem) {
  mergeSourceUser.value = user
  mergeTargetUserId.value = null // 重置目标选择
  isMergeModalOpen.value = true
}

// [新增] 提交合并请求
async function handleMergeHoldings() {
  if (!mergeSourceUser.value || !mergeTargetUserId.value)
    return

  const targetUser = users.value?.find(u => u.id === mergeTargetUserId.value)
  if (!targetUser)
    return

  if (!confirm(`确认将 [${mergeSourceUser.value.username}] 的所有基金列表合并到 [${targetUser.username}] 吗？\n\n新添加的基金将默认为“仅关注”状态（不复制持仓份额）。\n如果目标用户已持有某基金，将保留其原数据。`)) {
    return
  }

  isSubmitting.value = true
  try {
    const res = await apiFetch<{ message: string, addedCount: number }>('/api/admin/users/merge-holdings', {
      method: 'POST',
      body: {
        sourceUserId: mergeSourceUser.value.id,
        targetUserId: mergeTargetUserId.value,
      },
    })

    alert(`合并成功！共为目标用户新增了 ${res.addedCount} 个基金关注。`)
    isMergeModalOpen.value = false
    await refresh() // 刷新列表以更新统计数据
  }
  catch (err: any) {
    alert(`合并失败: ${err.data?.statusMessage || err.message}`)
  }
  finally {
    isSubmitting.value = false
  }
}

// 克隆相关
const cloneSourceId = ref<number | null>(null)
const cloneNewUsername = ref('')

// 编辑相关
const editingUserId = ref<number | null>(null)
const editForm = reactive({
  username: '',
  availableCash: 0,
  isAiAgent: false,
  aiSystemPrompt: '',
})

// 重置密码相关
const isResetPwdModalOpen = ref(false)
const resetPwdUserId = ref<number | null>(null)
const newPassword = ref('')

function openEditModal(user: any) {
  editingUserId.value = user.id
  editForm.username = user.username
  editForm.availableCash = user.availableCash ? Number(user.availableCash) : 0
  editForm.isAiAgent = user.isAiAgent || false
  editForm.aiSystemPrompt = user.aiSystemPrompt || ''
  isEditModalOpen.value = true
}

function openResetPwdModal(userId: number) {
  resetPwdUserId.value = userId
  newPassword.value = ''
  isResetPwdModalOpen.value = true
}

async function handleResetPassword() {
  if (!resetPwdUserId.value || !newPassword.value)
    return
  if (newPassword.value.length < 6) {
    alert('密码长度至少6位')
    return
  }
  isSubmitting.value = true
  try {
    await apiFetch(`/api/admin/users/${resetPwdUserId.value}`, {
      method: 'PUT',
      body: { password: newPassword.value },
    })
    isResetPwdModalOpen.value = false
    alert('密码重置成功')
  }
  catch (err: any) {
    alert(`重置失败: ${err.data?.statusMessage || '未知错误'}`)
  }
  finally {
    isSubmitting.value = false
  }
}

async function handleEditUser() {
  if (!editingUserId.value)
    return
  isSubmitting.value = true
  try {
    await apiFetch(`/api/admin/users/${editingUserId.value}`, {
      method: 'PUT',
      body: {
        username: editForm.username,
        availableCash: editForm.availableCash,
        isAiAgent: editForm.isAiAgent,
        aiSystemPrompt: editForm.aiSystemPrompt || null,
      },
    })
    isEditModalOpen.value = false
    await refresh()
    alert('用户信息修改成功')
  }
  catch (err: any) {
    alert(`修改失败: ${err.data?.statusMessage || '未知错误'}`)
  }
  finally {
    isSubmitting.value = false
  }
}

async function handleAddUser(formData: any) {
  isSubmitting.value = true
  try {
    await apiFetch('/api/admin/users', {
      method: 'POST',
      body: formData,
    })
    isAddModalOpen.value = false
    await refresh()
    alert('用户添加成功！')
  }
  catch (err: any) {
    console.error('添加用户失败:', err)
    alert(`添加失败: ${err.data?.statusMessage || '发生未知错误'}`)
  }
  finally {
    isSubmitting.value = false
  }
}

async function deleteUser(user: any) {
  if (!confirm(`⚠️ 危险操作：确定要删除用户 "${user.username}" 吗？\n此操作将同时删除该用户的所有持仓记录且不可恢复！`)) {
    return
  }
  try {
    await apiFetch(`/api/admin/users/${user.id}`, { method: 'DELETE' })
    await refresh()
  }
  catch (e: any) {
    alert(`删除失败: ${e.data?.statusMessage || '未知错误'}`)
  }
}

function openCloneModal(userId: number) {
  cloneSourceId.value = userId
  cloneNewUsername.value = ''
  isCloneModalOpen.value = true
}

async function handleCloneUser() {
  if (!cloneSourceId.value || !cloneNewUsername.value)
    return
  isSubmitting.value = true
  try {
    await apiFetch('/api/admin/users/clone', {
      method: 'POST',
      body: {
        sourceUserId: cloneSourceId.value,
        newUsername: cloneNewUsername.value,
      },
    })
    isCloneModalOpen.value = false
    await refresh()
    alert(`用户克隆成功！新用户: ${cloneNewUsername.value}, 默认密码: 123456`)
  }
  catch (err: any) {
    alert(`克隆失败: ${err.data?.statusMessage || '未知错误'}`)
  }
  finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <div>
    <header class="mb-4 flex items-center justify-between">
      <h1 class="text-2xl font-bold">
        用户管理
      </h1>
      <button class="btn flex items-center" @click="isAddModalOpen = true">
        <div i-carbon-add mr-1 />
        添加用户
      </button>
    </header>

    <div v-if="pending">
      加载中...
    </div>
    <div v-else-if="error" class="text-red-500">
      加载失败: {{ error.message }}
    </div>
    <div v-else class="border border-gray-200 rounded-lg shadow-sm overflow-hidden dark:border-gray-700">
      <table class="text-left w-full table-fixed">
        <thead class="border-b border-gray-200 bg-gray-50/50 dark:border-gray-700 dark:bg-gray-800">
          <tr>
            <th class="text-xs text-gray-500 font-semibold px-6 py-4 w-[25%] uppercase">
              用户
            </th>
            <th class="text-xs text-gray-500 font-semibold px-6 py-4 w-[40%] uppercase">
              资金分布 (利用率)
            </th>
            <th class="text-xs text-gray-500 font-semibold px-6 py-4 text-center w-[15%] uppercase">
              持仓统计
            </th>
            <th class="text-xs text-gray-500 font-semibold px-6 py-4 text-right w-[20%] uppercase">
              操作
            </th>
          </tr>
        </thead>

        <tbody class="bg-white divide-gray-100 divide-y dark:bg-gray-900 dark:divide-gray-800">
          <tr v-for="user in users" :key="user.id" class="group transition-colors duration-150 hover:bg-gray-50/80 dark:hover:bg-gray-800/60">
            <!-- 1. 用户信息 -->
            <td class="px-6 py-5 align-top">
              <div class="flex gap-3 items-center">
                <div
                  class="text-sm font-bold rounded-full flex shrink-0 h-10 w-10 ring-1 ring-gray-200 shadow-sm items-center justify-center dark:ring-gray-700"
                  :class="user.role === 'admin' ? 'bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-300' : 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300'"
                >
                  {{ user.username.charAt(0).toUpperCase() }}
                </div>
                <div class="flex flex-col min-w-0">
                  <div class="flex gap-2 items-center">
                    <span class="text-gray-900 font-semibold truncate dark:text-gray-100">
                      {{ user.username }}
                    </span>
                    <AiAgentBadge v-if="user.isAiAgent" />
                  </div>
                  <div class="mt-0.5 flex gap-2 items-center">
                    <span class="text-[10px] text-gray-400 font-mono">ID:{{ user.id }}</span>
                    <span
                      class="text-[10px] px-1.5 py-px border rounded capitalize"
                      :class="user.role === 'admin' ? 'border-purple-200 text-purple-600 bg-purple-50 dark:border-purple-800 dark:bg-purple-900/20' : 'border-gray-200 text-gray-500 bg-gray-50 dark:border-gray-700 dark:bg-gray-800'"
                    >
                      {{ user.role }}
                    </span>
                  </div>
                </div>
              </div>
            </td>

            <!-- 2. 资金分布 & 进度条 -->
            <td class="px-6 py-5 align-middle">
              <div class="flex flex-col gap-2 w-full">
                <!-- 总资产标题 -->
                <div class="flex items-baseline justify-between">
                  <span class="text-xs text-gray-500 dark:text-gray-400">总资产</span>
                  <span class="text-lg text-gray-900 font-bold font-numeric dark:text-white">
                    {{ formatCurrency(user.totalAssets) }}
                  </span>
                </div>

                <!-- 进度条 (资金利用率) -->
                <div class="rounded-full bg-gray-100 flex h-2.5 w-full overflow-hidden dark:bg-gray-700/50">
                  <!-- 基金部分 (仓位) -->
                  <div
                    class="group/bar bg-blue-500 transition-all duration-500 ease-out relative"
                    :style="{ width: user.totalAssets > 0 ? `${(user.fundValue / user.totalAssets) * 100}%` : '0%' }"
                  >
                    <!-- 悬浮提示仓位比例 -->
                    <div class="text-[10px] text-white mb-1 px-1.5 py-0.5 rounded bg-gray-800 opacity-0 whitespace-nowrap transition-opacity bottom-full left-1/2 absolute z-10 group-hover/bar:opacity-100 -translate-x-1/2">
                      仓位: {{ user.totalAssets > 0 ? ((user.fundValue / user.totalAssets) * 100).toFixed(1) : 0 }}%
                    </div>
                  </div>
                  <!-- 现金部分 (剩余) - 自动填充剩余空间 -->
                  <div class="group/bar-cash bg-emerald-400 flex-grow relative">
                    <!-- 悬浮提示现金比例 -->
                    <div class="text-[10px] text-white mb-1 px-1.5 py-0.5 rounded bg-gray-800 opacity-0 whitespace-nowrap transition-opacity bottom-full left-1/2 absolute z-10 group-hover/bar-cash:opacity-100 -translate-x-1/2">
                      现金: {{ user.totalAssets > 0 ? ((user.cash / user.totalAssets) * 100).toFixed(1) : 0 }}%
                    </div>
                  </div>
                </div>

                <!-- 详细数值 (中文) -->
                <div class="text-xs mt-0.5 flex items-center justify-between">
                  <div class="flex gap-1.5 items-center" title="已买入基金的市值">
                    <span class="rounded-full bg-blue-500 h-2 w-2" />
                    <span class="text-gray-500 dark:text-gray-400">基金市值:</span>
                    <span class="text-gray-700 font-medium font-numeric dark:text-gray-200">{{ formatCurrency(user.fundValue) }}</span>
                  </div>
                  <div class="flex gap-1.5 items-center" title="账户内可用余额">
                    <span class="rounded-full bg-emerald-400 h-2 w-2" />
                    <span class="text-gray-500 dark:text-gray-400">可用现金:</span>
                    <span class="text-gray-700 font-medium font-numeric dark:text-gray-200">{{ formatCurrency(user.cash) }}</span>
                  </div>
                </div>
              </div>
            </td>

            <!-- 3. 持仓统计 -->
            <td class="px-6 py-5 align-middle">
              <div class="flex flex-col gap-2 h-full items-center justify-center">
                <div class="px-3 py-1.5 border border-blue-100 rounded-md bg-blue-50/50 flex w-24 items-center justify-between dark:border-blue-800/30 dark:bg-blue-900/10">
                  <span class="text-xs text-blue-600/80 dark:text-blue-300/80">持仓</span>
                  <span class="text-sm text-blue-700 font-bold font-numeric dark:text-blue-300">{{ user.holdingCount }}</span>
                </div>
                <div class="px-3 py-1.5 border border-gray-100 rounded-md bg-gray-50 flex w-24 items-center justify-between dark:border-gray-700/50 dark:bg-gray-800/50">
                  <span class="text-xs text-gray-500">关注</span>
                  <span class="text-sm text-gray-600 font-bold font-numeric dark:text-gray-400">{{ user.watchingCount }}</span>
                </div>
              </div>
            </td>

            <!-- 4. 操作按钮 -->
            <td class="px-6 py-5 text-right align-middle">
              <div class="opacity-60 flex gap-1 transition-opacity justify-end group-hover:opacity-100">
                <!-- 编辑 -->
                <button class="icon-btn p-2 hover:text-blue-600 hover:bg-blue-50 dark:hover:text-blue-400 dark:hover:bg-blue-900/30" title="编辑资料" @click="openEditModal(user)">
                  <div i-carbon-edit class="text-lg" />
                </button>

                <!-- 重置密码 -->
                <button class="icon-btn p-2 hover:text-amber-600 hover:bg-amber-50 dark:hover:text-amber-400 dark:hover:bg-amber-900/30" title="重置密码" @click="openResetPwdModal(user.id)">
                  <div i-carbon-password class="text-lg" />
                </button>

                <!-- 合并 -->
                <button class="icon-btn p-2 hover:text-teal-600 hover:bg-teal-50 dark:hover:text-teal-400 dark:hover:bg-teal-900/30" title="合并持仓" @click="openMergeModal(user)">
                  <div i-carbon-continuous-integration class="text-lg" />
                </button>

                <!-- 克隆 -->
                <button class="icon-btn p-2 hover:text-purple-600 hover:bg-purple-50 dark:hover:text-purple-400 dark:hover:bg-purple-900/30" title="克隆用户" @click="openCloneModal(user.id)">
                  <div i-carbon-copy-file class="text-lg" />
                </button>

                <div class="mx-1 bg-gray-300 h-5 w-px self-center dark:bg-gray-600/50" />

                <!-- 删除 -->
                <button class="icon-btn p-2 hover:text-red-600 hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-900/30" title="删除用户" @click="deleteUser(user)">
                  <div i-carbon-trash-can class="text-lg" />
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Modals (Add, Clone, ResetPwd, Edit) -->
    <!-- 保持原有模态框组件结构不变，仅展示数据逻辑变化 -->

    <Modal v-model="isAddModalOpen" title="添加新用户">
      <AddUserForm v-if="isAddModalOpen" @submit="handleAddUser" @cancel="isAddModalOpen = false" />
    </Modal>

    <Modal v-model="isCloneModalOpen" title="克隆用户">
      <form @submit.prevent="handleCloneUser">
        <div class="space-y-4">
          <p class="text-sm text-gray-500">
            这将创建一个新用户，并复制 ID:{{ cloneSourceId }} 的所有持仓数据。
            <br>默认密码为: <span class="font-bold font-mono">123456</span>
          </p>
          <div>
            <label class="text-sm font-medium mb-1 block">新用户名</label>
            <input
              v-model="cloneNewUsername"
              type="text"
              class="input-base"
              placeholder="请输入新用户名"
              required
              autofocus
            >
          </div>
        </div>
        <div class="mt-6 flex justify-end space-x-3">
          <button type="button" class="px-4 py-2 rounded-md bg-gray-100 dark:bg-gray-600" @click="isCloneModalOpen = false">
            取消
          </button>
          <button type="submit" class="btn" :disabled="!cloneNewUsername || isSubmitting">
            {{ isSubmitting ? '处理中...' : '确认克隆' }}
          </button>
        </div>
      </form>
    </Modal>

    <Modal v-model="isResetPwdModalOpen" title="重置用户密码">
      <form @submit.prevent="handleResetPassword">
        <div class="space-y-4">
          <p class="text-sm text-gray-500">
            请输入新的密码。重置后用户需要使用新密码重新登录。
          </p>
          <div>
            <label class="text-sm font-medium mb-1 block">新密码</label>
            <input
              v-model="newPassword"
              type="text"
              class="font-mono input-base"
              placeholder="至少6位"
              required
              autofocus
            >
          </div>
        </div>
        <div class="mt-6 flex justify-end space-x-3">
          <button type="button" class="px-4 py-2 rounded-md bg-gray-100 dark:bg-gray-600" @click="isResetPwdModalOpen = false">
            取消
          </button>
          <button type="submit" class="btn" :disabled="!newPassword || newPassword.length < 6 || isSubmitting">
            {{ isSubmitting ? '重置中...' : '确认重置' }}
          </button>
        </div>
      </form>
    </Modal>

    <Modal v-model="isEditModalOpen" title="编辑用户信息">
      <form @submit.prevent="handleEditUser">
        <div class="pr-2 max-h-[70vh] overflow-y-auto space-y-4">
          <div>
            <label class="text-sm font-medium mb-1 block">用户名</label>
            <input
              v-model="editForm.username"
              type="text"
              class="input-base"
              placeholder="请输入新的用户名"
              required
            >
          </div>

          <div>
            <label class="text-sm font-medium mb-1 block">可用现金 (Available Cash)</label>
            <div class="relative">
              <span class="text-gray-500 left-3 top-2 absolute">¥</span>
              <input
                v-model.number="editForm.availableCash"
                type="number"
                step="0.01"
                class="input-base pl-7"
                placeholder="0.00"
              >
            </div>
            <p class="text-xs text-gray-400 mt-1">
              用户账户中的现金余额。
            </p>
          </div>

          <AiSettingsPanel
            v-model:is-ai-agent="editForm.isAiAgent"
            v-model:ai-system-prompt="editForm.aiSystemPrompt"
            mode="form"
          />
        </div>

        <div class="mt-6 pt-4 border-t flex justify-end space-x-3 dark:border-gray-700">
          <button type="button" class="px-4 py-2 rounded-md bg-gray-100 dark:bg-gray-600" @click="isEditModalOpen = false">
            取消
          </button>
          <button type="submit" class="btn" :disabled="!editForm.username || isSubmitting">
            {{ isSubmitting ? '保存中...' : '保存全部修改' }}
          </button>
        </div>
      </form>
    </Modal>
    <!-- [新增] 合并持仓模态框 -->
    <Modal v-model="isMergeModalOpen" title="合并持仓关注">
      <form @submit.prevent="handleMergeHoldings">
        <div class="space-y-4">
          <div class="text-sm text-blue-800 p-3 rounded bg-blue-50 dark:text-blue-300 dark:bg-blue-900/20">
            <p>
              <span class="font-bold">源用户:</span> {{ mergeSourceUser?.username }}
            </p>
            <p class="mt-1 opacity-80">
              操作逻辑：将该用户的所有基金（持仓+关注）复制给目标用户。
              <br>• 取并集 (Union)，新条目作为<span class="font-bold">仅关注</span>添加。
              <br>• 如果目标用户已存在某基金，则<span class="font-bold">保留目标用户原数据</span>（不覆盖）。
            </p>
          </div>

          <div>
            <label class="text-sm font-medium mb-1 block">选择目标用户 (合并到...)</label>
            <div class="relative">
              <select
                v-model="mergeTargetUserId"
                class="input-base appearance-none"
                required
              >
                <option :value="null" disabled>
                  请选择用户
                </option>
                <!-- 过滤掉源用户自己 -->
                <option
                  v-for="u in users?.filter(x => x.id !== mergeSourceUser?.id)"
                  :key="u.id"
                  :value="u.id"
                >
                  {{ u.username }} (ID: {{ u.id }})
                </option>
              </select>
              <div class="text-gray-500 px-3 flex pointer-events-none items-center inset-y-0 right-0 absolute">
                <div i-carbon-chevron-down />
              </div>
            </div>
          </div>
        </div>

        <div class="mt-6 flex justify-end space-x-3">
          <button
            type="button"
            class="text-sm font-medium px-4 py-2 rounded-md bg-gray-100 dark:bg-gray-600 hover:bg-gray-200 dark:hover:bg-gray-500"
            @click="isMergeModalOpen = false"
          >
            取消
          </button>
          <button
            type="submit"
            class="btn text-white bg-teal-600 hover:bg-teal-700"
            :disabled="!mergeTargetUserId || isSubmitting"
          >
            {{ isSubmitting ? '合并中...' : '确认合并' }}
          </button>
        </div>
      </form>
    </Modal>
  </div>
</template>
