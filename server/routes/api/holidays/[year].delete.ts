// DELETE /api/holidays/:year — 管理员删除某一年全部节假日数据
import { getUserFromEvent } from '~~/server/utils/auth'
import { deleteYearHolidays } from '~~/server/utils/holidayService'

export default defineEventHandler(async (event) => {
  const admin = getUserFromEvent(event)
  if (admin.role !== 'admin')
    throw createError({ status: 403, statusText: 'Forbidden: Admins only' })

  const year = Number(getRouterParam(event, 'year'))
  if (!Number.isInteger(year) || year < 2020 || year > 2100)
    throw createError({ status: 400, statusText: '无效的年份' })

  await deleteYearHolidays(year)
  return { deleted: year }
})
