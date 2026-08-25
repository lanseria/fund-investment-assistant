<script setup lang="ts">
import type { SectorCapitalHistoryResponse } from '~/types/sector'
import { SECTOR_DICT_TYPE } from '~/constants'
import { formatChange, getChangeColorClass } from '~/utils/format'
import { getActionBadgeClass } from '~/utils/sectorStyle'

const props = defineProps<{
  /** 项目板块 value（字典 sectors 的 value） */
  fundSector: string
  /** 板块主力资金历史响应（含绑定状态与最新摘要） */
  data: SectorCapitalHistoryResponse | null
  /** 历史请求加载中 */
  pending: boolean
}>()

const dictStore = useDictStore()
</script>

<template>
  <!-- 板块主力行为：摘要与状态（图表已合并到上方「基础走势」走势图中） -->
  <div class="mt-8 p-4 card sm:p-6">
    <h2 class="text-lg font-bold mb-1">
      板块主力行为 · 摘要
      <span class="text-sm text-gray-500 font-normal dark:text-gray-400">
        · {{ dictStore.getLabel(SECTOR_DICT_TYPE, props.fundSector) }}
      </span>
    </h2>

    <!-- 未绑定东财板块 -->
    <div
      v-if="!props.pending && props.data && !props.data.bound"
      class="py-10 text-center flex flex-col gap-3 items-center"
    >
      <div class="i-carbon-link text-4xl text-gray-300" />
      <p class="text-sm text-gray-500 dark:text-gray-400">
        该板块「{{ dictStore.getLabel(SECTOR_DICT_TYPE, props.fundSector) }}」尚未绑定东财板块，无法查看主力行为回顾。
      </p>
      <NuxtLink to="/sector-capital" class="text-sm text-primary hover:underline">
        前往「板块资金」页面绑定 →
      </NuxtLink>
    </div>

    <!-- 已绑定但暂无历史数据 -->
    <div
      v-else-if="!props.pending && props.data && props.data.bound && props.data.history.dates.length === 0"
      class="py-10 text-center flex flex-col gap-2 items-center"
    >
      <div class="i-carbon-cloud-download text-4xl text-gray-300" />
      <p class="text-sm text-gray-500 dark:text-gray-400">
        已绑定东财板块「{{ props.data.sectorName }}」，但暂无历史快照数据。
      </p>
      <p class="text-xs text-gray-400">
        请管理员在「板块资金」页面手动抓取一次快照，或等待每日收盘自动抓取。
      </p>
    </div>

    <!-- 加载中 -->
    <div v-else-if="props.pending" class="flex h-40 items-center justify-center">
      <div i-carbon-circle-dash class="text-3xl text-primary animate-spin" />
    </div>

    <!-- 最新摘要（完整历史曲线已合并展示在上方「基础走势」图中：净值 / 主力强度 / 主力资金 / 主力暗盘 / 散户资金） -->
    <div
      v-else-if="props.data && props.data.history.dates.length > 0"
      class="text-sm flex flex-wrap gap-x-6 gap-y-2 items-center"
    >
      <template v-if="props.data.latest">
        <span class="text-gray-500 dark:text-gray-400">
          最新 ({{ props.data.latest.date }}):
        </span>
        <span>
          主力行为
          <span
            class="text-xs font-medium ml-1 px-2 py-0.5 border rounded-full"
            :class="getActionBadgeClass(props.data.latest.mainAction ?? '')"
          >
            {{ props.data.latest.mainAction || '-' }}
          </span>
        </span>
        <span class="text-gray-500 dark:text-gray-400">
          主力强度
          <span class="font-mono font-semibold" :class="getChangeColorClass(props.data.latest.mainStrength ?? 0)">
            {{ formatChange(props.data.latest.mainStrength ?? 0) }}%
          </span>
        </span>
        <span class="text-gray-500 dark:text-gray-400">
          主力资金
          <span class="font-mono" :class="getChangeColorClass(props.data.latest.mainCapital ?? 0)">
            {{ (props.data.latest.mainCapital ?? 0).toFixed(2) }} 亿
          </span>
        </span>
        <span class="text-gray-500 dark:text-gray-400">
          散户资金
          <span class="font-mono" :class="getChangeColorClass(props.data.latest.retailCapital ?? 0)">
            {{ (props.data.latest.retailCapital ?? 0).toFixed(2) }} 亿
          </span>
        </span>
      </template>
      <span class="text-xs text-gray-400">
        完整历史曲线见上方「基础走势」图（净值 / 主力强度 / 主力资金 / 主力暗盘 / 散户资金 共享同一条时间轴）。
      </span>
    </div>
  </div>
</template>
