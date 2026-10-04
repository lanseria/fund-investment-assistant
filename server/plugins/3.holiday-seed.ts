// server/plugins/3.holiday-seed.ts
// 启动时检查 market_holidays 表: 首次部署 (表为空) 时初始化 2026 年数据,
// 让从硬编码时代升级的部署无缝衔接。运行时交易日判定只读数据库,
// 此处的种子数据不参与任何兜底逻辑;之后各年数据由管理员导入。
/* eslint-disable no-console */
import { count } from 'drizzle-orm'
import { marketHolidays } from '~~/server/database/schemas'
import { useDb } from '~~/server/utils/db'

/** 2026 年国务院公布的休市安排 (仅用于首次部署种子) */
const HOLIDAYS_2026_SEED = [
  { name: '元旦', startDate: '2026-01-01', endDate: '2026-01-03' },
  { name: '春节', startDate: '2026-02-15', endDate: '2026-02-23' },
  { name: '清明节', startDate: '2026-04-04', endDate: '2026-04-06' },
  { name: '劳动节', startDate: '2026-05-01', endDate: '2026-05-05' },
  { name: '端午节', startDate: '2026-06-19', endDate: '2026-06-21' },
  { name: '中秋节', startDate: '2026-09-25', endDate: '2026-09-27' },
  { name: '国庆节', startDate: '2026-10-01', endDate: '2026-10-07' },
]

export default defineNitroPlugin(async () => {
  try {
    const db = useDb()
    const [{ value: existing = 0 } = { value: 0 }] = await db.select({ value: count() }).from(marketHolidays)
    if (existing > 0)
      return

    await db.insert(marketHolidays).values(
      HOLIDAYS_2026_SEED.map(h => ({ year: 2026, ...h })),
    )
    console.log(`[HolidaySeed] market_holidays 表为空,已初始化 ${HOLIDAYS_2026_SEED.length} 条 2026 年节假日数据`)
  }
  catch (e: any) {
    // 表尚未创建 (迁移未执行) 时仅告警不阻断启动
    console.warn(`[HolidaySeed] 节假日数据初始化跳过: ${e?.message ?? e} (若尚未执行数据库迁移请先运行 pnpm db:migrate)`)
  }
})
