import type { MarketIndexData } from '~~/server/utils/dataFetcher'
import { acceptHMRUpdate, defineStore } from 'pinia'
import { marketGroups } from '~~/shared/market'

// [核心修改] 使用 keyof typeof 动态生成联合类型，使其与 marketGroups 的键保持同步
type MarketGroupKey = keyof typeof marketGroups

export const useMarketStore = defineStore('market', () => {
  // --- State ---
  const indices = ref<Record<string, MarketIndexData>>({})
  const activeGroup = ref<MarketGroupKey>('A')
  const sseStatus = ref<'OPEN' | 'CONNECTING' | 'CLOSED'>('CLOSED')
  let sse: ReturnType<typeof useEventSource> | null = null

  // --- Getters ---
  const activeGroupIndices = computed(() => {
    const groupInfo = marketGroups[activeGroup.value]
    if (!groupInfo)
      return []

    const mapped = groupInfo.codes.map(code => indices.value[code])

    return mapped.filter(Boolean)
  })

  // --- Actions ---
  function setActiveGroup(group: MarketGroupKey) {
    activeGroup.value = group
  }

  function startMarketUpdates() {
    if (sse && sse.status.value !== 'CLOSED')
      return

    console.warn('[SSE Market] Initializing connection...')
    sse = useEventSource('/api/sse/market', [], { withCredentials: true })

    watch(sse.status, (newStatus) => {
      sseStatus.value = newStatus
      console.warn('[SSE Market] Status changed:', newStatus)
    })

    watch(sse.data, (newData: any) => {
      if (newData) {
        try {
          const parsedData = JSON.parse(newData)
          indices.value = parsedData
        }
        catch (e) {
          console.error('[SSE Market] Failed to parse message data:', e) // 4. 捕获可能的解析错误
        }
      }
    })
  }

  function stopMarketUpdates() {
    if (sse) {
      sse.close()
      console.warn('[SSE Market] Connection closed by store action.')
    }
  }

  return {
    indices,
    activeGroup,
    sseStatus,
    activeGroupIndices,
    setActiveGroup,
    startMarketUpdates,
    stopMarketUpdates,
  }
})

if (import.meta.hot)
  import.meta.hot.accept(acceptHMRUpdate(useMarketStore, import.meta.hot))
