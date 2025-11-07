/**
 * @file shared/market.ts
 * @description 前后端共享的市场指数配置
 * 这是项目中关于市场指数的唯一信源 (Single Source of Truth)。
 */

// 定义指数分组，供前端 UI 使用
export const marketGroups = {
  A: {
    label: 'A 股',
    codes: ['sh000001', 'sh000300', 'sh000016', 'sh000003', 'sh000688'],
  },
  B: {
    label: '深市',
    codes: ['sz399001', 'sz399006', 'sz399106', 'sz399003'],
  },
  HK: {
    label: '港股',
    codes: [
      'hkHSI', // 恒生指数
      'hk02837', // 恒生科技
    ],
  },
  US: {
    label: '美股',
    codes: [
      'usDJI', // 道琼斯
      'usIXIC', // 纳斯达克
    ],
  },
  JP: {
    label: '日本',
    codes: [
      'fuNIY', // 日经225
    ],
  },
  Futures: {
    label: '期货',
    codes: [
      'fuNKD', // 美元指数
      'fuGC', // COMEX黄金
      'fuCL', // NYMEX原油
    ],
  },
}

/**
 * 从 marketGroups 动态生成所有需要轮询的代码列表。
 * 这样后端轮询列表总是与前端展示保持同步。
 */
export const ALL_INDEX_CODES = Object.values(marketGroups).flatMap(group => group.codes)
