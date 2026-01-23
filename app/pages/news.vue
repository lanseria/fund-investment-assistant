<!-- eslint-disable no-alert -->
<!-- app/pages/news.vue -->
<script setup lang="ts">
import type { NewsData } from '~/types/news'
import { useClipboard } from '@vueuse/core'
import CalendarWidget from '~/components/CalendarWidget.vue'

import { appName } from '~/constants' // 分析加载状态

useHead({
  title: `市场情报 - ${appName}`,
})

const dayjs = useDayjs()
const { copy, copied } = useClipboard({ legacy: true })

// --- 状态管理 ---
const selectedDate = ref(dayjs().format('YYYY-MM-DD')) // 当前选中的日期（用于查询数据）
// [修改] 增加 'analysis' 状态
const activeTab = ref<'items' | 'analysis' | 'raw'>('analysis')
const isAnalyzing = ref(false)

const { data: newsData, pending, refresh } = await useAsyncData<NewsData>(
  `news-${selectedDate.value}`,
  () => apiFetch<NewsData>(`/api/news/${selectedDate.value}`),
  {
    watch: [selectedDate], // 监听选中日期变化，自动重新请求
  },
)

// 智能切换默认 Tab：如果有结构化数据，显示结构化；否则如果有 AI 分析，显示分析；否则显示原始
watch(newsData, (val) => {
  if (val) {
    if (val.items && val.items.length > 0)
      activeTab.value = 'items'
    else if (val.aiAnalysis)
      activeTab.value = 'analysis'
    else
      activeTab.value = 'raw'
  }
})

// 复制文本
function handleCopy() {
  if (activeTab.value === 'raw' && newsData.value?.content) {
    copy(newsData.value.content)
  }
  else if (activeTab.value === 'analysis' && newsData.value?.aiAnalysis) {
    copy(newsData.value.aiAnalysis)
  }
}

// 手动触发 AI 分析 (保持不变)
async function handleAnalyze() {
  if (!newsData.value?.content)
    return

  if (!confirm('确定要重新使用 AI 分析当日的原始报告吗？\n这将覆盖现有的“AI 精选”内容。'))
    return

  isAnalyzing.value = true
  try {
    const res = await apiFetch<{ message: string }>('/api/news/analyze', {
      method: 'POST',
      body: { date: selectedDate.value },
    })
    alert(res.message)
    // 刷新数据
    await refresh()
  }
  catch (e: any) {
    alert(`分析失败: ${e.data?.statusMessage || e.message}`)
  }
  finally {
    isAnalyzing.value = false
  }
}
</script>

<template>
  <div class="mx-auto p-4 max-w-6xl lg:p-8 sm:p-6">
    <header class="mb-8">
      <h1 class="text-2xl font-bold sm:text-3xl">
        市场情报
      </h1>
      <p class="text-gray-500 mt-1 dark:text-gray-400">
        TrendRadar 每日市场热点与新闻汇总
      </p>
    </header>

    <div class="flex flex-col gap-8 items-start md:flex-row">
      <!-- 左侧：日历 -->
      <CalendarWidget v-model="selectedDate" />

      <!-- 右侧：新闻内容展示 -->
      <div class="card flex flex-grow flex-col h-[800px] w-full">
        <!-- 标题栏 & Tab -->
        <div class="p-4 border-b flex flex-shrink-0 flex-col gap-4 dark:border-gray-700 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 class="text-lg font-bold">
              {{ newsData?.title || `${selectedDate} 简报` }}
            </h2>
            <div class="text-xs text-gray-400 font-mono mt-0.5">
              {{ selectedDate }}
            </div>
          </div>

          <div class="flex gap-2 items-center">
            <!-- Tab Switcher -->
            <div class="p-1 rounded-lg bg-gray-100 flex dark:bg-gray-700">
              <button
                class="text-xs font-medium px-3 py-1.5 rounded-md transition-colors"
                :class="activeTab === 'items' ? 'bg-white text-primary shadow-sm dark:bg-gray-600 dark:text-white' : 'text-gray-500 hover:text-teal-700 dark:text-gray-400'"
                @click="activeTab = 'items'"
              >
                AI 精选
              </button>
              <button
                class="text-xs font-medium px-3 py-1.5 rounded-md transition-colors"
                :class="activeTab === 'analysis' ? 'bg-white text-primary shadow-sm dark:bg-gray-600 dark:text-white' : 'text-gray-500 hover:text-teal-700 dark:text-gray-400'"
                @click="activeTab = 'analysis'"
              >
                AI 分析
              </button>
              <button
                class="text-xs font-medium px-3 py-1.5 rounded-md transition-colors"
                :class="activeTab === 'raw' ? 'bg-white text-primary shadow-sm dark:bg-gray-600 dark:text-white' : 'text-gray-500 hover:text-teal-700 dark:text-gray-400'"
                @click="activeTab = 'raw'"
              >
                原始报告
              </button>
            </div>

            <div class="mx-1 bg-gray-200 h-6 w-[1px] dark:bg-gray-600" />

            <button
              class="text-sm icon-btn px-3 py-1.5 border rounded-md flex gap-1 items-center dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
              :disabled="activeTab === 'items'"
              title="复制当前文本 (Raw/Analysis)"
              @click="handleCopy"
            >
              <div :class="copied ? 'i-carbon-checkmark text-green-500' : 'i-carbon-copy'" />
            </button>

            <!-- AI 分析按钮 (仅在 Raw Tab 显示) -->
            <button
              v-if="activeTab === 'raw'"
              class="text-sm text-primary px-3 py-1.5 border border-primary/30 rounded-md bg-primary/5 flex gap-1 items-center hover:bg-primary/10 disabled:opacity-50 disabled:cursor-not-allowed"
              :disabled="!newsData?.content || isAnalyzing"
              title="使用 AI 提取关键信息"
              @click="handleAnalyze"
            >
              <div v-if="isAnalyzing" class="i-carbon-circle-dash animate-spin" />
              <div v-else class="i-carbon-magic-wand-filled" />
              <span class="hidden sm:inline">{{ isAnalyzing ? '分析中...' : 'AI 分析' }}</span>
            </button>
          </div>
        </div>

        <!-- 内容区域 -->
        <div class="flex-grow relative overflow-hidden">
          <div v-if="pending" class="bg-white/80 flex items-center inset-0 justify-center absolute z-20 backdrop-blur-sm dark:bg-gray-800/80">
            <div class="flex flex-col items-center">
              <div i-carbon-circle-dash class="text-3xl text-primary mb-2 animate-spin" />
              <span class="text-xs text-gray-500">加载数据...</span>
            </div>
          </div>

          <!-- 无数据状态 -->
          <div v-if="!pending && !newsData?.content && (!newsData?.items || newsData.items.length === 0) && !newsData?.aiAnalysis" class="text-gray-400 flex flex-col h-full items-center justify-center">
            <div i-carbon-document-unknown class="text-5xl mb-4 opacity-50" />
            <p>该日期暂无数据</p>
          </div>

          <!-- 1. AI 结构化列表视图 -->
          <div v-else-if="activeTab === 'items'" class="p-4 bg-gray-50/50 h-full overflow-y-auto dark:bg-gray-900/20">
            <div v-if="newsData?.items && newsData.items.length > 0" class="space-y-3">
              <div
                v-for="item in newsData.items"
                :key="item.id"
                class="p-4 border border-gray-100 rounded-lg bg-white shadow-sm transition-shadow dark:border-gray-700 dark:bg-gray-800 hover:shadow-md"
              >
                <div class="flex gap-2 items-start justify-between">
                  <h3 class="text-gray-800 leading-snug font-bold dark:text-gray-200">
                    <a v-if="item.url" :href="item.url" target="_blank" class="hover:text-primary hover:underline">
                      {{ item.title }} <span class="i-carbon-launch text-xs ml-1 opacity-50" />
                    </a>
                    <span v-else>{{ item.title }}</span>
                  </h3>
                </div>

                <p class="text-sm text-gray-600 leading-relaxed mt-2 dark:text-gray-400">
                  {{ item.content }}
                </p>

                <div class="mt-3 flex gap-2 items-center">
                  <span
                    v-if="item.tag"
                    class="text-xs text-blue-600 px-2 py-0.5 rounded-full bg-blue-50 dark:text-blue-300 dark:bg-blue-900/20"
                  >
                    # {{ item.tag }}
                  </span>
                </div>
              </div>
            </div>
            <div v-else class="py-10 text-center">
              <p class="text-gray-500 mb-2">
                暂无 AI 精选数据
              </p>
              <button class="text-sm text-primary hover:underline" @click="activeTab = 'raw'">
                查看原始报告
              </button>
            </div>
          </div>

          <!-- 2. AI 分析视图 [新增] -->
          <div v-else-if="activeTab === 'analysis'" class="p-6 bg-purple-50/30 h-full overflow-y-auto dark:bg-purple-900/10">
            <div v-if="newsData?.aiAnalysis" class="max-w-100 prose dark:prose-invert">
              <div class="text-base text-gray-800 leading-relaxed font-sans w-full whitespace-pre-wrap break-words dark:text-gray-200">
                {{ newsData.aiAnalysis }}
              </div>
            </div>
            <div v-else class="text-gray-500 py-10 text-center">
              <div i-carbon-bot class="text-4xl mx-auto mb-2 opacity-30" />
              <p>暂无 AI 热点分析数据</p>
              <p class="text-xs mt-1 opacity-70">
                (通常包含在原始报告末尾，如未自动提取，请查看原始报告)
              </p>
            </div>
          </div>

          <!-- 3. 原始报告视图 -->
          <div v-else class="p-6 h-full overflow-y-auto">
            <div v-if="newsData?.content" class="max-w-100 prose dark:prose-invert">
              <div class="text-base text-gray-800 leading-relaxed font-sans whitespace-pre-wrap break-words dark:text-gray-200">
                {{ newsData.content }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
