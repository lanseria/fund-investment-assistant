// GET /api/holidays/status — 节假日导入状态,供导航栏提醒徽标轮询
import { getHolidayStatus } from '~~/server/utils/holidayService'

export default defineEventHandler(() => {
  return getHolidayStatus()
})
