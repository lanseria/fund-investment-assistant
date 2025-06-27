const publicPages = ['/login']

export default defineNuxtRouteMiddleware(async (to) => {
  const authStore = useAuthStore()

  // 如果是公开页面，则跳过检查
  if (publicPages.includes(to.path))
    return

  // 如果 store 中没有用户信息，但有 token，则尝试获取用户信息
  if (!authStore.isAuthenticated && useLocalStorage('auth-token', null).value)
    await authStore.fetchUser()
})
