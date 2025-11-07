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
const isSubmitting = ref(false)

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
              创建时间
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
              {{ user.role }}
            </td>
            <td class="p-4">
              {{ new Date(user.createdAt).toLocaleString() }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 添加用户的模态框 -->
    <Modal v-model="isAddModalOpen" title="添加新用户">
      <AddUserForm v-if="isAddModalOpen" @submit="handleAddUser" @cancel="isAddModalOpen = false" />
    </Modal>
  </div>
</template>
