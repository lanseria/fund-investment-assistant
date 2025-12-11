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
      if (e.response?.status !== 401) {
        console.error('Non-401 error during fetchUser, clearing session:', e)
        user.value = null
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
