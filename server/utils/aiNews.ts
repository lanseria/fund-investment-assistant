/* eslint-disable no-console */
import OpenAI from 'openai'
import { z } from 'zod'

// 1. Zod Definition
const NewsItemSchema = z.object({
  title: z.string().describe('新闻标题，简练概括'),
  content: z.string().describe('新闻核心内容摘要，去除废话'),
  url: z.string().nullable().describe('原文链接，如果没有则为 null'),
  tag: z.string().describe('新闻分类标签，例如：宏观、科技、A股、美股、政策、半导体等'),
  sentiment: z.enum(['positive', 'negative', 'neutral']).describe('对市场的影响倾向'),
  reason: z.string().optional().describe('（可选）为什么这条新闻重要，AI的筛选理由'), // 新增字段，方便调试
})

const NewsResponseSchema = z.object({
  items: z.array(NewsItemSchema),
})

export type StructuredNewsItem = z.infer<typeof NewsItemSchema>

/**
 * 尝试修复被截断的 JSON 字符串
 * 针对 "Expected ',' or ']'" 错误，尝试补全结尾
 */
function tryRepairJson(jsonString: string): string {
  let fixed = jsonString.trim()

  // 1. 找到最后一个 '}' 或 ']'
  // 如果结尾不是 '}' 且不是 ']'，说明可能截断在字符串中间或数字中间，比较难救，这里主要救数组截断

  // 检查是否以 items 数组开头但没结尾
  if (fixed.includes('"items": [') && !fixed.endsWith('}')) {
    // 尝试找到最后一个完整的对象结束位置 '}'
    const lastObjectEnd = fixed.lastIndexOf('}')
    if (lastObjectEnd !== -1) {
      // 截取到最后一个完整的对象
      fixed = fixed.substring(0, lastObjectEnd + 1)
      // 补全数组和根对象
      fixed += ']}'
    }
  }
  return fixed
}

export async function processNewsWithAi(rawText: string): Promise<StructuredNewsItem[]> {
  const config = useRuntimeConfig()

  if (!config.openRouterApiKey) {
    console.warn('未配置 API Key，跳过。')
    return []
  }

  // 限制输入文本长度，防止上下文超限导致模型“胡言乱语”或过早截断
  // 假设 1个中文词约等于 1.5 token，保留最近的 15000 字符通常足够
  const truncatedInput = rawText.length > 20000 ? `${rawText.slice(0, 20000)}...(后续文本截断)` : rawText

  const openai = new OpenAI({
    baseURL: 'https://ark.cn-beijing.volces.com/api/coding/v3',
    apiKey: config.openRouterApiKey,
  })

  const targetModel = 'ark-code-latest'
  const MAX_RETRIES = 3

  // 强化 Prompt：增加筛选逻辑，减少输出量，防止截断
  const systemPrompt = `你是一位专业的宏观对冲基金经理。你的任务是从杂乱的新闻流中筛选出对"基金投资"有实质性影响的关键信息。

**筛选标准（严格执行）：**
1. **剔除噪音**：忽略八卦、无实质内容的口号、个股琐事（除非是行业龙头的大事件）、重复报道。
2. **保留核心**：重点关注宏观政策（利率/财政）、行业重磅利好/利空（如AI、半导体、新能源）、外盘重大波动。
3. **数量限制**：为了保证输出完整，请只提取 **最重要的 10-15 条** 新闻。如果新闻很少，就提取所有的。

**输出格式规则：**
- 必须是合法的 JSON 对象。
- 严禁包含Markdown代码块（如 \`\`\`json）。
- 严禁包含任何解释性文字。
- 格式如下：
{
  "items": [
    {
      "title": "简练标题",
      "content": "一句话摘要核心影响",
      "url": "http...或null",
      "tag": "宏观/A股/美股/板块名",
      "sentiment": "positive/negative/neutral",
      "reason": "筛选理由：为什么这对基金重要"
    }
  ]
}`

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`[AI分析] 第 ${attempt}/${MAX_RETRIES} 次请求 (输入长度: ${truncatedInput.length})...`)

      const completion = await openai.chat.completions.create({
        model: targetModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `请筛选并解析以下文本：\n\n${truncatedInput}` },
        ],
        temperature: 0.1, // 低温保证格式稳定
        max_tokens: 4096, // 尽可能给大输出空间
      })

      let rawContent = completion.choices[0]?.message?.content || '{}'

      // 1. 基础清理：去除代码块标记
      rawContent = rawContent.replace(/```json/g, '').replace(/```/g, '')

      // 2. 精准提取 JSON 部分
      const firstBrace = rawContent.indexOf('{')
      const lastBrace = rawContent.lastIndexOf('}')

      if (firstBrace !== -1 && lastBrace !== -1) {
        // 如果 lastBrace 在 firstBrace 后面，才截取
        if (lastBrace > firstBrace) {
          rawContent = rawContent.substring(firstBrace, lastBrace + 1)
        }
      }
      else {
        throw new Error('未找到有效的 JSON 起止符')
      }

      // 3. 尝试解析
      let parsedJson: any
      try {
        parsedJson = JSON.parse(rawContent)
      }
      catch (e) {
        console.error(e)
        console.warn(`[AI分析] JSON 解析失败，尝试自动修复截断...`)
        // 4. 解析失败，尝试修复（针对截断情况）
        const fixedContent = tryRepairJson(rawContent)
        parsedJson = JSON.parse(fixedContent) // 如果这里还报错，就进入 catch 重试
        console.log(`[AI分析] JSON 自动修复成功！`)
      }

      const validationResult = NewsResponseSchema.safeParse(parsedJson)

      if (!validationResult.success) {
        console.warn(`[AI分析] Zod 结构校验失败:`, validationResult.error.issues[0].message)
        throw new Error('Zod 校验不通过')
      }

      console.log(`[AI分析] 成功提取 ${validationResult.data.items.length} 条有效新闻。`)
      return validationResult.data.items
    }
    catch (error: any) {
      console.error(`[AI分析] 第 ${attempt} 次失败: ${error.message}`)

      if (attempt === MAX_RETRIES) {
        console.error('[AI分析] 重试耗尽，放弃。')
        return []
      }
    }
  }

  return []
}
