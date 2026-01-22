// app/middleware/auth.global.ts
const publicPages = ['/login']

export default defineNuxtRouteMiddleware(async (to) => {
  if (publicPages.includes(to.path))
    return

  const authStore = useAuthStore()

  // 1. 如果状态中没有用户信息，尝试从服务端拉取（利用 Cookie 恢复会话）
  if (!authStore.isAuthenticated) {
    await authStore.fetchUser()
  }

  // 2. 拉取后再次检查，如果仍然未认证，说明 Session 无效或已过期，跳转登录
  if (!authStore.isAuthenticated) {
    return navigateTo('/login', { replace: true })
  }
})
