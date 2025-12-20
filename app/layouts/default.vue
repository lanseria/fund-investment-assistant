<script setup lang="ts">
const authStore = useAuthStore()
const { cycleTheme, currentTheme } = useTheme()
const colorMode = useColorMode()

// 下拉菜单状态控制
const isUserMenuOpen = ref(false)
const userMenuRef = ref(null)

// 点击外部关闭菜单
onClickOutside(userMenuRef, () => {
  isUserMenuOpen.value = false
})

function toggleDark() {
  colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark'
}

function handleLogout() {
  isUserMenuOpen.value = false
  authStore.logout()
}
</script>

<template>
  <main class="text-gray-800 font-sans bg-gray-50 min-h-screen dark:text-gray-200 dark:bg-gray-900">
    <!-- 简单的导航栏 -->
    <header class="p-4 bg-white flex shadow-sm items-center justify-between dark:bg-gray-800">
      <NuxtLink to="/" class="text-xl font-bold">
        基金助手
      </NuxtLink>
      <div v-if="authStore.isAuthenticated" class="flex gap-4 items-center">
        <NuxtLink to="/news" class="hover:text-primary-hover">
          市场情报
        </NuxtLink>
        <NuxtLink to="/charts-overview" class="hover:text-primary-hover">
          策略视图
        </NuxtLink>
        <NuxtLink to="/leaderboard" class="hover:text-primary-hover">
          排行榜
        </NuxtLink>
        <!-- 下拉菜单区域 -->
        <div ref="userMenuRef" class="relative">
          <button
            class="px-3 py-2 rounded-md flex gap-2 transition-colors items-center hover:bg-gray-100 dark:hover:bg-gray-700"
            @click="isUserMenuOpen = !isUserMenuOpen"
          >
            <span class="font-medium">欢迎, {{ authStore.user?.username }}</span>
            <div class="i-carbon-chevron-down text-xs transition-transform duration-200" :class="{ 'rotate-180': isUserMenuOpen }" />
          </button>

          <!-- 下拉菜单内容 -->
          <Transition name="fade">
            <div
              v-if="isUserMenuOpen"
              class="mt-2 border rounded-md bg-white min-w-56 shadow-lg right-0 top-full absolute z-50 dark:border-gray-700 dark:bg-gray-800"
            >
              <div class="py-1">
                <!-- 个人中心 -->
                <NuxtLink
                  to="/account"
                  class="text-sm px-4 py-2.5 text-left flex gap-3 w-full transition-colors items-center hover:bg-gray-100 dark:hover:bg-gray-700"
                  @click="isUserMenuOpen = false"
                >
                  <div i-carbon-user-avatar class="text-lg text-gray-500" />
                  <span>个人中心</span>
                </NuxtLink>

                <!-- 切换主题 -->
                <button
                  class="text-sm px-4 py-2.5 text-left flex gap-3 w-full transition-colors items-center hover:bg-gray-100 dark:hover:bg-gray-700"
                  @click="cycleTheme()"
                >
                  <div i-carbon-color-palette class="text-lg text-gray-500" />
                  <div class="flex flex-col">
                    <span>切换主题</span>
                    <span class="text-xs text-gray-400">{{ currentTheme.label }}</span>
                  </div>
                </button>

                <!-- 切换深色模式 -->
                <button
                  class="text-sm px-4 py-2.5 text-left flex gap-3 w-full transition-colors items-center hover:bg-gray-100 dark:hover:bg-gray-700"
                  @click="toggleDark()"
                >
                  <div class="i-carbon-sun dark:i-carbon-moon text-lg text-gray-500" />
                  <span>{{ colorMode.value === 'dark' ? '切换亮色' : '切换深色' }}</span>
                </button>

                <div class="my-1 border-t dark:border-gray-700" />

                <!-- 登出 -->
                <button
                  class="text-sm text-red-600 px-4 py-2.5 text-left flex gap-3 w-full transition-colors items-center dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                  @click="handleLogout()"
                >
                  <div i-carbon-logout class="text-lg" />
                  <span>退出登录</span>
                </button>
              </div>
            </div>
          </Transition>
        </div>
      </div>
    </header>
    <div class="mx-auto max-w-6xl">
      <slot />
    </div>
  </main>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(-5px);
}
</style>
