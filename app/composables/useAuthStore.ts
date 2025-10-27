import type { UserPayload } from '~~/server/utils/auth'
import { acceptHMRUpdate, defineStore } from 'pinia'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<UserPayload | null>(null)
  const isLoadingUser = ref(false)

  const isAuthenticated = computed(() => !!user.value)
  const isAdmin = computed(() => user.value?.role === 'admin')

  async function login(credentials: { username: string, password: any }) {
    const data = await $fetch<{ user: UserPayload }>('/api/auth/login', {
      method: 'POST',
      body: credentials,
    })
    user.value = data.user
    await navigateTo('/')
  }

  async function fetchUser() {
    if (isLoadingUser.value || user.value)
      return

    isLoadingUser.value = true
    try {
      const headers = import.meta.server ? useRequestHeaders(['cookie']) : undefined
      user.value = await apiFetch<UserPayload>('/api/auth/me', { headers })
    }
    catch (e: any) {
      // [核心修改]
      // 只有在错误不是 401 时才清除用户状态。
      // 如果是 401，我们相信 apiFetch 拦截器会处理它。
      // ofetch 抛出的错误对象中包含 response 属性。
      if (e.response?.status !== 401) {
        console.error('Non-401 error during fetchUser, clearing session:', e)
        user.value = null
      }
      else {
        // 这是 401 错误，我们什么都不做，让拦截器完成它的工作。
        // 这个 log 可以在调试时打开，正常运行时可以注释掉。
        // console.log('Caught a 401 in fetchUser. Interceptor will handle it.')
      }
    }
    finally {
      isLoadingUser.value = false
    }
  }

  async function logout() {
    try {
      await $fetch('/api/auth/logout', { method: 'POST' })
    }
    catch (e) {
      console.error('Error during logout:', e)
    }
    finally {
      if (import.meta.client) {
        await navigateTo('/login', { replace: true })
      }
    }
  }

  return { user, isAuthenticated, isAdmin, login, fetchUser, logout }
})

if (import.meta.hot)
  import.meta.hot.accept(acceptHMRUpdate(useAuthStore, import.meta.hot))
