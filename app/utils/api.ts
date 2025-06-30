export const apiFetch = $fetch.create({
  onRequest({ options }) {
    // 从 Cookie 获取 token
    const accessToken = useLocalStorage('auth-token', null).value
    if (accessToken) {
      // 使用 .set() 方法安全地添加或更新 Authorization 头
      // 这样可以避免覆盖掉 ofetch 自动添加的其他头信息
      const headers = new Headers(options.headers)
      headers.set('Authorization', `Bearer ${accessToken}`)
      options.headers = headers
    }
  },
  async onResponseError({ response }) {
    // 如果需要，可以在这里处理全局的 401 错误，例如跳转到登录页
    if (response.status === 401) {
      console.error('API request unauthorized. Logging out.')
      // [重要] 确保只在客户端执行跳转相关的操作
      if (import.meta.client) {
        const authStore = useAuthStore()
        // authStore.logout() 内部会处理跳转
        await authStore.logout()
      }
    }
  },
})
