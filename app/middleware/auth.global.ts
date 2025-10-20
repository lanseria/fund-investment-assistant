// app/middleware/auth.global.ts
const publicPages = ['/login']

export default defineNuxtRouteMiddleware((to) => {
  // 如果是公开页面，则跳过检查
  if (publicPages.includes(to.path))
    return

  const authStore = useAuthStore()

  // 此时，app/plugins/auth.ts 已经运行完毕
  // 所以 authStore.isAuthenticated 的状态已经是最终、可靠的状态了
  // 我们不再需要在这里调用 fetchUser()，只需要同步检查即可

  if (!authStore.isAuthenticated) {
    // 如果插件运行后用户依然未认证，且目标页面不是登录页，则跳转
    return navigateTo('/login', { replace: true })
  }
})
