import { date, numeric, pgSchema, primaryKey, real, text, timestamp, varchar } from 'drizzle-orm/pg-core'

// 使用 'fund_app' 作为 schema 名称，与原 Python 项目保持一致
export const fundSchema = pgSchema('fund_app')

/**
 * 持仓表 (my_holdings)
 * 存储用户的基金持仓核心数据
 */
export const holdings = fundSchema.table('my_holdings', {
  code: varchar('code', { length: 10 }).primaryKey(),
  name: text('name').notNull(),
  shares: numeric('shares', { precision: 18, scale: 4 }).notNull(),
  yesterdayNav: numeric('yesterday_nav', { precision: 10, scale: 4 }).notNull(),
  holdingAmount: numeric('holding_amount', { precision: 12, scale: 2 }).notNull(),
  todayEstimateNav: real('today_estimate_nav'),
  todayEstimateAmount: numeric('today_estimate_amount', { precision: 12, scale: 2 }),
  percentageChange: real('percentage_change'),
  todayEstimateUpdateTime: timestamp('today_estimate_update_time', { withTimezone: true }),
})

/**
 * 基金历史净值表 (fund_nav_history)
 */
export const navHistory = fundSchema.table('fund_nav_history', {
  code: varchar('code', { length: 10 }).notNull(),
  navDate: date('nav_date').notNull(),
  nav: numeric('nav', { precision: 10, scale: 4 }).notNull(),
}, (table) => {
  return {
    pk: primaryKey({ columns: [table.code, table.navDate] }),
  }
})
