// 1. 显式导入 ofetch，替代全局的 $fetch 避免 ReferenceError
import { ofetch } from 'ofetch'

let refreshTokenPromise: Promise<any> | null = null

export const apiFetch = ofetch.create({
  // 如果需要全局 baseURL 可以在这里配置
  // baseURL: 'https://api.example.com',

  async onResponseError({ request, response }) {
    if (response.status === 401 && !String(request).includes('/api/auth/refresh')) {
      const authStore = useAuthStore()

      if (!refreshTokenPromise) {
        // 刷新 Token 的请求也要用 ofetch
        refreshTokenPromise = ofetch('/api/auth/refresh', {
          method: 'POST',
        }).catch(async (e) => {
          console.warn('Could not refresh token. User will be logged out.')
          await authStore.logout()
          return Promise.reject(e)
        }).finally(() => {
          refreshTokenPromise = null
        })
      }

      try {
        await refreshTokenPromise
        // 重新发起原请求时，必须带上 options！
        // 否则原请求的 body 参数、headers (比如刚刚更新的 Token) 都会丢失
        return ofetch(request)
      }
      catch (e) {
        return Promise.reject(e)
      }
    }
  },
})
