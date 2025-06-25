<script setup lang="ts">
const authStore = useAuthStore()
</script>

<template>
  <main class="text-gray-800 font-sans bg-gray-50 min-h-screen dark:text-gray-200 dark:bg-gray-900">
    <!-- [新增] 简单的导航栏 -->
    <header class="p-4 bg-white flex shadow-sm items-center justify-between dark:bg-gray-800">
      <NuxtLink to="/" class="text-xl font-bold">
        基金助手
      </NuxtLink>
      <div v-if="authStore.isAuthenticated" class="flex gap-4 items-center">
        <NuxtLink v-if="authStore.isAdmin" to="/admin/users" class="hover:text-teal-500">
          用户管理
        </NuxtLink>
        <span>欢迎, {{ authStore.user?.username }}</span>
        <DarkToggle />
        <button class="icon-btn" title="登出" @click="authStore.logout()">
          <div i-carbon-logout />
        </button>
      </div>
    </header>
    <div class="mx-auto max-w-5xl">
      <slot />
    </div>
  </main>
</template>
