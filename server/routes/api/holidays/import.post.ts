// POST /api/holidays/import — 管理员整年导入法定节假日 (替换式)
//
// 请求体格式 (可直接粘贴由 AI 生成的数据,详见页面内"AI 提示词"):
// {
//   "year": 2027,
//   "holidays": [
//     { "name": "元旦", "start": "2027-01-01", "end": "2027-01-03" },
//     { "name": "春节", "start": "2027-02-05", "end": "2027-02-11" }
//   ]
// }
import { z } from 'zod'
import { getUserFromEvent } from '~~/server/utils/auth'
import { importYearHolidays } from '~~/server/utils/holidayService'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const importSchema = z.object({
  year: z.number({ message: 'year 必须为整数' }).int().min(2020).max(2100),
  holidays: z.array(z.object({
    name: z.string().trim().min(1, '假期名称不能为空'),
    start: z.string().regex(DATE_RE, '日期格式必须为 YYYY-MM-DD'),
    end: z.string().regex(DATE_RE, '日期格式必须为 YYYY-MM-DD'),
  }).refine(h => h.start <= h.end, { message: '开始日期不能晚于结束日期' })).min(1, 'holidays 不能为空'),
}).refine(
  p => p.holidays.every(h => h.start.startsWith(`${p.year}-`) && h.end.startsWith(`${p.year}-`)),
  { message: '所有日期都必须属于导入的年份' },
)

export default defineEventHandler(async (event) => {
  const admin = getUserFromEvent(event)
  if (admin.role !== 'admin')
    throw createError({ status: 403, statusText: 'Forbidden: Admins only' })

  const body = await readBody(event)
  try {
    const data = await importSchema.parseAsync(body)
    const count = await importYearHolidays(data)
    return { year: data.year, imported: count }
  }
  catch (error) {
    if (error instanceof z.ZodError) {
      throw createError({ status: 400, statusText: error.issues[0]?.message || '导入数据格式无效' })
    }
    throw error
  }
})
