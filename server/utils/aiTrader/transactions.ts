import type { TradeDecision } from './schemas'

/** AI 决策 → 可入库交易行的映射与配对兜底（纯函数,便于单元测试）。 */

/**
 * 基金转换配对兜底：确保每个 convert_out 都有对应的 convert_in，反之亦然。
 * - convert_out 必须出现在 convert_in 之前（relatedIndex 引用约束）。
 * - 孤立的 convert_in：直接剔除（现金开仓应使用 buy）。
 * - 孤立的 convert_out：直接剔除（避免下游因 relatedIndex 无效抛 400）。
 * - 缺失或无效的 relatedIndex：自动回填到最近一个尚未配对的 convert_out。
 */
export function enforceConvertPairs(actions: TradeDecision[]): TradeDecision[] {
  const result: TradeDecision[] = []
  // 记录 result 中尚未被 convert_in 引用的 convert_out 索引
  const unmatchedOuts: number[] = []

  for (const action of actions) {
    if (action.action === 'convert_out') {
      result.push({ ...action, relatedIndex: null })
      unmatchedOuts.push(result.length - 1)
    }
    else if (action.action === 'convert_in') {
      // 优先采用 AI 给出的 relatedIndex，否则回填最近一个未配对的 convert_out
      let targetIdx = action.relatedIndex ?? null
      if (targetIdx === null || targetIdx < 0 || targetIdx >= result.length
        || result[targetIdx]!.action !== 'convert_out') {
        targetIdx = unmatchedOuts.length > 0 ? unmatchedOuts.shift()! : null
      }
      else {
        // 从未配对列表中移除被引用的索引（保持其余项仍可回填）
        const pos = unmatchedOuts.indexOf(targetIdx)
        if (pos >= 0)
          unmatchedOuts.splice(pos, 1)
      }

      if (targetIdx === null) {
        console.warn(`[AI Trader] 剔除孤立的 convert_in: ${action.fundCode}（无对应 convert_out，应使用 buy）`)
        continue
      }
      result.push({ ...action, relatedIndex: targetIdx })
    }
    else {
      result.push(action)
    }
  }

  // 残留的未配对 convert_out：剔除（避免下游写入 400）
  if (unmatchedOuts.length > 0) {
    const dropSet = new Set(unmatchedOuts)
    console.warn(`[AI Trader] 剔除 ${unmatchedOuts.length} 个孤立 convert_out：缺少对应 convert_in`)
    return result.filter((_, idx) => !dropSet.has(idx))
  }

  return result
}

/** buildTransactionRows 生成的单条交易行(convert_in 通过 pairIndex 关联同批 convert_out) */
export interface TradeTransactionRow {
  userId: number
  fundCode: string
  type: TradeDecision['action']
  status: 'pending' | 'draft'
  /** 申报金额:仅 buy 有值;convert_in 必须为 null(等待转出确认后回填) */
  orderAmount: string | null
  /** 申报份额:仅 sell/convert_out 有值 */
  orderShares: string | null
  orderDate: string
  note: string
  /** 仅 convert_in:指向本函数返回数组中对应 convert_out 行的下标(该行必须更靠前) */
  pairIndex: number | null
}

/**
 * 把 AI 决策列表映射为可入库的交易行(纯函数,便于单元测试)。
 *
 * 与手动转换 (/api/fund/convert) 的入库语义保持一致:
 * - buy 需 amount > 0;sell/convert_out 需 shares > 0,否则整条剔除;
 * - convert_in 必须通过 relatedIndex 指向同批中**更早且未被剔除**的 convert_out,
 *   否则一并剔除——孤立的 convert_in/convert_out 会导致下游确认时资金黑洞;
 * - convert_in 的 orderAmount 置 null:等待转出确认后由 processTransactions 回填。
 *
 * 调用方需按返回顺序串行插入,并用 pairIndex 把 convert_in 的 relatedId
 * 指向对应 convert_out 已插入的数据库记录 id(见 runAutoTrade 任务)。
 */
export function buildTransactionRows(
  decisions: TradeDecision[],
  opts: { userId: number, status: 'pending' | 'draft', orderDate: string },
): TradeTransactionRow[] {
  let rows: TradeTransactionRow[] = []
  // decisions 数组下标 → rows 数组下标(被剔除的决策无映射)
  const rowIndexOf = new Map<number, number>()

  for (let i = 0; i < decisions.length; i++) {
    const decision = decisions[i]!
    const base = {
      userId: opts.userId,
      fundCode: decision.fundCode,
      status: opts.status,
      orderDate: opts.orderDate,
      note: `[AI操作] ${decision.reason}`,
    }

    if (decision.action === 'buy') {
      if (!decision.amount || decision.amount <= 0) {
        console.warn(`[AI Trader] 剔除无效 buy: ${decision.fundCode}(缺少有效金额)`)
        continue
      }
      rows.push({ ...base, type: 'buy', orderAmount: String(decision.amount), orderShares: null, pairIndex: null })
      rowIndexOf.set(i, rows.length - 1)
    }
    else if (decision.action === 'sell' || decision.action === 'convert_out') {
      if (!decision.shares || decision.shares <= 0) {
        console.warn(`[AI Trader] 剔除无效 ${decision.action}: ${decision.fundCode}(缺少有效份额)`)
        continue
      }
      rows.push({ ...base, type: decision.action, orderAmount: null, orderShares: String(decision.shares), pairIndex: null })
      rowIndexOf.set(i, rows.length - 1)
    }
    else {
      // convert_in:必须指向同批中更早(已处理)、未被剔除且类型为 convert_out 的决策
      const outDecisionIdx = decision.relatedIndex
      const outDecision = outDecisionIdx != null ? decisions[outDecisionIdx] : undefined
      const outRowIdx = outDecisionIdx != null ? rowIndexOf.get(outDecisionIdx) : undefined

      if (outDecision?.action !== 'convert_out' || outRowIdx === undefined) {
        console.warn(`[AI Trader] 剔除孤立 convert_in: ${decision.fundCode}(对应的 convert_out 缺失或已被剔除)`)
        continue
      }
      rows.push({ ...base, type: 'convert_in', orderAmount: null, orderShares: null, pairIndex: outRowIdx })
      rowIndexOf.set(i, rows.length - 1)
    }
  }

  // 后置清理:剔除没有任何 convert_in 引用的 convert_out。
  // 孤立的 convert_out 一旦入库确认,份额转出却无人承接,资金会凭空消失;
  // 这同时兜底了"convert_in 因向后引用被剔除后,其目标 convert_out 变孤立"的场景。
  const referencedOutRows = new Set(
    rows.filter(r => r.type === 'convert_in').map(r => r.pairIndex),
  )
  const hasOrphanOut = rows.some((row, idx) => row.type === 'convert_out' && !referencedOutRows.has(idx))
  if (hasOrphanOut) {
    const compacted: TradeTransactionRow[] = []
    // 原下标 → 压缩后下标(convert_in 的 pairIndex 需要同步重排)
    const remap = new Map<number, number>()
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!
      if (row.type === 'convert_out' && !referencedOutRows.has(i)) {
        console.warn(`[AI Trader] 剔除孤立 convert_out: ${row.fundCode}(缺少配对的 convert_in)`)
        continue
      }
      if (row.pairIndex !== null)
        row.pairIndex = remap.get(row.pairIndex) ?? row.pairIndex
      remap.set(i, compacted.length)
      compacted.push(row)
    }
    rows = compacted
  }

  return rows
}
