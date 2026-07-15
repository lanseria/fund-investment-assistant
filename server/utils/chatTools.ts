/**
 * Chat Agent 工具适配层
 * -----------------------------
 * 复用现有 9 个 MCP 工具（server/mcp/tools/*），通过进程内直调（in-process）的方式
 * 供 AI 对话 Agent 调用，无需 MCP HTTP 二次跳转。
 *
 * 原理：
 * - `defineMcpTool` 是 identity 函数，返回 `{ name, description, inputSchema: ZodRawShape, handler }`。
 * - `asyncContext: true` 已启用，工具 handler 内 `useEvent()` 会解析为当前请求 event，
 *   因此 Web 端 cookie 鉴权（event.context.user）注入的 userId 可被工具正确读取。
 * - 用 `z.toJSONSchema(z.object(shape))` 将 Zod 形状转换为 JSON Schema 喂给 LLM。
 */
import type { ChatCompletionTool } from 'openai/resources/chat/completions'
import type { ZodRawShape } from 'zod'
import { z } from 'zod'
import adminUsersTool from '~~/server/mcp/tools/admin-users'
import fundDetailsTool from '~~/server/mcp/tools/fund-details'
import manageAiSettingsTool from '~~/server/mcp/tools/manage-ai-settings'
import managePendingTool from '~~/server/mcp/tools/manage-pending'
import manageSectorsTool from '~~/server/mcp/tools/manage-sectors'
import manageWatchlistTool from '~~/server/mcp/tools/manage-watchlist'
import marketIndexTool from '~~/server/mcp/tools/market-index'
import portfolioTool from '~~/server/mcp/tools/portfolio'
import submitTradeTool from '~~/server/mcp/tools/submit-trade'

/** 单个工具适配后的运行时结构 */
export interface ChatToolEntry {
  name: string
  description: string
  /** JSON Schema (已剥离 $schema / additionalProperties) */
  jsonSchema: Record<string, any>
  /** 用于参数解析/校验的 Zod object */
  zodObject: z.ZodObject<any>
  /** MCP 工具原 handler */
  handler: (args: any) => Promise<any>
  /** 是否仅管理员可用 */
  adminOnly: boolean
}

/** 工具执行结果（拍平为纯文本 + 错误标记） */
export interface ToolExecResult {
  text: string
  isError: boolean
}

/** 仅管理员可用的工具名 */
const ADMIN_TOOL_NAMES = new Set(['manage_sectors', 'admin_manage_users'])

/**
 * 将 ZodRawShape 转换为 OpenAI 友好的 JSON Schema。
 * 剥离 `$schema`（OpenAI 不接受）和 `additionalProperties:false`（部分模型校验过严）。
 */
function shapeToJsonSchema(shape: ZodRawShape | undefined): Record<string, any> {
  if (!shape || Object.keys(shape).length === 0) {
    // 无参数工具：返回一个空对象 schema
    return { type: 'object', properties: {} }
  }
  const full = z.toJSONSchema(z.object(shape))
  const { $schema: _s, additionalProperties: _a, ...rest } = full as Record<string, any>
  return rest
}

/** 注册并适配全部工具 */
function buildToolEntries(): ChatToolEntry[] {
  const defs = [
    portfolioTool,
    fundDetailsTool,
    submitTradeTool,
    managePendingTool,
    manageWatchlistTool,
    marketIndexTool,
    manageSectorsTool,
    adminUsersTool,
    manageAiSettingsTool,
  ]

  return defs.map((def, idx) => {
    const name = def.name || `tool_${idx}`
    const shape = def.inputSchema as ZodRawShape | undefined
    return {
      name,
      description: def.description || name,
      jsonSchema: shapeToJsonSchema(shape),
      zodObject: z.object(shape || {}),
      handler: def.handler as (args: any) => Promise<any>,
      adminOnly: ADMIN_TOOL_NAMES.has(name),
    }
  })
}

export const CHAT_TOOLS: ChatToolEntry[] = buildToolEntries()

const TOOL_MAP = new Map(CHAT_TOOLS.map(t => [t.name, t]))

/**
 * 按用户角色返回 OpenAI ChatCompletionTool 列表。
 * 管理员工具对普通用户隐藏。
 */
export function getOpenAITools(role: 'admin' | 'user' = 'user'): ChatCompletionTool[] {
  return CHAT_TOOLS
    .filter(t => role === 'admin' || !t.adminOnly)
    .map(t => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.jsonSchema as any,
      },
    }))
}

/**
 * 执行指定工具：参数校验 → 调 handler → 拍平 MCP 返回结构。
 * handler 内部通过 useEvent() 读取当前请求上下文 (userId 等)。
 */
export async function executeTool(name: string, args: Record<string, any>): Promise<ToolExecResult> {
  const tool = TOOL_MAP.get(name)
  if (!tool) {
    return { text: `未知工具: ${name}`, isError: true }
  }

  // 参数校验（失败则把错误信息回喂给 LLM 自纠）
  const parsed = tool.zodObject.safeParse(args)
  const finalArgs = parsed.success ? parsed.data : args

  try {
    const result = await tool.handler(finalArgs)
    return normalizeMcpResult(result)
  }
  catch (error: any) {
    return {
      text: `工具执行异常 [${name}]: ${error?.message || String(error)}`,
      isError: true,
    }
  }
}

/**
 * 将 MCP 工具的返回结构 { content: [{type:'text', text}], isError } 拍平为纯文本。
 */
function normalizeMcpResult(result: any): ToolExecResult {
  if (!result) {
    return { text: '(工具未返回内容)', isError: false }
  }

  const isError = result.isError === true

  // 标准结构：{ content: [{ type: 'text', text }] }
  if (result.content && Array.isArray(result.content)) {
    const text = result.content
      .filter((c: any) => c.type === 'text')
      .map((c: any) => c.text)
      .join('\n')
    return { text: text || '(空内容)', isError }
  }

  // 兜底：直接字符串化
  return { text: typeof result === 'string' ? result : JSON.stringify(result), isError }
}

/** 流式 chunk 中 tool_call 的 delta 结构（id/function 均可能为 undefined） */
interface ToolCallDelta {
  index: number
  id?: string
  function?: { name?: string, arguments?: string }
}

/** OpenAI 流式累计的 tool_call 增量（一个 function call 跨多个 chunk） */
export interface AccumulatedToolCall {
  id: string
  name: string
  arguments: string
}

/**
 * 将流式 chunk 中的 tool_calls delta 合并到累计数组。
 * 按 index 对齐（流式中同一工具调用通过 index 标识）。
 */
export function mergeToolCallDeltas(
  accumulated: AccumulatedToolCall[],
  deltas: ToolCallDelta[] | null | undefined,
): void {
  if (!deltas)
    return
  for (const delta of deltas) {
    const idx = delta.index ?? accumulated.length
    const existing = accumulated[idx]
    if (existing) {
      if (delta.id && !existing.id)
        existing.id = delta.id
      if (delta.function?.name)
        existing.name += delta.function.name
      if (delta.function?.arguments)
        existing.arguments += delta.function.arguments
    }
    else {
      accumulated[idx] = {
        id: delta.id || `call_${Date.now()}_${idx}`,
        name: delta.function?.name || '',
        arguments: delta.function?.arguments || '',
      }
    }
  }
}

/**
 * 解析累计的 tool_call arguments 字符串为对象。
 * 容错：空串 → {}，非法 JSON → 回传原始字符串以便 LLM 自纠。
 */
export function parseToolArguments(raw: string): Record<string, any> {
  if (!raw.trim())
    return {}
  try {
    return JSON.parse(raw)
  }
  catch {
    return { __raw: raw }
  }
}
