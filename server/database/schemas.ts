import { relations } from 'drizzle-orm'
import { bigint, bigserial, date, jsonb, numeric, pgEnum, pgSchema, primaryKey, real, text, timestamp, varchar } from 'drizzle-orm/pg-core'

// 使用 'fund_app' 作为 schema 名称
export const fundSchema = pgSchema('fund_app')

// 定义用户角色的枚举类型
export const userRoleEnum = pgEnum('user_role', ['admin', 'user'])

/**
 * 用户表 (users)
 * 存储应用的用户信息
 */
export const users = fundSchema.table('users', {
  /** 用户ID (主键, 自增) */
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  /** 用户名 (唯一) */
  username: text('username').notNull().unique(),
  /** 用户密码 (经过哈希处理) */
  password: text('password').notNull(),
  /** 用户角色 ('admin' 或 'user') */
  role: userRoleEnum('role').notNull().default('user'),
  /** 用户创建时间 */
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})

/**
 * 基金信息表 (funds)
 * 存储所有基金的公共信息，与用户无关
 */
export const funds = fundSchema.table('funds', {
  /** 基金代码 (主键) */
  code: varchar('code', { length: 10 }).primaryKey(),
  /** 基金名称 */
  name: text('name').notNull(),
  /** 昨日单位净值 */
  yesterdayNav: numeric('yesterday_nav', { precision: 10, scale: 4 }).notNull(),
  /** 今日估算净值 */
  todayEstimateNav: real('today_estimate_nav'),
  /** 今日估算涨跌幅 (%) */
  percentageChange: real('percentage_change'),
  /** 估值更新时间 */
  todayEstimateUpdateTime: timestamp('today_estimate_update_time', { withTimezone: true }),
})

/**
 * 用户持仓表 (holdings)
 * 存储用户与基金的关联关系及个人持仓数据
 */
export const holdings = fundSchema.table('holdings', {
  /** 用户ID (复合主键之一, 外键关联 users 表) */
  userId: bigint('user_id', { mode: 'number' }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  /** 基金代码 (复合主键之一, 外键关联 funds 表) */
  fundCode: varchar('fund_code', { length: 10 }).notNull().references(() => funds.code, { onDelete: 'cascade' }),
  /** 持有份额 */
  shares: numeric('shares', { precision: 18, scale: 4 }).notNull(),
  /** 持有总盈亏金额 */
  // holdingProfitAmount: numeric('holding_profit_amount', { precision: 12, scale: 2 }),
  /** 持有总盈亏率 (%) */
  holdingProfitRate: real('holding_profit_rate'),
}, (table) => {
  return {
    /** 使用 用户ID 和 基金代码 创建复合主键，确保一个用户对一个基金只能有一条持仓记录 */
    pk: primaryKey({ columns: [table.userId, table.fundCode] }),
  }
})

/**
 * 基金历史净值表 (fund_nav_history)
 * 存储所有基金的历史净值数据，为全局共享数据
 */
export const navHistory = fundSchema.table('fund_nav_history', {
  /** 基金代码 */
  code: varchar('code', { length: 10 }).notNull(),
  /** 净值日期 */
  navDate: date('nav_date').notNull(),
  /** 当日单位净值 */
  nav: numeric('nav', { precision: 10, scale: 4 }).notNull(),
}, (table) => {
  return {
    /** 使用基金代码和净值日期创建复合主键，确保唯一性 */
    pk: primaryKey({ columns: [table.code, table.navDate] }),
  }
})

/**
 * 策略信号表 (strategy_signals)
 * 存储每日策略分析执行的结果
 */
export const strategySignals = fundSchema.table('strategy_signals', {
  /** 信号ID (主键, 自增) */
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  /** 基金代码 */
  fundCode: varchar('fund_code', { length: 10 }).notNull(),
  /** 策略名称 (如 'rsi', 'macd' 等) */
  strategyName: text('strategy_name').notNull(),
  /** 信号类型 (如 '买入', '卖出', '持有/观望') */
  signal: text('signal').notNull(),
  /** 信号生成的原因描述 */
  reason: text('reason').notNull(),
  /** 信号对应的最新数据日期 */
  latestDate: date('latest_date').notNull(),
  /** 信号对应日期的收盘价 (即单位净值) */
  latestClose: numeric('latest_close', { precision: 10, scale: 4 }).notNull(),
  /** 存储策略相关的具体指标 (JSONB格式，例如RSI值、MA值等) */
  metrics: jsonb('metrics').notNull(),
  /** 信号记录的创建时间 */
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})

/**
 * 持有与基金关联
 * 基金 一对多 持有
 */
export const fundsRelations = relations(holdings, ({ one }) => ({
  fund: one(funds, {
    fields: [holdings.fundCode],
    references: [funds.code],
  }),
}))
