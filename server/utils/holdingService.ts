import { and, eq } from 'drizzle-orm'
import { funds, holdings } from '~~/server/database/schemas'
import { useDb } from '~~/server/utils/db'
import { HoldingExistsError, HoldingNotFoundError } from '~~/server/utils/errors'
import { findOrCreateFund, syncSingleFundEstimate, syncSingleFundHistory } from '~~/server/utils/fundService'

interface HoldingCreateData {
  code: string
  shares?: number | null
  costPrice?: number | null
  userId: number
  fundType: 'open' | 'qdii_lof'
}

/**
 * 为用户创建新的基金持仓
 */
export async function addHolding(data: HoldingCreateData) {
  const db = useDb()

  const existingHolding = await db.query.holdings.findFirst({
    where: and(
      eq(holdings.userId, data.userId),
      eq(holdings.fundCode, data.code),
    ),
  })
  if (existingHolding)
    throw new HoldingExistsError(data.code)

  // 调用 fundService 中的方法
  await findOrCreateFund(data.code, data.fundType)

  try {
    await syncSingleFundHistory(data.code)
  }
  catch (e) {
    console.error(`[AutoSync] 添加基金时自动同步历史数据失败 (${data.code}):`, e)
  }

  const newHoldingData = {
    userId: data.userId,
    fundCode: data.code,
    shares: data.shares ? String(data.shares) : null,
    costPrice: data.costPrice ? String(data.costPrice) : null,
  }

  const [result] = await db.insert(holdings).values(newHoldingData).returning()
  return result
}

/**
 * 更新用户持仓记录
 */
export async function updateHolding(userId: number, code: string, data: { shares?: number | null, costPrice?: number | null }) {
  const db = useDb()

  const [updatedHolding] = await db.update(holdings)
    .set({
      shares: data.shares !== undefined ? (data.shares ? String(data.shares) : null) : undefined,
      costPrice: data.costPrice !== undefined ? (data.costPrice ? String(data.costPrice) : null) : undefined,
    })
    .where(and(eq(holdings.userId, userId), eq(holdings.fundCode, code)))
    .returning()

  if (!updatedHolding)
    throw new HoldingNotFoundError(code)

  // 更新后刷新一下估值
  await syncSingleFundEstimate(code)

  return updatedHolding
}

/**
 * 删除用户持仓
 */
export async function deleteHolding(userId: number, code: string) {
  const db = useDb()
  const result = await db.delete(holdings).where(and(eq(holdings.userId, userId), eq(holdings.fundCode, code)))

  if (result.rowCount === 0)
    throw new HoldingNotFoundError(code)
}

/**
 * 清仓指定用户的持仓记录 (将份额和成本价设为 null)
 */
export async function clearHoldingPosition(userId: number, code: string) {
  const db = useDb()
  const [clearedHolding] = await db.update(holdings)
    .set({
      shares: null,
      costPrice: null,
    })
    .where(and(eq(holdings.userId, userId), eq(holdings.fundCode, code)))
    .returning()

  if (!clearedHolding)
    throw new HoldingNotFoundError(code)

  await syncSingleFundEstimate(code)

  return clearedHolding
}

/**
 * 导出指定用户的持仓数据
 */
export async function exportHoldingsData(userId: number) {
  const db = useDb()
  const userHoldings = await db.select({
    code: holdings.fundCode,
    shares: holdings.shares,
    costPrice: holdings.costPrice,
    fundType: funds.fundType,
  })
    .from(holdings)
    .leftJoin(funds, eq(holdings.fundCode, funds.code))
    .where(eq(holdings.userId, userId))

  return userHoldings.filter(h => h.fundType !== null)
}

/**
 * 导入持仓数据
 */
export async function importHoldingsData(dataToImport: { code: string, shares: number, costPrice: number, fundType?: 'open' | 'qdii_lof' }[], overwrite: boolean, userId: number) {
  const db = useDb()
  if (overwrite)
    await db.delete(holdings).where(eq(holdings.userId, userId))

  let importedCount = 0
  let skippedCount = 0

  for (const item of dataToImport) {
    if (!item.code || item.shares === undefined || item.costPrice === undefined) {
      skippedCount++
      continue
    }

    try {
      const fundType = item.fundType || 'open'
      const fund = await findOrCreateFund(item.code, fundType)
      if (!fund) {
        skippedCount++
        continue
      }

      await addHolding({
        code: item.code,
        shares: item.shares,
        costPrice: item.costPrice,
        userId,
        fundType,
      })
      importedCount++
    }
    catch (error) {
      if (error instanceof HoldingExistsError) {
        skippedCount++
      }
      else {
        console.error(`导入基金 ${item.code} 失败:`, error)
        skippedCount++
      }
    }
  }
  return { imported: importedCount, skipped: skippedCount }
}
