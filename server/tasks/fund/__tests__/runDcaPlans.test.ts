import { afterEach, describe, expect, it, vi } from 'vitest'

// ============================================================
// import 被测模块(default export 触发 defineTask 捕获到 capturedTaskRef)
// ============================================================
import '../runDcaPlans'

// ============================================================
// 用 vi.hoisted 在所有 import 之前注入 Nitro 全局函数(模式同 processTransactions.test.ts):
// defineTask 捕获任务定义;db 模块用下方 vi.mock 返回 fake Drizzle 实例。
// ============================================================
const { capturedTaskRef, mockDb } = vi.hoisted(() => {
  const ref = { current: null as any }
  ;(globalThis as any).defineTask = (task: any) => {
    ref.current = task
    return task
  }
  ;(globalThis as any).useRuntimeConfig = () => ({ dbUrl: 'mock' })

  interface MockPlan {
    id: number
    userId: number
    fundCode: string
    amount: string
    frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly'
    anchorDay: number | null
    enabled: boolean
    nextExecutionDate: string
    lastExecutionDate: string | null
  }

  const data = {
    plans: [] as MockPlan[],
    inserted: [] as any[],
    planUpdates: [] as any[],
    failInsert: false,
  }

  // 今天的日期串(与任务内 format(new Date(), 'yyyy-MM-dd') 一致,受 vi.setSystemTime 控制)
  const todayStr = () => {
    const d = new Date()
    const p = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
  }

  // 事务句柄桩:insert 记录买入单;update 把 set 值记录并写回数据池
  // (近似真实 SQL 的单计划场景,便于重跑幂等断言)
  const trx = {
    insert: (_t: any) => ({
      values: async (vals: any) => {
        if (data.failInsert)
          throw new Error('mock insert failure')
        data.inserted.push(vals)
      },
    }),
    update: (_t: any) => ({
      set: (vals: any) => ({
        where: async (_cond: any) => {
          data.planUpdates.push(vals)
          for (const plan of data.plans)
            Object.assign(plan, vals)
        },
      }),
    }),
  }

  const db = {
    query: {
      dcaPlans: {
        // where 条件不解析(结构随版本变化),按语义过滤: enabled 且 nextExecutionDate <= 今天
        findMany: async () => data.plans.filter(p => p.enabled && p.nextExecutionDate <= todayStr()),
      },
    },
    transaction: async (fn: (executor: any) => Promise<unknown>) => fn(trx),
  }

  return { capturedTaskRef: ref, mockDb: { data, db } }
})

vi.mock('~~/server/utils/db', () => ({
  useDb: () => mockDb.db,
}))

const getTask = () => capturedTaskRef.current

/** 重置数据池 */
function resetData(plans: any[] = []) {
  mockDb.data.plans = plans
  mockDb.data.inserted = []
  mockDb.data.planUpdates = []
  mockDb.data.failInsert = false
}

/** 把系统时间拨到指定本地日期(凌晨,规避跨日边界) */
function atLocal(y: number, m: number, d: number) {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(y, m - 1, d, 2, 45) })
}

afterEach(() => {
  vi.useRealTimers()
})

function makePlan(over: Partial<any> = {}) {
  return {
    id: 1,
    userId: 1,
    fundCode: '001111',
    amount: '500.0000',
    frequency: 'weekly',
    anchorDay: 1,
    enabled: true,
    nextExecutionDate: '2026-09-22',
    lastExecutionDate: null,
    ...over,
  }
}

describe('fund:runDcaPlans (定投执行任务)', () => {
  it('非交易日跳过,不生成买入单', async () => {
    atLocal(2026, 10, 1) // 国庆假期
    resetData([makePlan()])
    const result = await getTask().run()
    expect(String(result.result)).toContain('非交易日')
    expect(mockDb.data.inserted).toHaveLength(0)
    expect(mockDb.data.planUpdates).toHaveLength(0)
  })

  it('到期计划生成 pending 买入单并推进到下一期', async () => {
    atLocal(2026, 9, 22) // 周二
    resetData([makePlan({ frequency: 'weekly', anchorDay: 1 })])
    const result = await getTask().run()

    expect(result.executed).toBe(1)
    expect(mockDb.data.inserted).toHaveLength(1)
    const tx = mockDb.data.inserted[0]
    expect(tx.userId).toBe(1)
    expect(tx.fundCode).toBe('001111')
    expect(tx.type).toBe('buy')
    expect(tx.status).toBe('pending')
    expect(tx.orderAmount).toBe('500.0000')
    expect(tx.orderDate).toBe('2026-09-22')
    expect(tx.note).toContain('定投')

    // 下期: 下周一 09-28;lastExecutionDate 记录今天
    expect(mockDb.data.planUpdates[0].nextExecutionDate).toBe('2026-09-28')
    expect(mockDb.data.planUpdates[0].lastExecutionDate).toBe('2026-09-22')
  })

  it('monthly 计划: 锚点日撞节假日时下期顺延', async () => {
    atLocal(2026, 9, 22)
    resetData([makePlan({ frequency: 'monthly', anchorDay: 25 })])
    const result = await getTask().run()

    expect(result.executed).toBe(1)
    expect(mockDb.data.inserted[0].note).toContain('每月25日')
    // 本应 09-25(五),恰逢中秋假期 → 顺延 09-28(一)
    expect(mockDb.data.planUpdates[0].nextExecutionDate).toBe('2026-09-28')
  })

  it('daily 计划: 下期为下一交易日,遇节假日顺延', async () => {
    atLocal(2026, 9, 24) // 周四,次日 09-25 为中秋假期起点
    resetData([makePlan({ frequency: 'daily', anchorDay: null, nextExecutionDate: '2026-09-24' })])
    const result = await getTask().run()

    expect(result.executed).toBe(1)
    expect(mockDb.data.inserted[0].note).toContain('每天')
    // 09-25(五) 起为中秋假期 → 顺延 09-28(一)
    expect(mockDb.data.planUpdates[0].nextExecutionDate).toBe('2026-09-28')
  })

  it('未到期与已停用的计划跳过', async () => {
    atLocal(2026, 9, 22)
    resetData([
      makePlan({ id: 2, nextExecutionDate: '2026-09-25' }),
      makePlan({ id: 3, enabled: false }),
    ])
    const result = await getTask().run()

    expect(result.executed).toBe(0)
    expect(mockDb.data.inserted).toHaveLength(0)
    expect(mockDb.data.planUpdates).toHaveLength(0)
  })

  it('同一天重跑幂等: 计划已推进,不会重复下单', async () => {
    atLocal(2026, 9, 22)
    resetData([makePlan()])
    await getTask().run()
    expect(mockDb.data.inserted).toHaveLength(1)

    const second = await getTask().run()
    expect(second.executed).toBe(0)
    expect(mockDb.data.inserted).toHaveLength(1)
  })

  it('单计划插入失败回滚事务,不影响其他计划与计划推进', async () => {
    atLocal(2026, 9, 22)
    resetData([makePlan({ id: 4, fundCode: '222222' })])
    mockDb.data.failInsert = true
    const result = await getTask().run()

    expect(result.executed).toBe(0)
    expect(result.failed).toBe(1)
    // 事务回滚: 计划未被推进
    expect(mockDb.data.planUpdates).toHaveLength(0)
    expect(mockDb.data.plans[0]!.nextExecutionDate).toBe('2026-09-22')
  })
})
