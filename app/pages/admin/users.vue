<script setup lang="ts">
import { apiFetch } from '~/utils/api'

const { data: users, pending, error } = useAsyncData('admin-users', () =>
  apiFetch<any[]>('/api/admin/users'))
</script>

<template>
  <div class="p-4 lg:p-8 sm:p-6">
    <h1 class="text-2xl font-bold mb-4">
      用户管理
    </h1>
    <div v-if="pending">
      加载中...
    </div>
    <div v-else-if="error" class="text-red-500">
      加载失败: {{ error.message }}
    </div>
    <div v-else class="card overflow-hidden">
      <table class="text-left w-full">
        <thead>
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
  </div>
</template>
