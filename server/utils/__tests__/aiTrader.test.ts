import type { TradeDecision } from '../aiTrader'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// --- import 被测模块 ---
import { enforceConvertPairs, getAiTradeDecisions } from '../aiTrader'

// --- Mock 外部依赖(必须在 import 被测模块之前) ---

// 1. mock `~~/server/utils/market` — 隔离其内部对 Nitro useStorage('redis') 的依赖
vi.mock('~~/server/utils/market', () => ({
  getCachedMarketData: vi.fn().mockResolvedValue({}),
}))

// 2. mock `openai` 模块,让 chat.completions.create 返回我们构造的响应
const mockCreate = vi.fn()
vi.mock('openai', () => ({
  default: class FakeOpenAI {
    chat = { completions: { create: mockCreate } }
  },
}))

// 3. 注入 Nitro 自动导入的全局函数 useRuntimeConfig。
//    本测试刻意不加载 Nuxt 的 vite 插件(见 vitest.config.ts),故裸调用的
//    useRuntimeConfig 在源码中是未定义的,需通过 globalThis 注入桩函数。
//    用可变对象 runtimeConfigOverride 让个别用例覆盖返回值(如"未配置 Key")。
const mockRuntimeConfig = {
  openRouterApiKey: 'test-key',
  openRouterBaseUrl: 'https://openrouter.ai/api/v1',
}
const runtimeConfigOverride: { value: any | null } = { value: null }
;(globalThis as any).useRuntimeConfig = () => runtimeConfigOverride.value ?? mockRuntimeConfig

// ============ 测试数据工厂 ============
function makeDecision(over: Partial<TradeDecision>): TradeDecision {
  return {
    fundCode: '001111',
    action: 'buy',
    reason: 'test',
    ...over,
  } as TradeDecision
}

const OUT_A = { fundCode: '001111', action: 'convert_out', shares: 100, reason: 'r' } as TradeDecision
const IN_B = { fundCode: '002222', action: 'convert_in', reason: 'r' } as TradeDecision
const OUT_C = { fundCode: '003333', action: 'convert_out', shares: 50, reason: 'r' } as TradeDecision
const IN_D = { fundCode: '004444', action: 'convert_in', reason: 'r' } as TradeDecision

// ============ A. enforceConvertPairs 纯函数测试 ============
describe('enforceConvertPairs', () => {
  it('场景1: 正常配对(out+in,relatedIndex 正确)应完整保留', () => {
    const result = enforceConvertPairs([
      { ...OUT_A },
      { ...IN_B, relatedIndex: 0 },
    ])
    expect(result).toHaveLength(2)
    expect(result[0].action).toBe('convert_out')
    expect(result[0].relatedIndex).toBeNull()
    expect(result[1].action).toBe('convert_in')
    expect(result[1].relatedIndex).toBe(0)
  })

  it('场景2: 孤立 convert_in(无对应 convert_out)应被剔除', () => {
    const result = enforceConvertPairs([{ ...IN_B }])
    expect(result).toHaveLength(0)
  })

  it('场景3: 孤立 convert_out(无对应 convert_in)应被剔除', () => {
    const result = enforceConvertPairs([{ ...OUT_A }])
    expect(result).toHaveLength(0)
  })

  it('场景4: 缺失 relatedIndex 的 convert_in 应自动回填到最近未配对的 convert_out', () => {
    const result = enforceConvertPairs([
      { ...OUT_A },
      { ...IN_B }, // 没有 relatedIndex
    ])
    expect(result).toHaveLength(2)
    expect(result[1].relatedIndex).toBe(0)
  })

  it('场景5: 无效 relatedIndex(越界)应自动回填到未配对的 convert_out', () => {
    const result = enforceConvertPairs([
      { ...OUT_A },
      { ...IN_B, relatedIndex: 999 }, // 越界
    ])
    expect(result).toHaveLength(2)
    expect(result[1].relatedIndex).toBe(0)
  })

  it('场景5b: 无效 relatedIndex(指向非 convert_out)应自动回填', () => {
    // buy 在 index 0,convert_in 的 relatedIndex 指向它(非法)
    const buy = makeDecision({ action: 'buy', amount: 100 })
    const result = enforceConvertPairs([
      { ...OUT_A },
      buy,
      { ...IN_B, relatedIndex: 1 }, // 指向 buy,非法
    ])
    // convert_in 应回填到 index 0 的 convert_out
    const convertIn = result.find(d => d.action === 'convert_in')
    expect(convertIn?.relatedIndex).toBe(0)
  })

  it('场景6: 多对转换混合应各自正确配对且 out 在 in 之前', () => {
    const result = enforceConvertPairs([
      { ...OUT_A },
      { ...OUT_C },
      { ...IN_B, relatedIndex: 0 }, // 配对 OUT_A
      { ...IN_D, relatedIndex: 1 }, // 配对 OUT_C
    ])
    expect(result).toHaveLength(4)
    // 两个 convert_in 都应存在
    const ins = result.filter(d => d.action === 'convert_in')
    expect(ins).toHaveLength(2)
    expect(ins[0].relatedIndex).toBe(0)
    expect(ins[1].relatedIndex).toBe(1)
  })

  it('场景7: convert_out 的 relatedIndex 应被强制清为 null', () => {
    const result = enforceConvertPairs([
      { ...OUT_A, relatedIndex: 5 } as TradeDecision, // AI 乱填了 relatedIndex
      { ...IN_B, relatedIndex: 0 },
    ])
    expect(result[0].relatedIndex).toBeNull()
  })

  it('场景8: buy/sell 操作应原样保留,不受配对逻辑影响', () => {
    const buy = makeDecision({ fundCode: '111', action: 'buy', amount: 500 })
    const sell = makeDecision({ fundCode: '222', action: 'sell', shares: 10 })
    const result = enforceConvertPairs([buy, sell])
    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({ action: 'buy', amount: 500 })
    expect(result[1]).toMatchObject({ action: 'sell', shares: 10 })
  })

  it('场景9: 空数组输入应返回空数组', () => {
    expect(enforceConvertPairs([])).toEqual([])
  })
})

// ============ B. getAiTradeDecisions 资金风控测试 ============
describe('getAiTradeDecisions', () => {
  beforeEach(() => {
    mockCreate.mockReset()
    runtimeConfigOverride.value = null
  })

  // 模拟 OpenAI 返回内容的辅助函数
  function mockResponse(decisions: any) {
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify({ decisions }) } }],
    })
  }

  it('场景1: 正常 buy(amount ≤ 预算)应保留', async () => {
    mockResponse([
      makeDecision({ action: 'buy', amount: 5000 }),
    ])
    const result = await getAiTradeDecisions([], {
      availableCash: 20000,
      aiSystemPrompt: 'test strategy',
    })
    expect(result.decisions).toHaveLength(1)
    expect(result.decisions[0].action).toBe('buy')
    expect(result.decisions[0].amount).toBe(5000)
  })

  it('场景2: 超支应触发风控削减(剩余 > 10 时削减金额)', async () => {
    // 预算 20000,两个 buy:15000 + 10000 = 25000 超支
    mockResponse([
      makeDecision({ fundCode: '111', action: 'buy', amount: 15000 }),
      makeDecision({ fundCode: '222', action: 'buy', amount: 10000 }),
    ])
    const result = await getAiTradeDecisions([], {
      availableCash: 20000,
      aiSystemPrompt: 'test strategy',
    })
    // 第一个 buy 15000 通过,剩余 5000;第二个触发风控削减为 floor(5000)=5000
    expect(result.decisions).toHaveLength(2)
    expect(result.decisions[1].amount).toBe(5000)
    expect(result.decisions[1].reason).toContain('系统风控')
  })

  it('场景2b: 剩余预算 ≤ 10 时应丢弃该 buy', async () => {
    // 预算 10000,第一个 buy 用掉 9999,剩余 1 < 10 → 第二个应被丢弃
    mockResponse([
      makeDecision({ fundCode: '111', action: 'buy', amount: 9999 }),
      makeDecision({ fundCode: '222', action: 'buy', amount: 500 }),
    ])
    const result = await getAiTradeDecisions([], {
      availableCash: 10000,
      aiSystemPrompt: 'test strategy',
    })
    expect(result.decisions).toHaveLength(1)
    expect(result.decisions[0].fundCode).toBe('111')
  })

  it('场景3: sell 的 shares 应截断到 4 位小数', async () => {
    mockResponse([
      makeDecision({ action: 'sell', shares: 123.456789 }),
    ])
    const result = await getAiTradeDecisions([], {
      availableCash: 10000,
      aiSystemPrompt: 'test strategy',
    })
    expect(result.decisions[0].shares).toBe(123.4567)
  })

  it('场景4: convert_out 的 shares 应截断到 4 位小数', async () => {
    mockResponse([
      makeDecision({ action: 'convert_out', shares: 99.999999 }),
      makeDecision({ action: 'convert_in', relatedIndex: 0 }),
    ])
    const result = await getAiTradeDecisions([], {
      availableCash: 10000,
      aiSystemPrompt: 'test strategy',
    })
    const out = result.decisions.find(d => d.action === 'convert_out')
    expect(out?.shares).toBe(99.9999)
  })

  it('场景5: Markdown 代码块包裹的响应应能正确解析', async () => {
    // AI 常返回 ```json ... ``` 包裹的内容
    mockCreate.mockResolvedValueOnce({
      choices: [{
        message: {
          content: '```json\n{"decisions":[{"fundCode":"001111","action":"buy","amount":1000,"reason":"r"}]}\n```',
        },
      }],
    })
    const result = await getAiTradeDecisions([], {
      availableCash: 10000,
      aiSystemPrompt: 'test strategy',
    })
    expect(result.decisions).toHaveLength(1)
    expect(result.decisions[0].fundCode).toBe('001111')
    expect(result.decisions[0].amount).toBe(1000)
  })

  it('场景6: 非法 action 应因 Zod 校验失败而抛错', async () => {
    mockResponse([
      makeDecision({ action: 'invalid_action' as any }),
    ])
    await expect(getAiTradeDecisions([], {
      availableCash: 10000,
      aiSystemPrompt: 'test strategy',
    })).rejects.toThrow()
  })

  it('场景7: 未配置 OpenRouter API Key 应抛错', async () => {
    runtimeConfigOverride.value = { openRouterApiKey: '', openRouterBaseUrl: '' }
    await expect(getAiTradeDecisions([], {
      availableCash: 10000,
      aiSystemPrompt: 'test strategy',
    })).rejects.toThrow('系统未配置 OpenRouter API Key')
  })

  it('场景8: 未配置 aiSystemPrompt 应抛错', async () => {
    await expect(getAiTradeDecisions([], {
      availableCash: 10000,
      aiSystemPrompt: '',
    })).rejects.toThrow('AI 策略提示词')
  })
})
