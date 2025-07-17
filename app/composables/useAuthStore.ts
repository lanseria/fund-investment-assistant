// app/composables/useAuthStore.ts
import type { UserPayload } from '~~/server/utils/auth'
import { acceptHMRUpdate, defineStore } from 'pinia'
// [移除] apiFetch 不再需要从这里导入，因为它现在是全局的

export const useAuthStore = defineStore('auth', () => {
  const user = ref<UserPayload | null>(null)

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
    // 只有在 store 中没有用户信息时才发起请求
    if (user.value)
      return

    try {
      user.value = await apiFetch<UserPayload>('/api/auth/me')
    }
    // eslint-disable-next-line unused-imports/no-unused-vars
    catch (e: any) {
      // [核心修改] 将 console.error 改为 console.log 或直接移除
      // 这是一个预期的行为（用户未登录或会话过期），不应作为错误抛出。
      // 我们可以打印一条信息性的日志，方便调试。
      // eslint-disable-next-line no-console
      console.log('User session not found or expired. User remains unauthenticated.')
      user.value = null // 确保用户状态被清理

      // [重要] 不再向上抛出错误，因为我们已经处理了它
      // throw e; // <--- 移除这一行
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
