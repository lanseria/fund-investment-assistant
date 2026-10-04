// GET /api/holidays — 全部法定节假日 (按年分组,降序),供管理页与定投扣款日预览使用
import { getAllHolidays } from '~~/server/utils/holidayService'

export default defineEventHandler(() => {
  return getAllHolidays()
})
