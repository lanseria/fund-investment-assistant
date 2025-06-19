import { z } from 'zod'
import { importHoldingsData } from '~~/server/utils/holdings'

const fileSchema = z.object({
  file: z.any(), // In a real scenario, you'd handle file uploads more robustly
  overwrite: z.preprocess(val => val === 'true', z.boolean()),
})

export default defineEventHandler(async (event) => {
  // Nitro's readMultipartFormData handles form data
  const formData = await readMultipartFormData(event)
  if (!formData)
    throw createError({ statusCode: 400, statusMessage: 'Multipart form data is required.' })

  const fileEntry = formData.find(entry => entry.name === 'file')
  const overwriteEntry = formData.find(entry => entry.name === 'overwrite')

  if (!fileEntry || !fileEntry.data)
    throw createError({ statusCode: 400, statusMessage: 'File is required.' })

  try {
    const jsonContent = JSON.parse(fileEntry.data.toString())
    const overwrite = overwriteEntry?.data.toString() === 'true'

    const result = await importHoldingsData(jsonContent, overwrite)
    return { message: '导入完成', ...result }
  }
  catch (e) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid JSON file.' })
  }
})
