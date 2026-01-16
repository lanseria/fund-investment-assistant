import { relations } from 'drizzle-orm'
import { bigint, bigserial, boolean, date, integer, jsonb, numeric, pgSchema, primaryKey, real, text, timestamp, varchar } from 'drizzle-orm/pg-core'

// 使用 'fund_app' 作为 schema 名称
export const fundSchema = pgSchema('fund_app')

// 定义用户角色的枚举类型
export const userRoleEnum = fundSchema.enum('user_role', ['admin', 'user'])
// 定义基金类型的枚举
export const fundTypeEnum = fundSchema.enum('fund_type', ['open', 'qdii_lof'])
// [修改] 扩展交易类型，增加 convert_out 和 convert_in
export const transactionTypeEnum = fundSchema.enum('transaction_type', ['buy', 'sell', 'convert_out', 'convert_in'])
// 定义交易状态枚举 (目前只负责记录，后续逻辑会用到)
export const transactionStatusEnum = fundSchema.enum('transaction_status', ['pending', 'confirmed', 'failed'])
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
  /** 是否为 AI 代理账户 (用于自动化交易) */
  isAiAgent: boolean('is_ai_agent').default(false).notNull(),
  /** AI 模型名称 */
  aiModel: text('ai_model').default('xiaomi/mimo-v2-flash:free'),
  /** AI 操作的总资金体量 (用于 Prompt 上下文) */
  aiTotalAmount: numeric('ai_total_amount', { precision: 18, scale: 4 }).default('100000'),
  /** 自定义 System Prompt (如果为空则使用系统默认) */
  aiSystemPrompt: text('ai_system_prompt'),
  /** 用户总资产 (包含持仓市值和现金余额，用于准确计算收益率) */
  totalAssets: numeric('total_assets', { precision: 18, scale: 4 }).default('0').notNull(),
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
  /** 基金所属板块 (关联字典) */
  sector: text('sector'), // 允许为 null
  /** 基金类型 */
  fundType: fundTypeEnum('fund_type').notNull().default('open'),
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
  shares: numeric('shares', { precision: 18, scale: 4 }),
  /** 持仓成本价 (买入时的单位净值) */
  costPrice: numeric('cost_price', { precision: 10, scale: 4 }),
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
 * 字典类型表 (dictionary_types) - 主表
 * 定义了字典的类别，例如 '板块类型', '风险等级' 等
 */
export const dictionaryTypes = fundSchema.table('dictionary_types', {
  /** 字典类型编码 (主键, 程序中使用的唯一标识) */
  type: text('type').primaryKey(),
  /** 字典类型名称/描述 (UI中显示) */
  name: text('name').notNull(),
  /** 创建时间 */
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})

/**
 * 字典数据表 (dictionary_data) - 子表
 * 存储每个字典类型下的具体键值对数据
 */
export const dictionaryData = fundSchema.table('dictionary_data', {
  /** 数据项ID (主键, 自增) */
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  /** 关联的字典类型编码 (外键) */
  dictType: text('dict_type').notNull().references(() => dictionaryTypes.type, { onDelete: 'cascade' }),
  /** 标签名 (UI中显示的值) */
  label: text('label').notNull(),
  /** 数据值 (程序中使用的值) */
  value: text('value').notNull(),
  /** 排序字段 */
  sortOrder: integer('sort_order').default(0),
  /** 创建时间 */
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})

/**
 * 基金交易记录表 (fund_transactions)
 * 记录用户的买入和卖出操作
 */
export const fundTransactions = fundSchema.table('fund_transactions', {
  /** 交易ID */
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  /** 用户ID */
  userId: bigint('user_id', { mode: 'number' }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  /** 基金代码 */
  fundCode: varchar('fund_code', { length: 10 }).notNull().references(() => funds.code, { onDelete: 'cascade' }),
  /** 交易类型: buy (买入) / sell (卖出) */
  type: transactionTypeEnum('type').notNull(),
  /** 交易状态 */
  status: transactionStatusEnum('status').default('pending').notNull(),
  /**
   * 申报金额 (买入时必填)
   * 注意：卖出时通常按份额卖，但也可能有按金额卖出的情况(有些平台支持)，这里主要用于买入
   */
  orderAmount: numeric('order_amount', { precision: 18, scale: 4 }),
  /**
   * 申报份额 (卖出时必填)
   */
  orderShares: numeric('order_shares', { precision: 18, scale: 4 }),
  /**
   * 订单日期
   * 通常是操作当日，如果是15点后操作则归为下一个交易日。
   * 这里由前端或后端逻辑决定，暂存为日期类型。
   */
  orderDate: date('order_date').notNull(),
  /** 备注 */
  note: text('note'),
  /** 关联交易ID：用于基金转换，指向另一笔交易的ID */
  relatedId: bigint('related_id', { mode: 'number' }),
  /** 确认成交的净值 */
  confirmedNav: numeric('confirmed_nav', { precision: 10, scale: 4 }),
  /** 确认成交的份额 */
  confirmedShares: numeric('confirmed_shares', { precision: 18, scale: 4 }),
  /** 确认成交的金额 */
  confirmedAmount: numeric('confirmed_amount', { precision: 18, scale: 4 }),
  /** 确认时间 */
  confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
  /** 创建时间 */
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})

/**
 * 每日新闻表 (daily_news)
 * 存储 Webhook 推送的每日新闻汇总
 */
export const dailyNews = fundSchema.table('daily_news', {
  /** ID */
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  /** 新闻日期 (YYYY-MM-DD)，设置唯一约束以便于按日合并 */
  date: date('date').notNull().unique(),
  /** 标题 */
  title: text('title'),
  /** 新闻内容 (长文本) */
  content: text('content').notNull(),
  /** 创建时间 */
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  /** 更新时间 */
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
})

/**
 * AI 执行日志表 (ai_execution_logs)
 * 记录每次 AI 自动交易生成的 Prompt 和原始响应，用于调试和人工干预
 */
export const aiExecutionLogs = fundSchema.table('ai_execution_logs', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  /** 用户ID */
  userId: bigint('user_id', { mode: 'number' }).notNull().references(() => users.id, { onDelete: 'cascade' }),
  /** 执行日期 (YYYY-MM-DD) */
  date: date('date').notNull(),
  /** 发送给 AI 的完整 Prompt (System + User) */
  prompt: text('prompt').notNull(),
  /** AI 返回的原始 JSON 响应 */
  response: text('response').notNull(),
  /** 创建时间 */
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

// 定义字典主表和子表之间的关系
export const dictionaryTypesRelations = relations(dictionaryTypes, ({ many }) => ({
  data: many(dictionaryData),
}))

export const dictionaryDataRelations = relations(dictionaryData, ({ one }) => ({
  type: one(dictionaryTypes, {
    fields: [dictionaryData.dictType],
    references: [dictionaryTypes.type],
  }),
}))
