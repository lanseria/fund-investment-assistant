// server/utils/emitter.ts
import mitt from 'mitt'

// 定义事件类型，方便类型提示
interface MittEvents {
  'holdings:updated': unknown // 我们只需要一个通知事件，不需要传递数据
  'market:updated': Record<string, MarketIndexData>
  [key: string]: unknown // 字符串索引签名
  [key: symbol]: unknown // 符号索引签名
}

export const emitter = mitt<MittEvents>()
