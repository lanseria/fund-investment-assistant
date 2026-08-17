// 1. 显式导入 ofetch，替代全局的 $fetch 避免 ReferenceError
import type { FetchOptions, FetchRequest, MappedResponseType, ResponseType } from 'ofetch'
import { ofetch } from 'ofetch'

let refreshTokenPromise: Promise<unknown> | null = null

const baseFetch = ofetch.create({})

/**
 * 刷新会话(全局去重:并发 401 只触发一次刷新请求)。
 * 刷新失败时登出用户并向上抛出错误。
 */
async function refreshSession(): Promise<unknown> {
  if (!refreshTokenPromise) {
    refreshTokenPromise = ofetch('/api/auth/refresh', {
      method: 'POST',
    }).catch(async (e) => {
      console.warn('Could not refresh token. User will be logged out.')
      const authStore = useAuthStore()
      await authStore.logout()
      return Promise.reject(e)
    }).finally(() => {
      refreshTokenPromise = null
    })
  }
  return refreshTokenPromise
}

async function apiFetchInner<T, R extends ResponseType>(
  request: FetchRequest,
  options: FetchOptions<R>,
  allowRetry: boolean,
): Promise<MappedResponseType<R, T>> {
  try {
    return await baseFetch<T, R>(request, options)
  }
  catch (error: any) {
    const status = error?.response?.status ?? error?.status ?? error?.statusCode
    // 登录/刷新/登出自身的 401 属于正常业务结果(如密码错误),不做刷新重试
    const isAuthRoute = String(request).includes('/api/auth/')
    if (status !== 401 || isAuthRoute || !allowRetry)
      throw error

    try {
      await refreshSession()
    }
    catch {
      // 刷新失败(已登出):抛出原始 401
      throw error
    }

    // 重试原请求:完整携带 method/body/params/headers 等原始配置。
    // allowRetry=false 保证只重试一次,避免"刷新成功但依旧 401"时无限循环。
    return await apiFetchInner<T, R>(request, options, false)
  }
}

/**
 * 带 401 自动刷新重试的请求封装(签名与原生 $fetch 一致,保持调用点的类型推断)。
 *
 * [注意] 不能用 ofetch 的 onResponseError 钩子实现重试:ofetch 会忽略钩子的
 * 返回值,重试结果无法替换原响应,调用方仍会收到原始的 401 错误。
 * 因此这里在外层捕获 401 后重试,并完整携带原始请求配置。
 */
export function apiFetch<T = any, R extends ResponseType = 'json'>(
  request: FetchRequest,
  options?: FetchOptions<R>,
): Promise<MappedResponseType<R, T>> {
  return apiFetchInner<T, R>(request, options ?? {}, true)
}
