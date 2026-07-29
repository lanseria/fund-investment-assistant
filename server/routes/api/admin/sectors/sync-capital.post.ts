import { z } from 'zod'
import { getUserFromEvent } from '~~/server/utils/auth'
import { syncSectorCapitalSnapshot } from '~~/server/utils/sectorSnapshot'

const syncSchema = z.object({
  /** 指定快照日期（可选，格式 yyyy-MM-dd，便于回补历史） */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式应为 yyyy-MM-dd').optional(),
})

/**
 * 管理员接口：手动触发板块主力资金快照抓取。
 * 可指定 date 用于回补历史数据；不指定则抓取当日。
 */
export default defineEventHandler(async (event) => {
  const admin = getUserFromEvent(event)
  if (admin.role !== 'admin')
    throw createError({ status: 403, statusText: 'Forbidden: Admins only' })

  const query = getQuery(event)
  const body = await readBody(event).catch(() => ({}))
  const { date } = await syncSchema.parseAsync({ ...body, ...query })

  try {
    const result = await syncSectorCapitalSnapshot(date)
    return {
      message: `快照抓取完成：绑定 ${result.total} 个板块，保存 ${result.saved} 条，跳过 ${result.skipped} 个。`,
      ...result,
    }
  }
  catch (error: any) {
    console.error('手动触发板块资金快照失败:', error)
    throw createError({
      status: 500,
      statusText: error.data?.detail || error.message || '快照抓取失败，请查看服务器日志。',
    })
  }
})
