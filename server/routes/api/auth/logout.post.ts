// server/routes/api/auth/logout.post.ts
export default defineEventHandler((event) => {
  // 使用 deleteCookie 清除认证相关的 cookie
  deleteCookie(event, 'auth-token', { path: '/' })
  deleteCookie(event, 'auth-refresh-token', { path: '/' })

  setResponseStatus(event, 204) // No Content
  return {}
})
