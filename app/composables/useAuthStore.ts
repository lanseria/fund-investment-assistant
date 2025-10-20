// app/composables/useAuthStore.ts
import type { UserPayload } from '~~/server/utils/auth'
import { acceptHMRUpdate, defineStore } from 'pinia'
// [移除] apiFetch 不再需要从这里导入，因为它现在是全局的

export const useAuthStore = defineStore('auth', () => {
  const user = ref<UserPayload | null>(null)
  // [新增] 添加一个状态来跟踪 fetchUser 是否正在进行中
  const isLoadingUser = ref(false)

  const isAuthenticated = computed(() => !!user.value)
  const isAdmin = computed(() => user.value?.role === 'admin')

  async function login(credentials: { username: string, password: any }) {
    const data = await $fetch<{ user: UserPayload }>('/api/auth/login', {
      method: 'POST',
      body: credentials,
    })
    // Cookies 由服务器设置
    user.value = data.user
    await navigateTo('/')
  }

  async function fetchUser() {
    // 如果已经在获取用户，或者已经获取过了，则直接返回
    if (isLoadingUser.value || user.value)
      return

    isLoadingUser.value = true
    try {
      const headers = import.meta.server ? useRequestHeaders(['cookie']) : undefined
      user.value = await apiFetch<UserPayload>('/api/auth/me', { headers })
    }
    catch (e: any) {
      console.error('User session not found or expired. User remains unauthenticated.')
      console.error(e)
      user.value = null
    }
    finally {
      // 无论成功失败，都标记为加载完成
      isLoadingUser.value = false
    }
  }

  async function logout() {
    // 调用后端的登出接口来清除 httpOnly cookie
    try {
      await $fetch('/api/auth/logout', { method: 'POST' })
    }
    catch (e) {
      console.error('Error during logout:', e)
    }
    finally {
      // [核心修改] 使用 client 判断，确保 navigateTo 只在客户端执行
      if (import.meta.client) {
        // 使用 replace: true 来避免用户通过后退按钮回到需要认证的页面
        await navigateTo('/login', { replace: true })
      }
    }
  }

  return { user, isAuthenticated, isAdmin, login, fetchUser, logout }
})

if (import.meta.hot)
  import.meta.hot.accept(acceptHMRUpdate(useAuthStore, import.meta.hot))
