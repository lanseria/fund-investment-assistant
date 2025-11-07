<script setup lang="ts">
definePageMeta({
  layout: 'account',
})

const authStore = useAuthStore()
</script>

<template>
  <div>
    <h1 class="text-2xl font-bold mb-4">
      个人信息
    </h1>
    <div v-if="authStore.user" class="space-y-3">
      <div class="flex items-center">
        <span class="text-gray-500 w-24">用户名:</span>
        <span class="font-semibold">{{ authStore.user.username }}</span>
      </div>
      <div class="flex items-center">
        <span class="text-gray-500 w-24">角色:</span>
        <span class="text-xs px-2 py-1 rounded-full" :class="authStore.isAdmin ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'">
          {{ authStore.user.role }}
        </span>
      </div>
      <div class="flex items-center">
        <span class="text-gray-500 w-24">用户 ID:</span>
        <span class="font-mono">{{ authStore.user.id }}</span>
      </div>
    </div>
  </div>
</template>
