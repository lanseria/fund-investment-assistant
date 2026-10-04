import { afterEach, describe, expect, it, vi } from 'vitest'

// holidayService 持有模块级缓存,每个用例 resetModules 后重新 import 拿全新实例
async function freshService() {
  vi.resetModules()
  return await import('../holidayService')
}

interface MockRow { id: number, year: number, name: string, startDate: string, endDate: string }

const { mockDb } = vi.hoisted(() => {
  const data = {
    rows: [] as MockRow[],
    ops: [] as string[], // 记录 delete / insert 调用顺序
  }

  // 链式桩。import 是 delete(年份)+insert(同年新行) 两步,
  // mock 在 insert 时清理同年旧行,再现 service 依赖的"整年替换"结果语义
  const db = {
    select: () => ({
      from: () => ({
        orderBy: async () => [...data.rows].sort((a, b) =>
          a.year - b.year || a.startDate.localeCompare(b.startDate)),
      }),
    }),
    delete: () => ({ where: async () => { data.ops.push('delete') } }),
    insert: () => ({
      values: async (vals: any[]) => {
        data.ops.push('insert')
        const years = new Set<number>(vals.map(v => v.year))
        data.rows = data.rows.filter(r => !years.has(r.year))
        data.rows.push(...vals.map((v, i) => ({ id: data.rows.length + i + 1, ...v })))
      },
    }),
    transaction: async (fn: (trx: any) => Promise<unknown>) => fn(db),
  }

  return { mockDb: { data, db } }
})

vi.mock('~~/server/utils/db', () => ({
  useDb: () => mockDb.db,
}))

/** 预置数据库行 */
function seedRows(rows: Omit<MockRow, 'id'>[]) {
  mockDb.data.rows = rows.map((r, i) => ({ id: i + 1, ...r }))
}

afterEach(() => {
  vi.useRealTimers()
})

describe('holidayService', () => {
  it('dB 为空时 getHolidayRanges 返回空列表 (仅按周末判定,无内置兜底)', async () => {
    seedRows([])
    const svc = await freshService()

    expect(await svc.getHolidayRanges()).toEqual([])

    const status = await svc.getHolidayStatus()
    expect(status.missingCurrentYear).toBe(true) // 当年数据缺失 → 提醒
  })

  it('dB 有数据时 ranges 来自数据库', async () => {
    seedRows([
      { year: 2026, name: '元旦', startDate: '2026-01-01', endDate: '2026-01-03' },
    ])
    const svc = await freshService()

    expect(await svc.getHolidayRanges()).toEqual([['2026-01-01', '2026-01-03']])
    expect((await svc.getHolidayStatus()).years).toEqual([2026])
  })

  it('importYearHolidays 整年替换并立即刷新缓存', async () => {
    seedRows([
      { year: 2027, name: '元旦', startDate: '2027-01-01', endDate: '2027-01-02' },
    ])
    const svc = await freshService()

    // 先加载一次缓存,验证导入后缓存失效
    await svc.getHolidayRanges()

    const count = await svc.importYearHolidays({
      year: 2027,
      holidays: [
        { name: '元旦', start: '2027-01-01', end: '2027-01-03' },
        { name: '春节', start: '2027-02-05', end: '2027-02-11' },
      ],
    })
    expect(count).toBe(2)
    expect(mockDb.data.ops).toEqual(['delete', 'insert'])

    // 旧区间被替换,缓存读到新数据
    const ranges = await svc.getHolidayRanges()
    expect(ranges).toEqual([['2027-01-01', '2027-01-03'], ['2027-02-05', '2027-02-11']])
    expect(await svc.hasYearHolidays(2027)).toBe(true)
  })

  it('12 月未导入次年数据时 missingNextYear 为 true,11 月不提醒', async () => {
    seedRows([{ year: 2026, name: '元旦', startDate: '2026-01-01', endDate: '2026-01-03' }])
    const svc = await freshService()

    vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 11, 15, 10, 0) })
    let status = await svc.getHolidayStatus()
    expect(status.missingNextYear).toBe(true)
    expect(status.nextYear).toBe(2027)

    vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 10, 15, 10, 0) })
    status = await svc.getHolidayStatus()
    expect(status.missingNextYear).toBe(false)
  })
})
