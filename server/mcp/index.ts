/* eslint-disable no-console */
import { getMcpUser } from '~~/server/utils/apiToken'

export default defineMcpHandler({
  middleware: async (event) => {
    // --- DEBUG START ---
    const headers = getHeaders(event)
    const authHeader = headers.authorization || headers.Authorization
    console.log('[MCP Debug] Incoming Request to:', event.path)
    console.log('[MCP Debug] Auth Header present:', !!authHeader)
    if (authHeader) {
      console.log('[MCP Debug] Header preview:', `${authHeader.substring(0, 15)}...`)
    }
    // --- DEBUG END ---

    // 尝试获取用户 ID (Soft Auth)
    const userId = await getMcpUser(event)

    console.log('[MCP Debug] Resolved User ID:', userId) // 看看这里是不是 null

    // 如果获取成功，注入到 event context 中
    if (userId) {
      event.context.userId = userId
    }
  },
})
