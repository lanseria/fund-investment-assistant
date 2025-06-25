import { ofetch } from 'ofetch'

export const apiFetch = ofetch.create({
  onRequest({ options }) {
    // 从 Cookie 获取 token
    const accessToken = useCookie('auth-token').value
    if (accessToken) {
      options.headers = {
        ...options.headers,
        // 注意：这里我们不再需要手动添加 'Bearer ' 前缀
        // 因为 ofetch 会处理好
        Authorization: `Bearer ${accessToken}`,
      }
    }
  },
  async onResponseError({ response }) {
    // 如果需要，可以在这里处理全局的 401 错误，例如跳转到登录页
    if (response.status === 401) {
      console.error('API request unauthorized. Redirecting to login might be needed here.')
      // const authStore = useAuthStore()
      // authStore.logout()
    }
  },
})
