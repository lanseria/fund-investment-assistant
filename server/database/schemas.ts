import { bigint, bigserial, date, jsonb, numeric, pgEnum, pgSchema, primaryKey, real, text, timestamp, varchar } from 'drizzle-orm/pg-core'

// 使用 'fund_app' 作为 schema 名称，与原 Python 项目保持一致
export const fundSchema = pgSchema('fund_app')

export const userRoleEnum = pgEnum('user_role', ['admin', 'user'])
/**
 * [新增] 用户表
 */
export const users = fundSchema.table('users', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  username: text('username').notNull().unique(),
  password: text('password').notNull(),
  role: userRoleEnum('role').notNull().default('user'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})

/**
 * 持仓表 (my_holdings)
 * 存储用户的基金持仓核心数据
 */
export const holdings = fundSchema.table('my_holdings', {
  code: varchar('code', { length: 10 }).primaryKey(),
  userId: bigint('user_id', { mode: 'number' }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  shares: numeric('shares', { precision: 18, scale: 4 }).notNull(),
  yesterdayNav: numeric('yesterday_nav', { precision: 10, scale: 4 }).notNull(),
  holdingAmount: numeric('holding_amount', { precision: 12, scale: 2 }).notNull(),
  holdingProfitAmount: numeric('holding_profit_amount', { precision: 12, scale: 2 }),
  holdingProfitRate: real('holding_profit_rate'),
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

/**
 * [新增] 策略信号表 (strategy_signals)
 * 存储每日策略执行的结果
 */
export const strategySignals = fundSchema.table('strategy_signals', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  fundCode: varchar('fund_code', { length: 10 }).notNull(),
  strategyName: text('strategy_name').notNull(),
  signal: text('signal').notNull(), // '买入', '卖出', '持有/观望'
  reason: text('reason').notNull(),
  latestDate: date('latest_date').notNull(),
  latestClose: numeric('latest_close', { precision: 10, scale: 4 }).notNull(),
  metrics: jsonb('metrics').notNull(), // 存储策略的具体指标
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})
