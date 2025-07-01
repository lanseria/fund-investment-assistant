import type { UserPayload } from '~~/server/utils/auth'
import { acceptHMRUpdate, defineStore } from 'pinia'
import { apiFetch } from '~/utils/api'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<UserPayload | null>(null)
  const accessToken = useCookie<string | null>('auth-token', { maxAge: 60 * 60 * 24 }) // 设置1天过期
  const refreshToken = useCookie<string | null>('auth-refresh-token', { maxAge: 60 * 60 * 24 * 7 }) // 设置7天过期

  const isAuthenticated = computed(() => !!user.value)
  const isAdmin = computed(() => user.value?.role === 'admin')

  async function login(credentials: { username: string, password: any }) {
    const data = await $fetch<{ accessToken: string, refreshToken: string, user: UserPayload }>('/api/auth/login', {
      method: 'POST',
      body: credentials,
    })
    accessToken.value = data.accessToken
    refreshToken.value = data.refreshToken
    user.value = data.user
    await navigateTo('/')
  }

  async function fetchUser() {
    if (accessToken.value) {
      try {
        user.value = await apiFetch<UserPayload>('/api/auth/me')
      }
      catch (e) {
        console.error('Failed to fetch user, logging out.', e)
        await logout()
      }
    }
  }

  async function logout() {
    user.value = null
    accessToken.value = null
    refreshToken.value = null
    await navigateTo('/login')
  }

  return { user, isAuthenticated, isAdmin, login, fetchUser, logout }
})

if (import.meta.hot)
  import.meta.hot.accept(acceptHMRUpdate(useAuthStore, import.meta.hot))
