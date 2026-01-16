<!-- eslint-disable no-alert -->
<script setup lang="ts">
import { apiFetch } from '~/utils/api'

definePageMeta({
  layout: 'account',
})

const { data: users, pending, error, refresh } = useAsyncData('admin-users', () =>
  apiFetch<any[]>('/api/admin/users'))

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
  totalAssets: 0,
  isAiAgent: false,
  aiModel: '',
  aiTotalAmount: 100000,
  aiSystemPrompt: '',
})

// 重置密码相关
const isResetPwdModalOpen = ref(false)
const resetPwdUserId = ref<number | null>(null)
const newPassword = ref('')

// 打开编辑模态框
function openEditModal(user: any) {
  editingUserId.value = user.id
  // 填充数据
  editForm.username = user.username
  // 处理总资产回显
  editForm.totalAssets = user.totalAssets ? Number(user.totalAssets) : 0
  editForm.isAiAgent = user.isAiAgent || false
  editForm.aiModel = user.aiModel || 'xiaomi/mimo-v2-flash:free'
  editForm.aiTotalAmount = user.aiTotalAmount ? Number(user.aiTotalAmount) : 100000
  editForm.aiSystemPrompt = user.aiSystemPrompt || ''

  isEditModalOpen.value = true
}

// 打开重置密码模态框
function openResetPwdModal(userId: number) {
  resetPwdUserId.value = userId
  newPassword.value = '' // 清空输入
  isResetPwdModalOpen.value = true
}

// 提交重置密码
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

// 提交编辑
async function handleEditUser() {
  if (!editingUserId.value)
    return
  isSubmitting.value = true
  try {
    await apiFetch(`/api/admin/users/${editingUserId.value}`, {
      method: 'PUT',
      body: {
        username: editForm.username,
        totalAssets: editForm.totalAssets,
        isAiAgent: editForm.isAiAgent,
        aiModel: editForm.aiModel,
        aiTotalAmount: editForm.aiTotalAmount,
        aiSystemPrompt: editForm.aiSystemPrompt || null,
      },
    })
    isEditModalOpen.value = false
    await refresh() // 刷新列表
    alert('用户信息修改成功')
  }
  catch (err: any) {
    alert(`修改失败: ${err.data?.statusMessage || '未知错误'}`)
  }
  finally {
    isSubmitting.value = false
  }
}

// 处理表单提交的函数
async function handleAddUser(formData: any) {
  isSubmitting.value = true
  try {
    await apiFetch('/api/admin/users', {
      method: 'POST',
      body: formData,
    })
    isAddModalOpen.value = false // 关闭模态框
    await refresh() // 刷新用户列表
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

// 切换 AI 状态
async function toggleUserAi(user: any) {
  const newState = !user.isAiAgent
  // 乐观更新 UI
  user.isAiAgent = newState

  try {
    await apiFetch(`/api/admin/users/${user.id}`, {
      method: 'PUT',
      body: { isAiAgent: newState },
    })
  }
  catch (e: any) {
    // 失败回滚
    user.isAiAgent = !newState
    alert(`更新失败: ${e.data?.statusMessage || '未知错误'}`)
  }
}

// 删除用户
async function deleteUser(user: any) {
  if (!confirm(`⚠️ 危险操作：确定要删除用户 "${user.username}" 吗？\n此操作将同时删除该用户的所有持仓记录且不可恢复！`)) {
    return
  }

  try {
    await apiFetch(`/api/admin/users/${user.id}`, { method: 'DELETE' })
    await refresh() // 刷新列表
  }
  catch (e: any) {
    alert(`删除失败: ${e.data?.statusMessage || '未知错误'}`)
  }
}

// 打开克隆模态框
function openCloneModal(userId: number) {
  cloneSourceId.value = userId
  cloneNewUsername.value = ''
  isCloneModalOpen.value = true
}

// 处理克隆提交
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
      <table class="text-left w-full">
        <!-- 表格 aheader -->
        <thead class="border-b bg-gray-50 dark:border-gray-700 dark:bg-gray-700/50">
          <tr>
            <th class="p-4">
              ID
            </th>
            <th class="p-4">
              用户名
            </th>
            <th class="p-4">
              角色
            </th>
            <th class="p-4">
              AI 代理
            </th>
            <th class="p-4">
              创建时间
            </th>
            <th class="p-4 text-right">
              操作
            </th>
          </tr>
        </thead>
        <!-- 表格 body -->
        <tbody>
          <tr v-for="user in users" :key="user.id" class="border-t dark:border-gray-700">
            <td class="p-4">
              {{ user.id }}
            </td>
            <td class="p-4">
              {{ user.username }}
            </td>
            <td class="p-4">
              <span class="text-xs px-2 py-1 rounded" :class="user.role === 'admin' ? 'bg-purple-100 text-purple-800' : 'bg-gray-100 text-gray-800'">
                {{ user.role }}
              </span>
            </td>
            <td class="p-4">
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
            <td class="p-4">
              {{ new Date(user.createdAt).toLocaleString() }}
            </td>
            <td class="p-4 text-right">
              <div class="flex gap-2 items-center justify-end">
                <button class="text-sm icon-btn px-2 py-1 border rounded dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700" title="编辑用户名" @click="openEditModal(user)">
                  <div i-carbon-edit />
                </button>
                <button class="text-sm icon-btn px-2 py-1 border rounded dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700" title="重置密码" @click="openResetPwdModal(user.id)">
                  <div i-carbon-password />
                </button>
                <button class="text-sm icon-btn px-2 py-1 border rounded dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700" title="克隆此用户及其持仓" @click="openCloneModal(user.id)">
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

    <!-- 添加用户的模态框 -->
    <Modal v-model="isAddModalOpen" title="添加新用户">
      <AddUserForm v-if="isAddModalOpen" @submit="handleAddUser" @cancel="isAddModalOpen = false" />
    </Modal>

    <!-- 克隆用户模态框 -->
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

    <!-- 重置密码模态框 -->
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
            <p class="text-xs text-gray-400 mt-1">
              建议使用随机强密码。
            </p>
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

    <!-- 编辑用户模态框 -->
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

          <!-- 总资产编辑 -->
          <div>
            <label class="text-sm font-medium mb-1 block">总资产 (Total Equity)</label>
            <div class="relative">
              <span class="text-gray-500 left-3 top-2 absolute">¥</span>
              <input
                v-model.number="editForm.totalAssets"
                type="number"
                step="0.01"
                class="input-base pl-7"
                placeholder="0.00"
              >
            </div>
            <p class="text-xs text-gray-400 mt-1">
              用户的真实账户权益（包含持仓市值和现金余额），用于收益率计算基准。
            </p>
          </div>

          <!-- 嵌入 AI 设置组件 (Form Mode) -->
          <AiSettingsPanel
            v-model:is-ai-agent="editForm.isAiAgent"
            v-model:ai-model="editForm.aiModel"
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
