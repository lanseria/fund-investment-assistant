import type { MarketIndexData } from '~~/server/utils/dataFetcher'
// app/composables/useMarketStore.ts
import { acceptHMRUpdate, defineStore } from 'pinia'

// 定义分组
export const marketGroups = {
  A: {
    label: 'A 股',
    codes: ['sh000001', 'sh000300', 'sh000016', 'sh000003', 'sh000688'],
  },
  B: {
    label: '深市',
    codes: ['sz399001', 'sz399006', 'sz399106', 'sz399003'],
  },
  C: {
    label: '全球',
    codes: ['hf_IF0', 'hkHSI', 'gb_dji', 'int_ni225', 'hf_DINIW', 'hf_GC0', 'hf_CL0', 'hf_USDCNH'],
  },
}

export const useMarketStore = defineStore('market', () => {
  // --- State ---
  const indices = ref<Record<string, MarketIndexData>>({})
  const activeGroup = ref<'A' | 'B' | 'C'>('A')
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
  function setActiveGroup(group: 'A' | 'B' | 'C') {
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
