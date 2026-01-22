<!-- eslint-disable no-alert -->
<script setup lang="ts">
import { apiFetch } from '~/utils/api'

definePageMeta({
  layout: 'account',
})

// [类型定义] 为了更好的类型提示
interface AdminUserItem {
  id: number
  username: string
  role: string
  isAiAgent: boolean
  availableCash: string | number
  cash: number // 后端计算返回
  fundValue: number // 后端计算返回
  totalAssets: number // 后端计算返回
  holdingCount: number // [新增]
  watchingCount: number // [新增]
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

// --- [新增] 合并持仓相关状态 ---
const isMergeModalOpen = ref(false)
const mergeSourceUser = ref<AdminUserItem | null>(null) // 来源用户 (当前点击的那行)
const mergeTargetUserId = ref<number | null>(null) // 目标用户 ID

// [新增] 打开合并模态框
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
    alert(`合并失败: ${err.data?.message || err.message}`)
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

// 辅助函数：格式化金额
function formatCurrency(value: number | string) {
  return new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY' }).format(Number(value))
}

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
    alert(`重置失败: ${err.data?.message || '未知错误'}`)
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
    alert(`修改失败: ${err.data?.message || '未知错误'}`)
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
    alert(`添加失败: ${err.data?.message || '发生未知错误'}`)
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
    alert(`删除失败: ${e.data?.message || '未知错误'}`)
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
    alert(`克隆失败: ${err.data?.message || '未知错误'}`)
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
    <div v-else class="border border-gray-200 rounded-lg overflow-hidden dark:border-gray-700">
      <table class="text-left w-full">
        <!-- 表头：简化背景，使用 uppercase 和 spacing 增加质感 -->
        <thead class="border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800">
          <tr>
            <th class="text-xs text-gray-500 tracking-wider font-semibold px-6 py-3 w-64 uppercase">
              用户 (User)
            </th>
            <th class="text-xs text-gray-500 tracking-wider font-semibold px-6 py-3 text-center uppercase">
              投资组合 (Portfolio)
            </th>
            <th class="text-xs text-gray-500 tracking-wider font-semibold px-6 py-3 text-right uppercase">
              财务概览 (Financials)
            </th>
            <th class="text-xs text-gray-500 tracking-wider font-semibold px-6 py-3 text-center uppercase">
              AI 代理
            </th>
            <th class="text-xs text-gray-500 tracking-wider font-semibold px-6 py-3 text-right uppercase">
              操作
            </th>
          </tr>
        </thead>

        <tbody class="bg-white divide-gray-100 divide-y dark:bg-gray-900 dark:divide-gray-800">
          <tr v-for="user in users" :key="user.id" class="transition-colors duration-150 hover:bg-gray-50/50 dark:hover:bg-gray-800/50">
            <!-- 1. 用户信息：头像 + 名字 + 角色 -->
            <td class="px-6 py-4 align-top">
              <div class="flex gap-3 items-start">
                <!-- 头像 -->
                <div
                  class="text-sm font-bold rounded-full flex h-10 w-10 shadow-sm items-center justify-center"
                  :class="user.role === 'admin' ? 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-300' : 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300'"
                >
                  {{ user.username.charAt(0).toUpperCase() }}
                </div>
                <!-- 详情 -->
                <div>
                  <div class="text-gray-900 font-medium dark:text-gray-100">
                    {{ user.username }}
                  </div>
                  <div class="text-xs text-gray-400 mt-0.5 flex gap-1 items-center">
                    <span class="font-mono">ID:{{ user.id }}</span>
                    <span>·</span>
                    <span class="capitalize">{{ user.role }}</span>
                  </div>
                </div>
              </div>
            </td>

            <!-- 2. 投资组合：持仓与关注 -->
            <td class="px-6 py-4 text-center align-middle">
              <div class="inline-flex flex-col gap-1.5 items-start">
                <div class="text-xs text-blue-700 font-medium px-2.5 py-0.5 border border-blue-100 rounded-full bg-blue-50 flex gap-1.5 items-center dark:text-blue-300 dark:border-blue-800/50 dark:bg-blue-900/20">
                  <div class="rounded-full bg-blue-500 h-1.5 w-1.5" />
                  持仓: {{ user.holdingCount }}
                </div>
                <div class="text-xs text-gray-600 font-medium px-2.5 py-0.5 border border-gray-200 rounded-full bg-gray-100 flex gap-1.5 items-center dark:text-gray-400 dark:border-gray-700 dark:bg-gray-800">
                  <div class="rounded-full bg-gray-400 h-1.5 w-1.5" />
                  关注: {{ user.watchingCount }}
                </div>
              </div>
            </td>

            <!-- 3. 财务概览：主次分明 -->
            <td class="px-6 py-4 text-right align-middle">
              <div class="flex flex-col gap-0.5">
                <span class="text-sm text-gray-900 font-bold font-numeric dark:text-gray-100">
                  {{ formatCurrency(user.totalAssets) }}
                </span>
                <div class="text-[10px] text-gray-400 font-mono flex flex-col gap-0.5 items-end">
                  <span title="基金市值">F: {{ formatCurrency(user.fundValue) }}</span>
                  <span title="可用现金">C: {{ formatCurrency(user.cash) }}</span>
                </div>
              </div>
            </td>

            <!-- 4. AI 状态 Badge -->
            <td class="px-6 py-4 text-center align-middle">
              <div
                class="text-xs font-medium px-3 py-1 border rounded-full inline-flex gap-1.5 transition-colors items-center"
                :class="user.isAiAgent
                  ? 'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-900/20 dark:text-teal-300 dark:border-teal-800'
                  : 'bg-gray-50 text-gray-500 border-gray-200 dark:bg-gray-800 dark:text-gray-500 dark:border-gray-700'"
              >
                <div :class="user.isAiAgent ? 'i-carbon-bot text-teal-600 dark:text-teal-400' : 'i-carbon-user text-gray-400'" />
                {{ user.isAiAgent ? 'Active' : 'Off' }}
              </div>
            </td>

            <!-- 5. 操作按钮 -->
            <td class="px-6 py-4 text-right align-middle">
              <div class="flex gap-1 justify-end">
                <!-- 原有按钮: 编辑 -->
                <button
                  class="text-gray-500 p-1.5 rounded-md transition-colors dark:text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:text-blue-400 dark:hover:bg-blue-900/20"
                  title="编辑用户/资金/AI配置"
                  @click="openEditModal(user)"
                >
                  <div i-carbon-edit class="text-lg" />
                </button>

                <!-- 原有按钮: 重置密码 -->
                <button
                  class="text-gray-500 p-1.5 rounded-md transition-colors dark:text-gray-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:text-amber-400 dark:hover:bg-amber-900/20"
                  title="重置密码"
                  @click="openResetPwdModal(user.id)"
                >
                  <div i-carbon-password class="text-lg" />
                </button>

                <!-- [新增] 按钮: 合并持仓 -->
                <!-- 图标：migrate/flow-stream/arrows-horizontal -->
                <button
                  class="text-gray-500 p-1.5 rounded-md transition-colors dark:text-gray-400 hover:text-teal-600 hover:bg-teal-50 dark:hover:text-teal-400 dark:hover:bg-teal-900/20"
                  title="合并持仓到..."
                  @click="openMergeModal(user)"
                >
                  <div i-carbon-continuous-integration class="text-lg" />
                </button>

                <!-- 原有按钮: 克隆 (新建) -->
                <button
                  class="text-gray-500 p-1.5 rounded-md transition-colors dark:text-gray-400 hover:text-purple-600 hover:bg-purple-50 dark:hover:text-purple-400 dark:hover:bg-purple-900/20"
                  title="克隆为新用户"
                  @click="openCloneModal(user.id)"
                >
                  <div i-carbon-copy-file class="text-lg" />
                </button>

                <!-- 原有按钮: 删除 -->
                <button
                  class="text-gray-400 p-1.5 rounded-md transition-colors hover:text-red-600 hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-900/20"
                  title="删除用户"
                  @click="deleteUser(user)"
                >
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
