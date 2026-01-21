# Nuxt Nitro + MCP Agent 集成开发文档

## 1. 项目概述

本模块旨在 Nuxt 后端 (Nitro Engine) 中实现一个自主 Agent。该 Agent 充当中间件，负责协调：

1.  **用户**：接收前端聊天输入。
2.  **AI 模型**：连接第三方兼容 Claude 接口的服务商（自定义 Base URL 和 Key）。
3.  **MCP 服务**：连接定制的 MCP Server，赋予 AI 调用业务工具的能力。

## 2. 核心架构

- **运行环境**: Nuxt 3 (Nitro Server)
- **通信协议**:
  - Backend <-> AI Provider: HTTP (兼容 Anthropic API 规范)
  - Backend <-> MCP Server: SSE (推荐) 或 Stdio
- **逻辑流**: `接收请求` -> `连接 MCP` -> `获取工具定义` -> `进入 ReAct 循环 (LLM 思考 + 工具执行)` -> `返回最终结果`

## 3. 环境与依赖安装

在 Nuxt 项目根目录执行以下命令，安装 Claude SDK 和 MCP SDK：

```bash
# 安装 Anthropic 官方 SDK (支持兼容协议) 和 MCP SDK
npm install @anthropic-ai/sdk @modelcontextprotocol/sdk eventsource
```

_注意：如果你的 Node 环境版本较低，可能需要安装 `eventsource` 来支持 SSE 连接。_

## 4. 环境变量配置 (.env)

在项目根目录的 `.env` 文件中添加以下配置。请确保第三方接口完全兼容 Anthropic 的 `/v1/messages` 格式。

```ini
# 第三方 AI 服务商配置
AI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxx
AI_BASE_URL=https://api.thirdparty.com/v1  # 替换为你的中转服务地址

# MCP 服务地址 (假设你的 MCP 服务以 SSE 模式运行)
MCP_SERVER_URL=http://localhost:3001/sse
```

## 5. 后端实现 (Nitro Handler)

新建文件 `server/api/chat.post.ts`。这是核心逻辑所在，包含了工具定义转换和多轮对话循环。

```typescript
import Anthropic from '@anthropic-ai/sdk'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
// server/api/chat.post.ts
import { createError, defineEventHandler, readBody } from 'h3'
// 如果你的 MCP 是本地命令行工具，请使用 StdioClientTransport

// 1. 初始化 AI 客户端 (配置第三方节点)
const aiClient = new Anthropic({
  apiKey: process.env.AI_API_KEY,
  baseURL: process.env.AI_BASE_URL, // 关键：指定第三方接口地址
})

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const userMessage = body.message
  // 实际生产中建议传入 conversation_id 以获取历史记录
  const conversationHistory = body.history || []

  if (!userMessage) {
    throw createError({ statusCode: 400, statusMessage: 'Message is required' })
  }

  // ==========================================
  // 阶段一：连接 MCP 服务并获取工具
  // ==========================================

  // 建立 MCP 连接 (此处演示 SSE 模式，适合微服务架构)
  const transport = new SSEClientTransport(
    new URL(process.env.MCP_SERVER_URL || 'http://localhost:3001/sse')
  )

  const mcpClient = new Client({
    name: 'NuxtNitroBackend',
    version: '1.0.0',
  }, {
    capabilities: {}
  })

  try {
    await mcpClient.connect(transport)
  }
  catch (e) {
    console.error('MCP 连接失败:', e)
    throw createError({ statusCode: 503, statusMessage: 'MCP Service Unavailable' })
  }

  // 获取工具列表并转换为 Claude 格式
  const mcpTools = await mcpClient.listTools()
  const anthropicTools: Anthropic.Tool[] = mcpTools.tools.map(tool => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema as Anthropic.Tool.InputSchema,
  }))

  // ==========================================
  // 阶段二：构建 Agent 循环 (ReAct Pattern)
  // ==========================================

  // 初始化本次对话上下文
  const messages: Anthropic.MessageParam[] = [
    ...conversationHistory, // 历史记录
    { role: 'user', content: userMessage }
  ]

  let finalResponseText = ''
  const MAX_TURNS = 10 // 防止死循环
  let turnCount = 0

  try {
    while (turnCount < MAX_TURNS) {
      turnCount++

      // A. 请求 AI
      console.log(`[Turn ${turnCount}] 正在请求 AI...`)
      const response = await aiClient.messages.create({
        model: 'claude-3-5-sonnet-20241022', // 确保第三方接口支持此模型名
        max_tokens: 1024,
        messages,
        tools: anthropicTools, // 注入 MCP 工具
      })

      // B. 将 AI 的回复追加到历史中
      messages.push({
        role: response.role,
        content: response.content,
      })

      // C. 判断停止原因
      if (response.stop_reason !== 'tool_use') {
        // AI 认为不需要调用工具，直接返回文本
        const textBlock = response.content.find(b => b.type === 'text')
        finalResponseText = textBlock?.text || ''
        break // 结束循环
      }

      // D. 处理工具调用请求
      const toolResults = []
      for (const contentBlock of response.content) {
        if (contentBlock.type === 'tool_use') {
          console.log(`[Agent] 调用工具: ${contentBlock.name}`)

          try {
            // 执行 MCP 工具
            const result = await mcpClient.callTool({
              name: contentBlock.name,
              arguments: contentBlock.input as any
            })

            // 解析工具返回的文本结果
            const resultText = result.content
              .filter(c => c.type === 'text')
              .map(c => c.text)
              .join('\n')

            toolResults.push({
              type: 'tool_result',
              tool_use_id: contentBlock.id,
              content: resultText || 'Success (No content returned)',
            })
          }
          catch (err: any) {
            console.error(`工具调用错误 [${contentBlock.name}]:`, err)
            toolResults.push({
              type: 'tool_result',
              tool_use_id: contentBlock.id,
              content: `Error executing tool: ${err.message}`,
              is_error: true
            })
          }
        }
      }

      // E. 将工具执行结果回传给 AI，进入下一轮思考
      if (toolResults.length > 0) {
        messages.push({
          role: 'user',
          content: toolResults as any,
        })
      }
    }
  }
  catch (error: any) {
    console.error('AI 交互流程异常:', error)
    throw createError({ statusCode: 500, statusMessage: error.message })
  }
  finally {
    // 务必关闭连接，防止资源泄漏
    await mcpClient.close()
  }

  // ==========================================
  // 阶段三：返回响应
  // ==========================================

  return {
    response: finalResponseText,
    history: messages, // 可选：返回完整历史供前端更新状态
    turns_used: turnCount
  }
})
```

## 6. 前端调用示例 (Vue)

在你的 Vue 页面组件中调用该 API。

```vue
<script setup>
const userParams = ref('帮我查询最新的系统日志')
const chatHistory = ref([])
const loading = ref(false)

async function sendMessage() {
  if (!userParams.value)
    return

  loading.value = true
  try {
    const { data } = await useFetch('/api/chat', {
      method: 'POST',
      body: {
        message: userParams.value,
        history: chatHistory.value // 传递上下文
      }
    })

    if (data.value) {
      console.log('AI 回复:', data.value.response)
      // 更新本地历史，保持上下文同步
      chatHistory.value = data.value.history
    }
  }
  catch (e) {
    alert('请求失败')
  }
  finally {
    loading.value = false
  }
}
</script>
```

## 7. 开发注意事项

1.  **超时控制**: Nitro 默认请求超时较短，而 Agent 执行多次工具调用可能耗时较长。请在部署平台（如 Vercel/Netlify 或 Node Server）增加超时时间配置。
2.  **SSE vs Stdio**:
    - 上述代码使用了 `SSEClientTransport`，这要求你的 MCP 服务是一个 HTTP 服务。
    - 如果你想直接调用本地 Python/JS 脚本作为 MCP，请将 Transport 替换为 `StdioClientTransport`，并传入 `command` 和 `args`。
3.  **第三方兼容性**: 务必确认第三方 API 提供商支持 **Function Calling / Tool Use** 功能。部分中转商仅支持纯文本对话，不支持 `tools` 参数，这会导致报错。
4.  **状态管理**: MCP Client 是有状态的。在上述代码中，每次 HTTP 请求都会新建连接。对于高并发场景，建议实现连接池或保持长连接（这在 Serverless 环境下较难实现，但在 Docker/VPS 部署中可行）。
