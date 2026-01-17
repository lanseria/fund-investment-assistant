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
  createdAt: string
  aiModel?: string
  aiTotalAmount?: number
  aiSystemPrompt?: string
}

const { data: users, pending, error, refresh } = useAsyncData<AdminUserItem[]>('admin-users', () =>
  apiFetch<AdminUserItem[]>('/api/admin/users'))

// 控制模态框显示的状态
const isAddModalOpen = ref(false)
const isCloneModalOpen = ref(false)
const isEditModalOpen = ref(false)
const isSubmitting = ref(false)

// 克隆相关
const cloneSourceId = ref<number | null>(null)
const cloneNewUsername = ref('')

// 编辑相关
const editingUserId = ref<number | null>(null)
const editForm = reactive({
  username: '',
  availableCash: 0,
  isAiAgent: false,
  aiTotalAmount: 100000,
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
  editForm.aiTotalAmount = user.aiTotalAmount ? Number(user.aiTotalAmount) : 100000
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
        aiTotalAmount: editForm.aiTotalAmount,
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

async function toggleUserAi(user: any) {
  const newState = !user.isAiAgent
  user.isAiAgent = newState
  try {
    await apiFetch(`/api/admin/users/${user.id}`, {
      method: 'PUT',
      body: { isAiAgent: newState },
    })
  }
  catch (e: any) {
    user.isAiAgent = !newState
    alert(`更新失败: ${e.data?.statusMessage || '未知错误'}`)
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
    <div v-else class="overflow-hidden">
      <table class="text-sm text-left w-full">
        <!-- 表格 header -->
        <thead class="border-b bg-gray-50 dark:border-gray-700 dark:bg-gray-700/50">
          <tr>
            <th class="font-semibold p-4 w-16">
              ID
            </th>
            <th class="font-semibold p-4">
              用户名 / 角色
            </th>
            <!-- [新增] 资产列 -->
            <th class="font-semibold p-4 text-right">
              总资产 (权益)
            </th>
            <th class="font-semibold p-4 text-right">
              持仓市值
            </th>
            <th class="font-semibold p-4 text-right">
              可用现金
            </th>
            <th class="font-semibold p-4 text-center w-24">
              AI
            </th>
            <th class="font-semibold p-4 text-right">
              操作
            </th>
          </tr>
        </thead>
        <!-- 表格 body -->
        <tbody>
          <tr v-for="user in users" :key="user.id" class="border-b transition-colors dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50">
            <td class="text-gray-500 font-mono p-4">
              {{ user.id }}
            </td>
            <td class="p-4">
              <div class="font-bold">
                {{ user.username }}
              </div>
              <div class="text-xs mt-1 flex gap-2 items-center">
                <span class="px-1.5 py-0.5 rounded" :class="user.role === 'admin' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'">
                  {{ user.role }}
                </span>
                <span class="text-gray-400">
                  {{ new Date(user.createdAt).toLocaleDateString() }}
                </span>
              </div>
            </td>

            <!-- [新增] 资产数据展示 -->
            <td class="font-bold font-mono p-4 text-right">
              {{ formatCurrency(user.totalAssets) }}
            </td>
            <td class="text-blue-600 font-mono p-4 text-right dark:text-blue-400">
              {{ formatCurrency(user.fundValue) }}
            </td>
            <td class="text-gray-600 font-mono p-4 text-right dark:text-gray-400">
              {{ formatCurrency(user.cash) }}
            </td>

            <td class="p-4 text-center">
              <button
                class="border-2 border-transparent rounded-full inline-flex flex-shrink-0 h-5 w-9 cursor-pointer transition-colors duration-200 ease-in-out relative focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
                :class="user.isAiAgent ? 'bg-primary' : 'bg-gray-200 dark:bg-gray-600'"
                @click="toggleUserAi(user)"
              >
                <span
                  class="rounded-full bg-white h-4 w-4 inline-block pointer-events-none ring-0 shadow transform transition duration-200 ease-in-out"
                  :class="user.isAiAgent ? 'translate-x-4' : 'translate-x-0'"
                />
              </button>
            </td>
            <td class="p-4 text-right">
              <div class="flex gap-2 items-center justify-end">
                <button class="text-sm icon-btn px-2 py-1 border rounded dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700" title="编辑信息/资金" @click="openEditModal(user)">
                  <div i-carbon-edit />
                </button>
                <button class="text-sm icon-btn px-2 py-1 border rounded dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700" title="重置密码" @click="openResetPwdModal(user.id)">
                  <div i-carbon-password />
                </button>
                <button class="text-sm icon-btn px-2 py-1 border rounded dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700" title="克隆此用户" @click="openCloneModal(user.id)">
                  <div i-carbon-copy-file />
                </button>
                <button class="text-sm icon-btn text-red-500 px-2 py-1 border border-red-200 rounded dark:border-red-900/50 hover:bg-red-50 dark:hover:bg-red-900/20" title="删除用户" @click="deleteUser(user)">
                  <div i-carbon-trash-can />
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
            v-model:ai-total-amount="editForm.aiTotalAmount"
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
  </div>
</template>
