import { $fetch } from 'ofetch'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchFundRealtimeEstimate } from '~~/server/utils/dataFetcher'

// 告诉 Vitest 我们要模拟 'ofetch' 模块。
// 之后所有对 $fetch 的调用都会被我们的模拟版本所替代。
vi.mock('ofetch')

// 将 $fetch 断言为 Vitest 的模拟类型，以便获得 .mockResolvedValue 等方法
const mockedFetch = vi.mocked($fetch)

describe('fetchFundRealtimeEstimate', () => {
  // 在每个测试用例运行前，清除所有模拟记录，确保测试的独立性
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // --- 场景 1: 成功获取并解析数据 ---
  it('should return parsed data on a successful API call', async () => {
    // 1. 准备模拟数据
    const fundCode = '161725'
    const mockApiResponse = `jsonpgz({"fundcode":"${fundCode}","name":"招商中证白酒指数(LOF)A","jzrq":"2024-08-14","dwjz":"0.7890","gsz":"0.7953","gszzl":"0.80","gztime":"2024-08-15 14:45:00"});`
    const expectedData = {
      fundcode: '161725',
      name: '招商中证白酒指数(LOF)A',
      jzrq: '2024-08-14',
      dwjz: '0.7890',
      gsz: '0.7953',
      gszzl: '0.80',
      gztime: '2024-08-15 14:45:00',
    }
    // 2. 配置模拟行为：当 $fetch 被调用时，返回我们准备好的数据
    mockedFetch.mockResolvedValue(mockApiResponse)

    // 3. 执行被测试的函数
    const result = await fetchFundRealtimeEstimate(fundCode)

    // 4. 断言结果
    // 验证返回结果是否与预期相符
    expect(result).toEqual(expectedData)
    // 验证 $fetch 是否被正确调用
    expect(mockedFetch).toHaveBeenCalledOnce()
    expect(mockedFetch).toHaveBeenCalledWith(`http://fundgz.1234567.com.cn/js/${fundCode}.js`, expect.any(Object))
  })

  it('should return null when the API call fails', async () => {
    const fundCode = '999999'
    const apiError = new Error('HTTP Error 404: Not Found')
    mockedFetch.mockRejectedValue(apiError)

    // [关键修改] 在调用函数前，创建一个 "间谍" 来监视 console.error
    // 并用一个空函数替换它的原始实现，实现 "静音" 效果
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    // 执行被测试的函数
    const result = await fetchFundRealtimeEstimate(fundCode)

    // 断言结果
    expect(result).toBeNull()
    expect(mockedFetch).toHaveBeenCalledOnce()

    // 验证 console.error 是否确实被调用过一次（证明我们的 catch 块逻辑是正确的）
    expect(consoleSpy).toHaveBeenCalledOnce()
  })

  it('should return null when the API response is not valid JSONP', async () => {
    const fundCode = '000001'
    const invalidResponse = 'this is not json'
    mockedFetch.mockResolvedValue(invalidResponse)

    // [关键修改] 同样在这里静音 console.error
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await fetchFundRealtimeEstimate(fundCode)

    expect(result).toBeNull()
    expect(mockedFetch).toHaveBeenCalledOnce()
    expect(consoleSpy).toHaveBeenCalledOnce()
  })
})
