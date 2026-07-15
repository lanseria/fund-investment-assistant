import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'
import { and, asc, eq } from 'drizzle-orm'
import { chatMessages, chatSessions } from '~~/server/database/schemas'
import { getUserFromEvent } from '~~/server/utils/auth'
import { runChatAgent } from '~~/server/utils/chatAgent'
import { useDb } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const user = getUserFromEvent(event)
  const sessionId = Number(getRouterParam(event, 'id'))
  if (!sessionId)
    throw createError({ status: 400, statusText: '缺少会话 ID' })

  // 关键：MCP 工具内部读取 event.context.userId（由 MCP 中间件设置），
  // 但 Web 端 cookie 鉴权只设置了 event.context.user。
  // 这里手动桥接，使进程内直调工具时能正确识别用户身份。
  event.context.userId = user.id

  const body = await readBody<{ message?: string }>(event)
  const userMessage = body?.message?.trim()
  if (!userMessage)
    throw createError({ status: 400, statusText: '消息内容不能为空' })

  const db = useDb()

  // 1. 校验会话归属
  const session = await db.query.chatSessions.findFirst({
    where: and(eq(chatSessions.id, sessionId), eq(chatSessions.userId, user.id)),
    columns: { id: true, title: true },
  })
  if (!session)
    throw createError({ status: 404, statusText: '会话不存在或无权访问' })

  // 2. 落库用户消息
  await db.insert(chatMessages).values({
    sessionId,
    role: 'user',
    content: userMessage,
  })

  // 3. 首条消息时用其摘要作为会话标题
  if (session.title === '新对话') {
    const titlePreview = userMessage.slice(0, 20) + (userMessage.length > 20 ? '…' : '')
    await db.update(chatSessions)
      .set({ title: titlePreview, updatedAt: new Date() })
      .where(eq(chatSessions.id, sessionId))
  }
  else {
    await db.update(chatSessions)
      .set({ updatedAt: new Date() })
      .where(eq(chatSessions.id, sessionId))
  }

  // 4. 加载历史消息（构建 LLM 上下文），排除刚插入的当前用户消息
  const historyRows = await db.query.chatMessages.findMany({
    where: and(
      eq(chatMessages.sessionId, sessionId),
      // 排除当前消息本身（已通过参数传入 agent）
    ),
    orderBy: [asc(chatMessages.createdAt)],
  })
  // 截掉最后一条（刚插入的 user 消息），避免重复
  const priorHistory = historyRows.slice(0, -1)

  // 把 DB 行转换为 OpenAI 消息格式
  const history: ChatCompletionMessageParam[] = []
  for (const row of priorHistory) {
    if (row.role === 'user') {
      history.push({ role: 'user', content: row.content || '' })
    }
    else if (row.role === 'assistant') {
      if (row.toolCalls && Array.isArray(row.toolCalls) && row.toolCalls.length > 0) {
        history.push({
          role: 'assistant',
          content: row.content || null,
          tool_calls: row.toolCalls as any,
        })
      }
      else {
        history.push({ role: 'assistant', content: row.content || '' })
      }
    }
    else if (row.role === 'tool') {
      history.push({
        role: 'tool',
        tool_call_id: row.toolCallId || '',
        content: row.content || '',
      })
    }
  }

  // 5. 建立 SSE 流
  const eventStream = createEventStream(event)

  // 异步执行 Agent，把事件推入 SSE，并落库 assistant / tool 消息
  ;(async () => {
    // 累积工具调用，用于落库为一条 assistant(tool_calls) 消息
    const pendingToolCalls: Array<{
      id: string
      name: string
      arguments: Record<string, any>
    }> = []

    try {
      const result = await runChatAgent(
        event,
        history,
        userMessage,
        (ev) => {
          switch (ev.type) {
            case 'token':
              eventStream.push({ event: 'token', data: JSON.stringify({ text: ev.text }) })
              break
            case 'tool_call':
              pendingToolCalls.push({ id: ev.toolCallId, name: ev.name, arguments: ev.arguments })
              eventStream.push({
                event: 'tool_call',
                data: JSON.stringify({ toolCallId: ev.toolCallId, name: ev.name, arguments: ev.arguments }),
              })
              break
            case 'tool_result':
              eventStream.push({
                event: 'tool_result',
                data: JSON.stringify({ toolCallId: ev.toolCallId, text: ev.text, isError: ev.isError }),
              })
              break
            case 'error':
              eventStream.push({ event: 'error', data: JSON.stringify({ message: ev.message }) })
              break
            case 'done':
              eventStream.push({ event: 'done', data: '{}' })
              break
          }
        },
      )

      // 6. 落库：若存在工具调用，先存 assistant(tool_calls)，再存各 tool 结果占位；
      //    若无工具调用，直接存 assistant 文本。
      if (pendingToolCalls.length > 0) {
        // assistant 消息（含 tool_calls）
        await db.insert(chatMessages).values({
          sessionId,
          role: 'assistant',
          content: result.content || null,
          toolCalls: pendingToolCalls.map(tc => ({
            id: tc.id,
            type: 'function',
            function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
          })),
        })
      }
      else {
        await db.insert(chatMessages).values({
          sessionId,
          role: 'assistant',
          content: result.content,
        })
      }
    }
    catch (error: any) {
      console.error('[Chat SSE] agent 执行失败:', error)
      eventStream.push({
        event: 'error',
        data: JSON.stringify({ message: `AI 处理失败: ${error?.message || '未知错误'}` }),
      })
      // 落库错误消息
      await db.insert(chatMessages).values({
        sessionId,
        role: 'assistant',
        content: `(请求失败: ${error?.message || '未知错误'})`,
        isError: true,
      })
    }
    finally {
      // 更新会话时间戳
      await db.update(chatSessions)
        .set({ updatedAt: new Date() })
        .where(eq(chatSessions.id, sessionId))
      await eventStream.close()
    }
  })()

  return eventStream.send()
})
