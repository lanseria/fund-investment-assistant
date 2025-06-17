<script setup lang="ts">
import type { HoldingHistoryPoint } from '~/types/holding'

const route = useRoute<"fund-code">()
const code = route.params.code as string

const { data: history, pending, error } = await useFetch<HoldingHistoryPoint[]>(`/api/fund/holdings/${code}/history`, {
  params: {
    ma: [5, 10, 20], // 请求需要的均线
  },
})
</script>

<template>
  <div class="p-4 md:p-8">
    <div v-if="pending" class="text-center">
      正在加载图表数据...
    </div>
    <div v-else-if="error" class="text-center text-red-500">
      加载失败: {{ error.message }}
    </div>
    <FundChart v-else-if="history" :history="history" :title="`基金 ${code} 历史净值`" />

    <div class="text-center mt-8">
      <NuxtLink to="/" class="btn">
        返回持仓列表
      </NuxtLink>
    </div>
    <Footer />
  </div>
</template>