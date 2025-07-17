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
      // 当在服务端执行时，手动转发 cookie
      const headers = import.meta.server
        ? useRequestHeaders(['cookie']) // 从浏览器请求中提取 cookie 头
        : undefined // 在客户端，浏览器会自动处理 cookie，所以不需要

      user.value = await apiFetch<UserPayload>('/api/auth/me', {
        // 将提取的 headers 附加到 API 请求中
        headers,
      })
    }
    // eslint-disable-next-line unused-imports/no-unused-vars
    catch (e: any) {
      // 这是一个预期的行为（用户未登录或会话过期），不应作为错误抛出。
      // eslint-disable-next-line no-console
      console.log('User session not found or expired. User remains unauthenticated.')
      user.value = null // 确保用户状态被清理
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
