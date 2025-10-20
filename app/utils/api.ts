let refreshTokenPromise: Promise<any> | null = null

export const apiFetch = $fetch.create({
  async onResponseError({ request, response }) {
    // 只处理 401 错误，并且确保不是对 refresh 接口的请求本身失败
    if (response.status === 401 && !String(request).includes('/api/auth/refresh')) {
      const authStore = useAuthStore()

      // 如果没有正在进行的刷新，则发起新的刷新请求
      if (!refreshTokenPromise) {
        refreshTokenPromise = $fetch('/api/auth/refresh', {
          method: 'POST',
          // 在客户端，$fetch 会自动发送 cookie。
          // 在服务器端，Nuxt 3.3+ 版本的 ofetch 也会自动转发同站 cookie。
          // 如果使用的是旧版本，则需要在调用处手动传递 headers。
        }).catch(async (e) => {
          console.warn('Could not refresh token. User will be logged out.')
          await authStore.logout()
          return Promise.reject(e)
        }).finally(() => {
          // 无论成功失败，重置 promise
          refreshTokenPromise = null
        })
      }

      try {
        // 等待刷新完成
        await refreshTokenPromise

        // 刷新成功后，cookie 已经被服务器更新
        // 使用 $fetch 重新发起原始请求
        // 浏览器(或服务器)会自动带上新的 auth-token cookie
        return $fetch(request)
      }
      catch (e) {
        // 如果刷新请求本身失败了，或者重试请求再次失败，则不再处理
        // 错误会向上冒泡
        return Promise.reject(e)
      }
    }
  },
})
