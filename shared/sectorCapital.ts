// shared/sectorCapital.ts
// 板块资金数值解析的纯函数,前后端共享(Nuxt shared 目录)。

/**
 * 剥离「亿」转为数值。
 * 例如 "440.19 亿" → 440.19；无法解析或为空时返回 null。
 */
export function parseYi(str: string | null | undefined): number | null {
  if (!str)
    return null
  const num = Number(str.replace(/亿/g, '').trim())
  return Number.isNaN(num) ? null : num
}
