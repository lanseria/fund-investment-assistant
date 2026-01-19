let refreshTokenPromise: Promise<any> | null = null

export const apiFetch = $fetch.create({
  onRequest({ options }) {
    // 自动注入 CSRF 令牌
    if (import.meta.client) {
      const { csrf } = useCsrf()
      options.headers = new Headers(options.headers)
      if (csrf) {
        options.headers.set('csrf-token', csrf)
      }
    }
  },
  async onResponseError({ request, response }) {
    if (response.status === 401 && !String(request).includes('/api/auth/refresh')) {
      const authStore = useAuthStore()

      if (!refreshTokenPromise) {
        refreshTokenPromise = $fetch('/api/auth/refresh', {
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
        // 使用类型断言解决 TypeScript 类型问题
        return $fetch(request)
      }
      catch (e) {
        return Promise.reject(e)
      }
    }
  },
})
