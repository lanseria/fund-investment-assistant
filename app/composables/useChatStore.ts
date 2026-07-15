import { acceptHMRUpdate, defineStore } from 'pinia'
import { apiFetch } from '~/utils/api'

/** 工具调用（UI 折叠展示用） */
export interface ChatToolCall {
  toolCallId: string
  name: string
  arguments: Record<string, any>
  /** 工具执行结果（tool_result 到达后填充） */
  result?: string
  isError?: boolean
  /** 是否正在执行中 */
  pending?: boolean
}

/** 单条消息（同时支持历史回显与流式构建） */
export interface ChatMessage {
  id?: number
  role: 'user' | 'assistant' | 'tool'
  content: string
  /** assistant 消息关联的工具调用卡片 */
  toolCalls?: ChatToolCall[]
  isError?: boolean
  /** 是否正在流式输出中（占位气泡） */
  streaming?: boolean
}

/** 会话摘要（列表用） */
export interface ChatSession {
  id: number
  title: string
  createdAt: string
  updatedAt: string
}

export const useChatStore = defineStore('chat', () => {
  // --- State ---
  const sessions = ref<ChatSession[]>([])
  const currentSessionId = ref<number | null>(null)
  const messages = ref<ChatMessage[]>([])
  const isOpen = ref(false)
  /** 展示模式：panel（右下角悬浮）/ dialog（居中放大） */
  const displayMode = ref<'panel' | 'dialog'>('panel')
  const isStreaming = ref(false)
  const isLoadingSessions = ref(false)
  const isLoadingMessages = ref(false)

  // --- Actions ---

  /** 切换面板开关 */
  function togglePanel() {
    isOpen.value = !isOpen.value
    // 首次打开时若未加载会话列表，自动加载
    if (isOpen.value && sessions.value.length === 0 && !isLoadingSessions.value)
      loadSessions()
  }

  /** 切换展示模式（panel ↔ dialog） */
  function toggleDisplayMode() {
    displayMode.value = displayMode.value === 'panel' ? 'dialog' : 'panel'
  }

  /** 加载会话列表 */
  async function loadSessions() {
    isLoadingSessions.value = true
    try {
      const data = await apiFetch<{ sessions: ChatSession[] }>('/api/chat/sessions/')
      sessions.value = data.sessions
    }
    catch (e: any) {
      console.error('[Chat] 加载会话列表失败:', e)
    }
    finally {
      isLoadingSessions.value = false
    }
  }

  /** 新建会话并选中 */
  async function createSession() {
    try {
      const data = await apiFetch<{ session: ChatSession }>('/api/chat/sessions/', { method: 'POST' })
      sessions.value.unshift(data.session)
      await selectSession(data.session.id)
      return data.session
    }
    catch (e: any) {
      console.error('[Chat] 新建会话失败:', e)
      return null
    }
  }

  /** 选中并加载某会话的消息 */
  async function selectSession(sessionId: number) {
    if (currentSessionId.value === sessionId && messages.value.length > 0)
      return
    currentSessionId.value = sessionId
    isLoadingMessages.value = true
    messages.value = []
    try {
      const data = await apiFetch<{ messages: any[] }>(`/api/chat/sessions/${sessionId}/messages`)
      messages.value = normalizeHistory(data.messages)
    }
    catch (e: any) {
      console.error('[Chat] 加载消息失败:', e)
    }
    finally {
      isLoadingMessages.value = false
    }
  }

  /** 删除会话 */
  async function deleteSession(sessionId: number) {
    try {
      await apiFetch(`/api/chat/sessions/${sessionId}`, { method: 'DELETE' })
      sessions.value = sessions.value.filter(s => s.id !== sessionId)
      if (currentSessionId.value === sessionId) {
        currentSessionId.value = sessions.value[0]?.id ?? null
        messages.value = []
        if (currentSessionId.value)
          await selectSession(currentSessionId.value)
      }
    }
    catch (e: any) {
      console.error('[Chat] 删除会话失败:', e)
    }
  }

  /**
   * 发送消息（SSE 流式）。
   * 用原生 fetch + ReadableStream 解析 text/event-stream，
   * 逐事件更新 messages（token 增量、tool_call/tool_result 卡片）。
   */
  async function sendMessage(text: string) {
    if (!text.trim() || isStreaming.value)
      return

    // 确保有当前会话
    if (!currentSessionId.value) {
      const created = await createSession()
      if (!created)
        return
    }
    const sessionId = currentSessionId.value!

    // 1. 立即追加用户消息
    messages.value.push({ role: 'user', content: text })
    // 2. 追加 assistant 占位气泡（流式填充）
    const assistantMsg = reactive<ChatMessage>({
      role: 'assistant',
      content: '',
      toolCalls: [],
      streaming: true,
    })
    messages.value.push(assistantMsg)

    isStreaming.value = true
    try {
      const resp = await fetch(`/api/chat/sessions/${sessionId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ message: text }),
      })

      if (!resp.ok || !resp.body)
        throw new Error(`请求失败: ${resp.status}`)

      // 解析 SSE 流
      await consumeSseStream(resp.body, (eventName, dataStr) => {
        handleSseEvent(eventName, dataStr, assistantMsg)
      })
    }
    catch (e: any) {
      assistantMsg.content += `\n\n❌ ${e?.message || '请求失败'}`
      assistantMsg.isError = true
    }
    finally {
      assistantMsg.streaming = false
      // 标记所有未完成的工具调用
      assistantMsg.toolCalls?.forEach((tc) => {
        if (tc.pending)
          tc.pending = false
      })
      isStreaming.value = false
      // 刷新会话列表（标题/时间可能已变）
      loadSessions()
    }
  }

  /**
   * 消费 SSE 流，按命名事件回调。
   * 解析 `event: xxx\ndata: {...}\n\n` 格式。
   */
  async function consumeSseStream(
    body: ReadableStream<Uint8Array>,
    onEvent: (event: string, data: string) => void,
  ) {
    const reader = body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done)
        break
      buffer += decoder.decode(value, { stream: true })

      // 按空行分割事件块
      const blocks = buffer.split('\n\n')
      buffer = blocks.pop() || '' // 最后一块可能不完整，保留

      for (const block of blocks) {
        const lines = block.split('\n')
        let eventName = 'message'
        let dataStr = ''
        for (const line of lines) {
          if (line.startsWith('event:'))
            eventName = line.slice(6).trim()
          else if (line.startsWith('data:'))
            dataStr += line.slice(5).trim()
        }
        if (eventName)
          onEvent(eventName, dataStr)
      }
    }
    // 处理残留
    if (buffer.trim()) {
      const lines = buffer.split('\n')
      let eventName = 'message'
      let dataStr = ''
      for (const line of lines) {
        if (line.startsWith('event:'))
          eventName = line.slice(6).trim()
        else if (line.startsWith('data:'))
          dataStr += line.slice(5).trim()
      }
      if (eventName)
        onEvent(eventName, dataStr)
    }
  }

  /** 处理单个 SSE 事件，更新 assistant 占位消息 */
  function handleSseEvent(eventName: string, dataStr: string, msg: ChatMessage) {
    let payload: any = {}
    try {
      payload = dataStr ? JSON.parse(dataStr) : {}
    }
    catch {
      payload = {}
    }

    switch (eventName) {
      case 'token':
        msg.content += payload.text || ''
        break
      case 'tool_call': {
        if (!msg.toolCalls)
          msg.toolCalls = []
        msg.toolCalls.push({
          toolCallId: payload.toolCallId,
          name: payload.name,
          arguments: payload.arguments || {},
          pending: true,
        })
        break
      }
      case 'tool_result': {
        const tc = msg.toolCalls?.find(t => t.toolCallId === payload.toolCallId)
        if (tc) {
          tc.result = payload.text
          tc.isError = payload.isError
          tc.pending = false
        }
        break
      }
      case 'error':
        msg.content += `\n\n❌ ${payload.message || '未知错误'}`
        msg.isError = true
        break
      case 'done':
        // 流结束
        break
    }
  }

  /**
   * 将后端历史消息行规范化为 UI 消息。
   * assistant 行若带 toolCalls，合并展示为一条带工具卡片的消息。
   * tool 行（无关联 assistant 的孤儿结果）合并到上一条 assistant。
   */
  function normalizeHistory(rows: any[]): ChatMessage[] {
    const result: ChatMessage[] = []
    for (const row of rows) {
      if (row.role === 'user') {
        result.push({ id: row.id, role: 'user', content: row.content || '' })
      }
      else if (row.role === 'assistant') {
        const msg: ChatMessage = {
          id: row.id,
          role: 'assistant',
          content: row.content || '',
          isError: row.isError,
          toolCalls: [],
        }
        // 解析 toolCalls（DB 存的是 [{id,type,function:{name,arguments}}]）
        if (Array.isArray(row.toolCalls)) {
          msg.toolCalls = row.toolCalls.map((tc: any) => ({
            toolCallId: tc.id,
            name: tc.function?.name || tc.name || '',
            arguments: safeParseArgs(tc.function?.arguments ?? tc.arguments),
          }))
        }
        result.push(msg)
      }
      else if (row.role === 'tool') {
        // 把 tool 结果回填到最近的 assistant 消息的对应工具卡片
        const lastAssistant = [...result].reverse().find(m => m.role === 'assistant')
        const tc = lastAssistant?.toolCalls?.find(t => t.toolCallId === row.toolCallId)
        if (tc) {
          tc.result = row.content || ''
          tc.isError = row.isError
        }
      }
    }
    return result
  }

  function safeParseArgs(raw: any): Record<string, any> {
    if (typeof raw !== 'string')
      return raw || {}
    try {
      return JSON.parse(raw)
    }
    catch {
      return {}
    }
  }

  return {
    // state
    sessions,
    currentSessionId,
    messages,
    isOpen,
    displayMode,
    isStreaming,
    isLoadingSessions,
    isLoadingMessages,
    // actions
    togglePanel,
    toggleDisplayMode,
    loadSessions,
    createSession,
    selectSession,
    deleteSession,
    sendMessage,
  }
})

if (import.meta.hot)
  import.meta.hot.accept(acceptHMRUpdate(useChatStore, import.meta.hot))
