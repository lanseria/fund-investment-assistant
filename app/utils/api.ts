// 用一个变量来防止无限循环的刷新请求
let isRefreshing = false
const refreshSubscribers: ((accessToken: string) => void)[] = []

function subscribeToRefresh(cb: (accessToken: string) => void) {
  refreshSubscribers.push(cb)
}

function onRefreshed(accessToken: string) {
  refreshSubscribers.forEach(cb => cb(accessToken))
  // 清空订阅者
  refreshSubscribers.length = 0
}

export const apiFetch = $fetch.create({
  async onRequest({ options }) {
    const accessToken = useCookie('auth-token').value
    if (accessToken) {
      const headers = new Headers(options.headers)
      headers.set('Authorization', `Bearer ${accessToken}`)
      options.headers = headers
    }
  },

  async onResponseError({ request, response, options }) {
    // 只处理 401 错误，并且确保不是因为刷新 token 本身失败导致的 401
    // `request` 可以是 string 或 Request 对象
    const requestUrl = typeof request === 'string' ? request : request.url
    if (response.status === 401 && !requestUrl.includes('/api/auth/refresh')) {
      const authStore = useAuthStore()

      if (!isRefreshing) {
        isRefreshing = true
        const refreshToken = useCookie('auth-refresh-token')

        if (!refreshToken.value) {
          // 没有 refresh token，直接登出
          isRefreshing = false
          return authStore.logout()
        }

        try {
          // 尝试获取新的 access token
          const data = await $fetch<{ accessToken: string }>('/api/auth/refresh', {
            method: 'POST',
            body: { refreshToken: refreshToken.value },
          })

          // 更新 access token
          const newAccessToken = data.accessToken
          useCookie('auth-token').value = newAccessToken

          // 通知所有等待的请求
          onRefreshed(newAccessToken)
        }
        catch (e) {
          console.error('Failed to refresh token, logging out.', e)
          await authStore.logout()
          // 抛出原始错误，以便调用者知道请求最终失败了
          throw e
        }
        finally {
          isRefreshing = false
        }
      }

      // 如果正在刷新，则将原始请求挂起，等待刷新完成后用新的 token 重试
      return new Promise((resolve) => {
        subscribeToRefresh((newAccessToken) => {
          // 更新请求头
          const newHeaders = new Headers(options.headers)
          newHeaders.set('Authorization', `Bearer ${newAccessToken}`)

          // 使用 ofetch 重新发起原始请求
          // 明确传递请求的 URL 和方法，以满足类型要求
          resolve($fetch(requestUrl, {
            ...options,
            method: options.method?.toUpperCase() as any,
            headers: newHeaders,
          })) as any // <--- [修改点] 在这里添加 as any
        })
      })
    }
  },
})
