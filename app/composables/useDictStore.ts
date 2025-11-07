import { acceptHMRUpdate, defineStore } from 'pinia'

// 定义从 API 返回的字典项的类型
interface DictDataItem {
  id: number
  dictType: string
  label: string
  value: string
  sortOrder: number
}

// 定义 Store 的 state 结构
interface DictState {
  // 原始数据，用于填充下拉框等
  rawDicts: Record<string, DictDataItem[]>
  // 优化查找的数据结构：Map<类型, Map<值, 标签>>
  labelMaps: Map<string, Map<string, string>>
  isLoaded: boolean
}

export const useDictStore = defineStore('dictionary', {
  state: (): DictState => ({
    rawDicts: {},
    labelMaps: new Map(),
    isLoaded: false,
  }),

  actions: {
    /**
     * 从后端获取所有字典数据并填充 Store
     */
    async fetchAllDicts() {
      // 防止重复获取
      if (this.isLoaded)
        return

      try {
        const data = await apiFetch<Record<string, DictDataItem[]>>('/api/dicts/all')
        this.rawDicts = data

        // 构建用于快速查找标签的 Map
        const newLabelMaps = new Map<string, Map<string, string>>()
        for (const type in data) {
          const itemsMap = new Map<string, string>()
          for (const item of data[type]!)
            itemsMap.set(item.value, item.label)

          newLabelMaps.set(type, itemsMap)
        }
        this.labelMaps = newLabelMaps
        this.isLoaded = true
        console.warn('✅ Dictionaries loaded globally.')
      }
      catch (error) {
        console.error('❌ Failed to load dictionaries:', error)
      }
    },
  },

  getters: {
    /**
     * 根据字典类型获取其下的所有数据项 (用于下拉框)
     * @param state
     * @returns (type: string) => DictDataItem[]
     */
    getDictData: state => (type: string): DictDataItem[] => {
      return state.rawDicts[type] || []
    },

    /**
     * 根据字典类型和值，获取对应的标签
     * @param state
     * @returns (type: string, value: string | null) => string
     */
    getLabel: state => (type: string, value: string | null): string => {
      if (value === null || value === undefined)
        return ''
      return state.labelMaps.get(type)?.get(value) || value
    },
  },
})

if (import.meta.hot)
  import.meta.hot.accept(acceptHMRUpdate(useDictStore, import.meta.hot))
