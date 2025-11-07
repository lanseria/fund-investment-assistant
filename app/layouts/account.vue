<script setup lang="ts">
const authStore = useAuthStore()
const { cycleTheme, currentTheme } = useTheme()

const menuItems = computed(() => [
  { to: '/account/personal-info', icon: 'i-carbon-user-avatar', label: '个人信息', admin: false },
  { to: '/account/users', icon: 'i-carbon-group-account', label: '用户管理', admin: true },
  { to: '/account/dictionaries', icon: 'i-carbon-book', label: '字典管理', admin: true },
])
</script>

<template>
  <main class="text-gray-800 font-sans bg-gray-50 min-h-screen dark:text-gray-200 dark:bg-gray-900">
    <!-- 顶栏 -->
    <header class="p-4 bg-white flex shadow-sm items-center top-0 justify-between sticky z-10 dark:bg-gray-800">
      <NuxtLink to="/" class="flex gap-2 items-center">
        <div i-carbon-arrow-left />
        <span class="text-lg font-bold">返回主页</span>
      </NuxtLink>
      <div class="flex gap-4 items-center">
        <span>{{ authStore.user?.username }}</span>
        <button class="icon-btn" :title="`切换主题: ${currentTheme.label}`" @click="cycleTheme()">
          <div i-carbon-color-palette />
        </button>
        <DarkToggle />
        <button class="icon-btn" title="登出" @click="authStore.logout()">
          <div i-carbon-logout />
        </button>
      </div>
    </header>

    <!-- 主体内容 -->
    <div class="p-4 flex flex-col gap-8 lg:p-8 sm:p-6 md:flex-row">
      <!-- 侧边栏 -->
      <aside class="flex-shrink-0 md:w-56">
        <nav class="space-y-2">
          <template v-for="item in menuItems" :key="item.to">
            <NuxtLink
              v-if="!item.admin || authStore.isAdmin"
              :to="item.to"
              class="p-3 rounded-md flex gap-3 transition-colors items-center"
              active-class="bg-primary/10 text-primary font-semibold"
              hover="bg-gray-200 dark:bg-gray-700"
            >
              <div :class="item.icon" class="text-xl" />
              <span>{{ item.label }}</span>
            </NuxtLink>
          </template>
        </nav>
      </aside>

      <!-- 内容区域 -->
      <div class="p-6 card flex-grow">
        <slot />
      </div>
    </div>
  </main>
</template>
