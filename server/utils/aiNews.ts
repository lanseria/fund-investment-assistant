import OpenAI from 'openai'
import { z } from 'zod'

// 1. Zod Schema 定义（保持不变，用于后续手动验证）
const NewsItemSchema = z.object({
  title: z.string().describe('新闻标题，简练概括'),
  content: z.string().describe('新闻核心内容摘要，去除废话'),
  url: z.string().nullable().describe('原文链接，如果没有则为 null'),
  tag: z.string().describe('新闻分类标签，例如：宏观、科技、A股、美股、政策、半导体等'),
  sentiment: z.enum(['positive', 'negative', 'neutral']).describe('对市场的影响倾向'),
})

const NewsResponseSchema = z.object({
  items: z.array(NewsItemSchema),
})

export type StructuredNewsItem = z.infer<typeof NewsItemSchema>

export async function processNewsWithAi(rawText: string): Promise<StructuredNewsItem[]> {
  const config = useRuntimeConfig()

  if (!config.openRouterApiKey) {
    console.warn('未配置 API Key，跳过。')
    return []
  }

  const targetModel = 'mimo-v2-flash'

  // 重点改动 A：System Prompt 必须明确告诉模型 JSON 长什么样
  // 因为 json_object 模式只保证返回 JSON，不保证字段，所以要在 Prompt 里写例子
  const systemPrompt = `
你是一个专业的金融数据解析引擎。
请将输入的非结构化文本转换为严格的 JSON 格式。

**输出结构要求：**
你需要返回一个 JSON 对象，包含一个 "items" 数组。
数组中每个对象必须包含以下字段：
1. "title": 新闻标题
2. "content": 核心摘要
3. "url": 原文链接（如果没有则返回 null）
4. "tag": 分类标签（如：宏观、科技、A股）
5. "sentiment": 情感倾向（只能是 "positive", "negative", "neutral" 其中之一）

**示例格式：**
{
  "items": [
    {
      "title": "...",
      "content": "...",
      "url": "http://...",
      "tag": "科技",
      "sentiment": "positive"
    }
  ]
}

如果不包含任何有效新闻，请返回: { "items": [] }
`

  try {
    const openai = new OpenAI({
      baseURL: 'https://api.xiaomimimo.com/v1', // 示例 URL
      apiKey: config.openRouterApiKey,
    })

    // 重点改动 B：使用标准 create 方法，而不是 parse
    const completion = await openai.chat.completions.create({
      model: targetModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: rawText },
      ],
      temperature: 0.3,
      // 开启 JSON Mode
      response_format: {
        type: 'json_object',
      },
    })

    // 重点改动 C：手动提取与清洗
    let rawContent = completion.choices[0]?.message?.content || '{}'

    // 预防模型虽然开启 JSON mode 但仍包裹 Markdown 代码块 (```json ... ```)
    // 很多国产模型会有这个习惯
    rawContent = rawContent
      .replace(/```json/g, '')
      .replace(/```/g, '')
      .trim()

    // 1. 解析 JSON
    const parsedJson = JSON.parse(rawContent)

    // 2. 使用 Zod 进行结构验证 (这一步非常重要，确保模型没乱写字段)
    // safeParse 不会抛出异常，而是返回 success 状态，更适合生产环境
    const validationResult = NewsResponseSchema.safeParse(parsedJson)

    if (!validationResult.success) {
      console.error('AI 返回的数据结构不符合 Schema:', validationResult.error)
      // 可以选择降级处理，或者返回空数组
      return []
    }

    return validationResult.data.items
  }
  catch (error: any) {
    console.error('AI 解析/网络请求失败:', error)
    return []
  }
}
