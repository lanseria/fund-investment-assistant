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
const isCloneModalOpen = ref(false) // [新增] 克隆模态框
const isSubmitting = ref(false)
const cloneSourceId = ref<number | null>(null) // [新增] 克隆源ID
const cloneNewUsername = ref('') // [新增] 新用户名

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

// [新增] 打开克隆模态框
function openCloneModal(userId: number) {
  cloneSourceId.value = userId
  cloneNewUsername.value = ''
  isCloneModalOpen.value = true
}

// [新增] 处理克隆提交
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
              <span v-if="user.isAiAgent" class="text-xs text-blue-700 font-medium px-2 py-1 rounded-full bg-blue-100">
                已启用
              </span>
              <span v-else class="text-xs text-gray-400">
                关闭
              </span>
            </td>
            <td class="p-4">
              {{ new Date(user.createdAt).toLocaleString() }}
            </td>
            <td class="p-4 text-right">
              <button class="text-sm icon-btn px-2 py-1 border rounded flex items-center dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700" title="克隆此用户及其持仓" @click="openCloneModal(user.id)">
                <div i-carbon-copy-file mr-1 /> 克隆
              </button>
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
  </div>
</template>
