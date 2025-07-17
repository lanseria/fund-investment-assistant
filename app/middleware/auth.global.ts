// app/middleware/auth.global.ts
const publicPages = ['/login']

export default defineNuxtRouteMiddleware(async (to) => {
  // 如果是公开页面，则跳过检查
  if (publicPages.includes(to.path))
    return

  const authStore = useAuthStore()

  // 如果 store 中没有用户信息，则尝试获取
  // fetchUser 会利用浏览器自动发送的 cookie 来验证会话
  if (!authStore.isAuthenticated) {
    await authStore.fetchUser()
  }

  // 再次检查认证状态，如果 fetchUser 失败，则跳转
  if (!authStore.isAuthenticated) {
    if (to.path !== '/login')
      return navigateTo('/login', { replace: true })
  }
})
