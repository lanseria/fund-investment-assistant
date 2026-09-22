import { z } from 'zod'
import { computeNextExecutionDate } from '~~/shared/dcaPlan'

/** 定投计划创建入参校验 */
export const dcaPlanCreateSchema = z.object({
  fundCode: z.string().regex(/^\d{6}$/, '基金代码应为6位数字'),
  amount: z.number().positive('每期金额必须大于 0'),
  frequency: z.enum(['weekly', 'biweekly', 'monthly']),
  anchorDay: z.number().int().min(1).max(28).nullable().optional(),
}).superRefine((data, ctx) => {
  const error = validatePlanRules(data.frequency, data.anchorDay ?? null)
  if (error)
    ctx.addIssue({ code: 'custom', message: error, path: ['anchorDay'] })
})

/** 定投计划更新入参校验 (部分字段) */
export const dcaPlanUpdateSchema = z.object({
  amount: z.number().positive('每期金额必须大于 0').optional(),
  frequency: z.enum(['weekly', 'biweekly', 'monthly']).optional(),
  anchorDay: z.number().int().min(1).max(28).nullable().optional(),
  enabled: z.boolean().optional(),
})

/**
 * 校验频率与扣款日锚点的组合规则,不合法返回错误文案。
 * weekly: 1-5 (周一~周五); monthly: 1-28; biweekly: 忽略锚点。
 */
export function validatePlanRules(frequency: 'weekly' | 'biweekly' | 'monthly', anchorDay: number | null | undefined): string | null {
  if (frequency === 'weekly' && (!anchorDay || anchorDay < 1 || anchorDay > 5))
    return '每周定投需选择周一至周五 (1-5)'
  if (frequency === 'monthly' && (!anchorDay || anchorDay < 1 || anchorDay > 28))
    return '每月定投需选择 1-28 日'
  return null
}

/** 基于当前时间推算首期(下次)扣款日 */
export function initialNextExecutionDate(frequency: 'weekly' | 'biweekly' | 'monthly', anchorDay: number | null | undefined): string {
  return computeNextExecutionDate(new Date(), frequency, anchorDay)
}
