// app/middleware/auth.global.ts
const publicPages = ['/login']

export default defineNuxtRouteMiddleware(async (to) => {
  if (publicPages.includes(to.path))
    return

  const authStore = useAuthStore()

  if (!authStore.isAuthenticated) {
    // 如果插件运行后用户依然未认证，且目标页面不是登录页，则跳转
    return navigateTo('/login', { replace: true })
  }
  else {
    await authStore.fetchUser()
    if (!authStore.user) {
      return navigateTo('/login', { replace: true })
    }
  }
})
