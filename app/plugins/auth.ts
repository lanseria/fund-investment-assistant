// app/plugins/auth.ts

export default defineNuxtPlugin(async () => {
  const authStore = useAuthStore()

  // 只有在 store 中没有用户信息时（通常是首次加载），才执行此操作
  // 这可以防止在客户端导航时重复调用
  if (!authStore.isAuthenticated) {
    // 使用 await 等待 fetchUser 完成
    // 这将阻塞应用的进一步初始化，直到用户信息被获取或确认不存在
    // 从而确保在任何中间件或页面逻辑运行前，认证状态是确定的
    await authStore.fetchUser()
  }
})
