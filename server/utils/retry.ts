/**
 * 判断错误是否值得重试。
 * - 网络层错误(连接重置/超时/Socket 挂起)→ 可重试
 * - HTTP 429(限流)/ 5xx(服务端错误)→ 可重试(OpenAI SDK 内部已部分处理,但兜底)
 * - 业务错误(JSON 解析失败、Zod 校验失败)→ 可重试(可能是模型偶发输出异常)
 * - 配置错误(无 API Key、用户未配置 prompt)→ 不可重试
 */
export function isRetryableError(error: any): boolean {
  // OpenAI SDK 的 APIError:类型 + status
  const status = error?.status ?? error?.response?.status
  if (status === 429 || (status >= 500 && status < 600))
    return true

  // 网络层错误(无 status,通常是连接级故障)
  if (!status) {
    const msg = String(error?.message || error?.cause?.message || '')
    if (/timeout|ECONNRESET|ENOTFOUND|EAI_AGAIN|socket hang up|fetch failed|ETIMEDOUT|connect ETIMEDOUT/i.test(msg))
      return true
    // 模型偶发输出异常(JSON 解析/Zod 校验),重试有机会拿到正常输出
    if (error instanceof SyntaxError)
      return true
    if (error?.name === 'ZodError')
      return true
  }

  return false
}

/** 毫秒级 sleep */
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/**
 * 通用指数退避重试封装。
 * - 覆盖网络抖动、限流(429)、服务端错误(5xx)、偶发格式错误等可重试场景。
 * - 总尝试次数 = maxRetries + 1(首次 + 重试次数)。
 * - 退避:baseDelay × 2^attempt + 随机抖动(避免多个客户端同时重试引发雪崩)。
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: { maxRetries?: number, baseDelayMs?: number, onRetry?: (attempt: number, error: any, delay: number) => void } = {},
): Promise<T> {
  const { maxRetries = 2, baseDelayMs = 2000, onRetry } = options
  let lastError: any

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    }
    catch (error: any) {
      lastError = error
      if (attempt < maxRetries && isRetryableError(error)) {
        const delay = baseDelayMs * 2 ** attempt + Math.random() * 500
        onRetry?.(attempt + 1, error, delay)
        await sleep(delay)
        continue
      }
      break
    }
  }
  throw lastError
}
