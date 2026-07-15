import type { H3Event } from 'h3'
/**
 * Chat Agent 核心 ReAct 循环（流式）
 * -----------------------------
 * 基于已安装的 OpenAI SDK (OpenRouter/glm-5.2) 实现 tool-calling 多轮循环。
 *
 * 流程：
 *   接收用户消息 → 流式请求 LLM → 逐 token 上推 → 若 LLM 要求调用工具 →
 *   并行执行工具 → 结果回填 → 进入下一轮 → 直到 LLM 输出纯文本终止。
 *
 * 工具调用为「进程内直调」(见 chatTools.ts)，无需 MCP HTTP 跳转。
 */
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'
import type { UserPayload } from './auth'
import OpenAI from 'openai'
import {
  executeTool,
  getOpenAITools,
  mergeToolCallDeltas,
  parseToolArguments,
} from './chatTools'

/** Agent 向外发出的事件（由路由层转成 SSE） */
export type ChatEvent
  = | { type: 'token', text: string }
    | { type: 'tool_call', toolCallId: string, name: string, arguments: Record<string, any> }
    | { type: 'tool_result', toolCallId: string, text: string, isError: boolean }
    | { type: 'done', assistantMessageId?: number }
    | { type: 'error', message: string }

export interface EmitFn {
  (event: ChatEvent): void
}

/** 单轮对话持久化所需的最终结果 */
export interface AgentFinalResult {
  /** assistant 完整文本回复 */
  content: string
  /** 本轮 assistant 发起的全部工具调用（可能跨多轮，扁平汇总） */
  toolCalls: Array<{ id: string, name: string, arguments: Record<string, any> }>
}

/** 防死循环：最多工具往返轮数 */
const MAX_TURNS = 8

/**
 * 内置 System Prompt。
 * 定义 AI 角色、可用能力边界与安全规则，并在运行时拼接用户身份与时间。
 */
function buildSystemPrompt(role: 'admin' | 'user', username: string): string {
  const now = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
  return `你是"基金投资助手"的 AI 交易助理，通过自然语言协助用户管理基金投资。

## 当前上下文
- 当前时间: ${now}
- 用户: ${username}${role === 'admin' ? '（管理员）' : ''}

## 你的能力
你可以调用以下工具来完成用户的请求（按需调用，可多次调用）：
1. **查询持仓**: get_portfolio — 获取当前持仓摘要、总资产、可用现金、收益率
2. **基金诊断**: get_fund_details — 查询指定基金的均线、乖离率、策略信号、净值走势
3. **下单交易**: submit_trade_order — 提交买入/卖出/转换申请（进入"待处理"，需用户在"每日操作"页确认）
4. **管理挂单**: manage_pending_transactions — 列出/撤销待处理交易
5. **管理自选**: manage_watchlist — 添加/移除关注基金
6. **市场行情**: get_market_index — 查询大盘指数（A股/港股/美股/期货等）
6. **AI设置**: manage_ai_settings — 查看或修改自动交易模式/策略提示词${role === 'admin' ? '\n7. **板块字典**: manage_sectors — 管理板块字典（管理员）\n8. **用户管理**: admin_manage_users — 管理系统用户（管理员）' : ''}

## 行为准则（必须遵守）
- **主动使用工具**: 当用户问及持仓、行情、基金信息时，先调用对应工具获取真实数据，再回答；不要凭空捏造数据。
- **下单需明确**: 执行买入前必须确认基金代码、金额；卖出/转换必须确认基金代码、份额。若信息不全，请先询问用户。
- **说明后果**: 执行写操作（下单、撤销、关注管理、字典修改）后，简洁告知用户操作结果，并提示可在"每日操作"页面复核。
- **风险提示**: 涉及卖出/转换时，如工具返回中提示7天惩罚性费率等，应主动提醒用户。
- **语言**: 使用简洁的中文回答，金额/份额保留合理精度，可使用 Markdown 排版（列表、加粗），但不要输出冗长内容。
- **诚实**: 工具返回错误时如实告知用户原因，不要假装成功。

请始终以帮助用户做出明智投资决策为目标。`
}

/**
 * 运行 Chat Agent。
 *
 * @param event  H3 事件（用于 OpenAI SDK 内部 useEvent 解析）
 * @param history  已落库的历史消息（role/content/tool_calls/tool_call_id），按时间正序
 * @param userMessage  本轮用户输入
 * @param emit  事件回调（token/tool_call/tool_result/done/error）
 */
export async function runChatAgent(
  event: H3Event,
  history: ChatCompletionMessageParam[],
  userMessage: string,
  emit: EmitFn,
): Promise<AgentFinalResult> {
  const user = event.context.user as UserPayload | undefined
  if (!user) {
    const msg = '用户未登录，无法启动对话。'
    emit({ type: 'error', message: msg })
    return { content: msg, toolCalls: [] }
  }
  const config = useRuntimeConfig(event)

  if (!config.openRouterApiKey) {
    const msg = '系统未配置 OpenRouter API Key，AI 对话不可用。'
    emit({ type: 'error', message: msg })
    return { content: msg, toolCalls: [] }
  }

  const openai = new OpenAI({
    baseURL: config.openRouterBaseUrl,
    apiKey: config.openRouterApiKey,
    maxRetries: 3,
  })

  const tools = getOpenAITools(user.role)
  const systemPrompt = buildSystemPrompt(user.role, user.username)

  // 构建消息数组：system + 历史 + 当前用户输入
  const messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    ...history,
    { role: 'user', content: userMessage },
  ]

  let assistantContent = ''
  const allToolCalls: AgentFinalResult['toolCalls'] = []

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    let turnText = ''
    // 累计本轮工具调用（按 index 对齐）
    const turnToolCalls: Array<{ id: string, name: string, arguments: string }> = []

    try {
      const stream = await openai.chat.completions.create({
        model: 'glm-5.2',
        messages,
        tools: tools.length > 0 ? tools : undefined,
        temperature: 0.4,
        stream: true,
      })

      for await (const chunk of stream) {
        const delta = chunk.choices?.[0]?.delta
        if (!delta)
          continue

        // 文本增量
        if (delta.content) {
          turnText += delta.content
          emit({ type: 'token', text: delta.content })
        }

        // 工具调用增量（跨 chunk 累积，按 index 对齐）
        if (delta.tool_calls) {
          mergeToolCallDeltas(turnToolCalls, delta.tool_calls)
        }
      }
    }
    catch (error: any) {
      const msg = `AI 请求失败: ${error?.message || String(error)}`
      console.error('[ChatAgent] OpenAI stream error:', error)
      emit({ type: 'error', message: msg })
      assistantContent = msg
      break
    }

    assistantContent += turnText

    // 无工具调用 → 对话结束
    if (turnToolCalls.length === 0) {
      break
    }

    // 有工具调用：把 assistant 的 tool_calls 消息追加进历史
    messages.push({
      role: 'assistant',
      content: turnText || null,
      tool_calls: turnToolCalls.map(tc => ({
        id: tc.id,
        type: 'function' as const,
        function: { name: tc.name, arguments: tc.arguments },
      })),
    })

    // 并行执行所有工具调用
    const toolResults = await Promise.all(
      turnToolCalls.map(async (tc) => {
        const args = parseToolArguments(tc.arguments)
        emit({ type: 'tool_call', toolCallId: tc.id, name: tc.name, arguments: args })

        const result = await executeTool(tc.name, args)
        emit({ type: 'tool_result', toolCallId: tc.id, text: result.text, isError: result.isError })

        allToolCalls.push({ id: tc.id, name: tc.name, arguments: args })

        return {
          toolCallId: tc.id,
          text: result.text,
        }
      }),
    )

    // 把工具结果作为 tool 消息回填，进入下一轮
    for (const r of toolResults) {
      messages.push({
        role: 'tool',
        tool_call_id: r.toolCallId,
        content: r.text,
      })
    }
  }

  // 若循环耗尽但 assistant 仍有内容，content 已累计；否则可能为空
  if (!assistantContent) {
    assistantContent = '(已达到最大工具调用轮数，请尝试重新提问或简化请求)'
  }

  emit({ type: 'done' })

  return { content: assistantContent, toolCalls: allToolCalls }
}

export { buildSystemPrompt }
