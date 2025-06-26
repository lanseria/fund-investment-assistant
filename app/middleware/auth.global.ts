const publicPages = ['/login']

export default defineNuxtRouteMiddleware(async (to) => {
  const authStore = useAuthStore()

  // 如果是公开页面，则跳过检查
  if (publicPages.includes(to.path))
    return

  // 如果 store 中没有用户信息，但有 token，则尝试获取用户信息
  if (!authStore.isAuthenticated && useLocalStorage('auth-token', null).value)
    await authStore.fetchUser()

  // 如果在获取后仍然未认证，则重定向到登录页
  if (!authStore.isAuthenticated) {
    console.warn('Redirecting to login, user not authenticated.')
    return navigateTo('/login')
  }
})
