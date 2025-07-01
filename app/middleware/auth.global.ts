const publicPages = ['/login']

export default defineNuxtRouteMiddleware(async (to) => {
  const authStore = useAuthStore()
  const authToken = useCookie('auth-token')

  // 如果是公开页面，则跳过检查
  if (publicPages.includes(to.path))
    return

  // 服务端和客户端现在都能正确读取 authToken.value
  if (!authStore.isAuthenticated && authToken.value)
    await authStore.fetchUser()

  // 再次检查认证状态，如果 fetchUser 失败或根本没有 token，则跳转
  if (!authStore.isAuthenticated) {
    // 确保只在需要跳转时才跳转，避免循环重定向
    if (to.path !== '/login')
      return navigateTo('/login', { replace: true })
  }
})
