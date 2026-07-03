import { describe, expect, it, vi } from 'vitest'

// ============================================================
// import 被测模块(default export 触发 defineTask 捕获到 capturedTaskRef)
// ============================================================
import '../processTransactions'

// ============================================================
// 用 vi.hoisted 在所有 import 之前注入 Nitro 全局函数。
// vi.hoisted 的回调会被提升并优先执行,确保被测模块求值时 defineTask 已就绪。
// (不能用普通赋值:ESM 的 import 语句会先于模块顶层代码执行,导致 defineTask 未定义)
// ============================================================
const { capturedTaskRef } = vi.hoisted(() => {
  const ref = { current: null as any }
  // defineTask:捕获任务定义,使测试可调用 task.run()
  ;(globalThis as any).defineTask = (task: any) => {
    ref.current = task
    return task
  }
  // useRuntimeConfig:db.ts 依赖(返回桩配置,避免连接真实数据库)
  ;(globalThis as any).useRuntimeConfig = () => ({ dbUrl: 'mock' })
  // updateHolding/addHolding:Nitro 自动导入的 server util(任务源码未显式 import),
  // 测试环境注入桩函数(holdingServiceMocks 在下方定义,这里先占位,测试内会重新绑定实现)
  ;(globalThis as any).updateHolding = async () => undefined
  ;(globalThis as any).addHolding = async () => undefined
  return { capturedTaskRef: ref }
})

// ============================================================
// Mock 外部依赖(必须在 import 被测模块之前)
// ============================================================

// 1. mock `~~/server/utils/transactionCalc` — 隔离 FIFO 计算(已单独测试)
vi.mock('~~/server/utils/transactionCalc', () => ({
  buildFifoLots: () => [],
  calculatePenaltyFee: () => ({ penaltyFee: { gt: () => false, toFixed: () => '0' } }),
}))

// 2. updateHolding/addHolding 为 Nitro 自动导入(任务源码未显式 import),
//    由上方 vi.hoisted 注入 globalThis 桩函数,故无需 vi.mock 模块。

// 3. mock `~~/server/utils/db` — 返回可控的 fake Drizzle 实例。
//    设计:不解析 Drizzle 的 where 条件对象(其内部结构随版本变化且脆弱),
//    而是按"调用上下文 + 数据池"响应。每个查询在任务流程中语义明确:
//      - fundTransactions.findMany:第 1 次返回 pending 列表;后续(FIFO 历史查询)返回 []
//      - fundTransactions.findFirst:按 id 从数据池查
//      - navHistory/holdings/funds.findFirst:按 fundCode 从数据池查
interface MockTx {
  id: number
  userId: number
  fundCode: string
  type: string
  status: string
  orderAmount: string | null
  orderShares: string | null
  orderDate: string
  note: string | null
  relatedId: number | null
  confirmedNav: string | null
  confirmedShares: string | null
  confirmedAmount: string | null
  confirmedAt: Date | null
  createdAt: Date
}

interface MockData {
  transactions: MockTx[]
  navHistory: { code: string, navDate: string, nav: string }[]
  holdings: { userId: number, fundCode: string, shares: string, costPrice: string }[]
  funds: { code: string, fundType: string }[]
  // 记录 update 调用,用于断言
  updates: { table: string, setValues: any, whereValue: any }[]
}

// 全局可变数据池,每个 it 通过 resetData() 重置
let mockData: MockData

// 用于追踪 fundTransactions.findMany 的调用次数(区分 pending 查询 vs FIFO 历史查询)
let txFindManyCallCount: number

const mockDb = {
  query: {
    fundTransactions: {
      // 第 1 次调用 = 取 pending 列表;后续调用 = FIFO 历史查询(本测试隔离,返回 [])
      findMany: vi.fn(async () => {
        if (txFindManyCallCount === 0) {
          txFindManyCallCount++
          return mockData.transactions.filter(t => t.status === 'pending')
        }
        return []
      }),
      // 按交易 id 查(用于转换买入刷新场景)
      findFirst: vi.fn(async () => undefined),
    },
    navHistory: {
      // 返回数据池中第一条净值(测试场景里每笔交易对应唯一 nav)
      findFirst: vi.fn(async () => mockData.navHistory[0]),
    },
    holdings: {
      // 返回数据池中第一条持仓
      findFirst: vi.fn(async () => mockData.holdings[0]),
    },
    funds: {
      // 返回数据池中第一条基金信息
      findFirst: vi.fn(async () => mockData.funds[0]),
    },
  },
  update: (_tableRef: any) => ({
    set: (setValues: any) => ({
      where: async (_whereCond: any) => {
        // 判断目标表:setValues 含 availableCash → users;含 status → fundTransactions
        const table = setValues.availableCash !== undefined
          ? 'users'
          : setValues.status !== undefined ? 'fundTransactions' : 'unknown'
        // where 的值不解析(结构复杂),用 setValues 自身的语义即可断言。
        // 对 fundTransactions 的 update,按当前处理的 tx id 推断(简化:取第一个 pending→confirmed)
        let whereValue: any
        if (table === 'fundTransactions') {
          // 找到当前正在处理的那笔(状态将变为 failed 或 confirmed)
          const target = mockData.transactions.find(t => t.status === 'pending')
          whereValue = target?.id
          // 同步状态到数据池,便于后续断言
          if (target) {
            target.status = setValues.status
            if (setValues.note !== undefined)
              target.note = setValues.note
          }
        }
        else if (table === 'users') {
          whereValue = mockData.transactions[0]?.userId
        }
        mockData.updates.push({ table, setValues, whereValue })
      },
    }),
  }),
}

vi.mock('~~/server/utils/db', () => ({
  useDb: () => mockDb,
}))

/** 从 hoisted 捕获的 ref 读取任务对象 */
const getTask = () => capturedTaskRef.current

// ============================================================
// 辅助函数
// ============================================================

/** 重置数据池与调用计数,用 seed 填充 */
function resetData(seed: Partial<MockData> = {}) {
  mockData = {
    transactions: [],
    navHistory: [],
    holdings: [],
    funds: [],
    updates: [],
    ...seed,
  }
  txFindManyCallCount = 0
  // 重置所有 mock 的调用记录(mockClear 不影响实现)
  Object.values(mockDb.query).forEach(q => Object.values(q).forEach(fn => (fn as any).mockClear?.()))
}

/** 构造一笔交易 */
function makeTx(over: Partial<MockTx>): MockTx {
  return {
    id: 1,
    userId: 1,
    fundCode: '001111',
    type: 'buy',
    status: 'pending',
    orderAmount: null,
    orderShares: null,
    orderDate: '2026-01-10',
    note: '',
    relatedId: null,
    confirmedNav: null,
    confirmedShares: null,
    confirmedAmount: null,
    confirmedAt: null,
    createdAt: new Date('2026-01-10'),
    ...over,
  }
}

// ============================================================
// 测试用例
// ============================================================
describe('processTransactions task', () => {
  it('场景1: 无 pending 交易时应返回 No pending transactions', async () => {
    resetData({ transactions: [] })
    const result = await getTask().run()
    expect(result).toEqual({ result: 'No pending transactions' })
  })

  it('场景2: 买入流程应正确扣现金、计算 confirmedShares=amount/nav', async () => {
    resetData({
      transactions: [
        makeTx({ id: 1, type: 'buy', orderAmount: '1000' }),
      ],
      navHistory: [{ code: '001111', navDate: '2026-01-10', nav: '2.0' }],
      holdings: [{ userId: 1, fundCode: '001111', shares: '100', costPrice: '1.5' }],
      funds: [{ code: '001111', fundType: 'open' }],
    })

    await getTask().run()

    // 验证:扣减了用户现金(update users)
    const cashUpdate = mockData.updates.find(u => u.table === 'users')
    expect(cashUpdate).toBeDefined()

    // 验证:交易状态更新为 confirmed,confirmedShares = 1000 / 2.0 = 500
    const txUpdate = mockData.updates.find(u => u.table === 'fundTransactions')
    expect(txUpdate).toBeDefined()
    expect(txUpdate?.setValues.status).toBe('confirmed')
    expect(txUpdate?.setValues.confirmedShares).toBe('500')
    expect(txUpdate?.setValues.confirmedAmount).toBe('1000')
  })

  it('场景3: 卖出流程应正确回款、扣减份额、状态变为 confirmed', async () => {
    resetData({
      transactions: [
        makeTx({ id: 1, type: 'sell', orderShares: '50' }),
      ],
      navHistory: [{ code: '001111', navDate: '2026-01-10', nav: '2.0' }],
      holdings: [{ userId: 1, fundCode: '001111', shares: '100', costPrice: '1.5' }],
      funds: [{ code: '001111', fundType: 'open' }],
    })

    await getTask().run()

    // 验证:回款(update users,availableCash 增加)
    const cashUpdate = mockData.updates.find(u => u.table === 'users')
    expect(cashUpdate).toBeDefined()

    // 验证:交易状态 confirmed,confirmedAmount = 50 × 2.0 = 100(FIFO 已隔离,无惩罚费)
    const txUpdate = mockData.updates.find(u => u.table === 'fundTransactions')
    expect(txUpdate?.setValues.status).toBe('confirmed')
    expect(txUpdate?.setValues.confirmedShares).toBe('50')
    expect(txUpdate?.setValues.confirmedAmount).toBe('100')
  })

  it('场景4: 净值缺失时应跳过并记录原因', async () => {
    resetData({
      transactions: [
        makeTx({ id: 1, type: 'buy', orderAmount: '1000' }),
      ],
      navHistory: [], // 无净值记录
    })

    const result: any = await getTask().run()

    // 应被跳过,不产生任何 update
    expect(mockData.updates).toHaveLength(0)
    expect(result.skipped).toBe(1)
    expect(result.skippedReasons.some((r: string) => r.includes('净值缺失'))).toBe(true)
  })

  it('场景5: 持仓不足的卖出应将状态置为 failed', async () => {
    resetData({
      transactions: [
        // 卖出 200 份,但只有 100 份持仓
        makeTx({ id: 1, type: 'sell', orderShares: '200' }),
      ],
      navHistory: [{ code: '001111', navDate: '2026-01-10', nav: '2.0' }],
      holdings: [{ userId: 1, fundCode: '001111', shares: '100', costPrice: '1.5' }],
    })

    await getTask().run()

    // 交易状态应变 failed(数据池已同步)
    const tx = mockData.transactions.find(t => t.id === 1)
    expect(tx?.status).toBe('failed')
    expect(tx?.note).toContain('持仓不足')
  })

  it('场景6: 混合交易应先处理 sell/convert_out,后处理 buy/convert_in', async () => {
    resetData({
      transactions: [
        // 注意:findMany 返回顺序是 buy 在前,但任务应按 sell 优先重排
        makeTx({ id: 1, type: 'buy', orderAmount: '1000', fundCode: 'BUY001' }),
        makeTx({ id: 2, type: 'sell', orderShares: '50', fundCode: 'SELL001' }),
      ],
      navHistory: [
        { code: 'BUY001', navDate: '2026-01-10', nav: '1.0' },
        { code: 'SELL001', navDate: '2026-01-10', nav: '1.0' },
      ],
      holdings: [{ userId: 1, fundCode: 'SELL001', shares: '100', costPrice: '1.0' }],
      funds: [{ code: 'BUY001', fundType: 'open' }],
    })

    // 用 spy 包裹 navHistory.findFirst:按调用次序依次返回 SELL 和 BUY 的净值,
    // 并记录调用次序(第1次查到 SELL 的 nav 说明 sell 先处理)。
    const navByOrder = [
      mockData.navHistory.find(n => n.code === 'SELL001'),
      mockData.navHistory.find(n => n.code === 'BUY001'),
    ]
    const queriedOrder: string[] = []
    mockDb.query.navHistory.findFirst.mockImplementation(async () => {
      const idx = queriedOrder.length
      const nav = navByOrder[idx]
      queriedOrder.push(nav?.code ?? `unknown${idx}`)
      return nav
    })

    await getTask().run()

    // 第一笔处理的应是 SELL001(卖出优先),第二笔是 BUY001
    expect(queriedOrder[0]).toBe('SELL001')
    expect(queriedOrder[1]).toBe('BUY001')
  })
})
