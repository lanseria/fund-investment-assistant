// File: server/routes/api/fund/utils/import.post.ts
import { Buffer } from 'node:buffer'
import { z } from 'zod'
import { getUserFromEvent } from '~~/server/utils/auth' // 导入认证工具

// [重要修改] 创建一个更健壮、将被实际使用的 Zod schema
const importSchema = z.object({
  // `overwrite` 在表单中是字符串 'true' 或 'false'，我们预处理它为布尔值
  overwrite: z.preprocess(val => String(val) === 'true', z.boolean()),
  // `file` 数据在 Nitro 中是 Buffer 类型。我们验证它是一个非空的 Buffer。
  file: z.instanceof(Buffer).refine(buf => buf.length > 0, {
    message: '文件是必需的，且不能为空。',
  }),
})

export default defineEventHandler(async (event) => {
  // 首先获取当前用户信息，如果未登录，中间件会在此之前抛出错误
  const user = getUserFromEvent(event)
  // 1. 读取 multipart form data
  const formData = await readMultipartFormData(event)
  if (!formData)
    throw createError({ statusCode: 400, statusMessage: '需要 Multipart form data。' })

  // 2. [重要修改] 将 formData 数组转换为 Zod 可以验证的对象
  // Nitro 的 readMultipartFormData 返回一个数组，我们需要将其转换为 {key: value} 形式
  const dataToValidate = formData.reduce((acc, part) => {
    if (part.name)
      acc[part.name] = part.data

    return acc
  }, {} as Record<string, any>)

  try {
    // 3. [重要修改] 使用 schema 来解析和验证转换后的数据
    const { file, overwrite } = await importSchema.parseAsync(dataToValidate)

    // 4. `file` 已经过验证，是一个 Buffer，现在可以安全地解析它
    const jsonContent = JSON.parse(file.toString())

    // 5. 调用核心业务逻辑
    const result = await importHoldingsData(jsonContent, overwrite, user.id)
    return { message: '导入完成', ...result }
  }
  catch (error) {
    // 处理 Zod 验证错误
    if (error instanceof z.ZodError) {
      // 返回第一个验证错误信息，对前端更友好
      throw createError({ statusCode: 400, statusMessage: error.message || '输入数据无效。' })
    }
    // 处理 JSON 解析错误
    if (error instanceof SyntaxError) {
      throw createError({ statusCode: 400, statusMessage: '无效的 JSON 文件，请检查文件内容。' })
    }

    // 处理其他未知错误
    console.error('导入时发生未知错误:', error)
    throw createError({ statusCode: 500, statusMessage: '服务器内部错误。' })
  }
})
