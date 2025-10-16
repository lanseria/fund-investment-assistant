<script setup lang="ts">
const authStore = useAuthStore()
const { cycleTheme, currentTheme } = useTheme()
</script>

<template>
  <main class="text-gray-800 font-sans bg-gray-50 min-h-screen dark:text-gray-200 dark:bg-gray-900">
    <!-- [新增] 简单的导航栏 -->
    <header class="p-4 bg-white flex shadow-sm items-center justify-between dark:bg-gray-800">
      <NuxtLink to="/" class="text-xl font-bold">
        基金助手
      </NuxtLink>
      <div v-if="authStore.isAuthenticated" class="flex gap-4 items-center">
        <NuxtLink to="/leaderboard" class="hover:text-primary-hover">
          排行榜
        </NuxtLink>
        <NuxtLink v-if="authStore.isAdmin" to="/admin/users" class="hover:text-primary-hover">
          用户管理
        </NuxtLink>
        <span>欢迎, {{ authStore.user?.username }}</span>
        <button class="icon-btn" :title="`切换主题: ${currentTheme.label}`" @click="cycleTheme()">
          <div i-carbon-color-palette />
        </button>
        <DarkToggle />
        <button class="icon-btn" title="登出" @click="authStore.logout()">
          <div i-carbon-logout />
        </button>
      </div>
    </header>
    <div class="mx-auto max-w-6xl">
      <slot />
    </div>
  </main>
</template>
