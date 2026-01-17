<!-- eslint-disable no-alert -->
<!-- app/pages/news.vue -->
<script setup lang="ts">
// --- 获取数据 ---
import type { NewsData } from '~/types/news'
import { useClipboard } from '@vueuse/core'

import { appName } from '~/constants' // [新增] 分析加载状态

useHead({
  title: `市场情报 - ${appName}`,
})

const dayjs = useDayjs()
const { copy, copied } = useClipboard({ legacy: true })

// --- 状态管理 ---
const selectedDate = ref(dayjs().format('YYYY-MM-DD')) // 当前选中的日期（用于查询数据）
const viewDate = ref(dayjs()) // 当前日历视图显示的月份
const activeTab = ref<'items' | 'raw'>('items') // 默认显示结构化列表
const isAnalyzing = ref(false)

const { data: newsData, pending, refresh } = await useAsyncData<NewsData>(
  `news-${selectedDate.value}`,
  () => apiFetch<NewsData>(`/api/news/${selectedDate.value}`),
  {
    watch: [selectedDate], // 监听选中日期变化，自动重新请求
  },
)

// --- 日历逻辑 ---
const weekDays = ['日', '一', '二', '三', '四', '五', '六']

// 计算当前视图月份的所有日期格子
const calendarDays = computed(() => {
  const year = viewDate.value.year()
  const month = viewDate.value.month() // 0-11

  const firstDayOfMonth = dayjs(new Date(year, month, 1))
  const daysInMonth = firstDayOfMonth.daysInMonth()

  // 获取当月第一天是星期几 (0是周日)
  const startDayOfWeek = firstDayOfMonth.day()

  const days = []

  // 填充上个月的空白占位
  for (let i = 0; i < startDayOfWeek; i++) {
    days.push({ day: null, dateStr: '' })
  }

  // 填充当月日期
  for (let i = 1; i <= daysInMonth; i++) {
    const dateStr = dayjs(new Date(year, month, i)).format('YYYY-MM-DD')
    days.push({
      day: i,
      dateStr,
      isToday: dateStr === dayjs().format('YYYY-MM-DD'),
      isSelected: dateStr === selectedDate.value,
    })
  }

  return days
})

// 切换月份
function changeMonth(delta: number) {
  viewDate.value = viewDate.value.add(delta, 'month')
}

// 选择日期
function selectDate(dateStr: string) {
  if (!dateStr)
    return
  selectedDate.value = dateStr
}

// 复制文本
function handleCopy() {
  if (newsData.value?.content) {
    copy(newsData.value.content)
  }
}

// [新增] 手动触发 AI 分析
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
    // 刷新数据并切换到精选 Tab
    await refresh()
    activeTab.value = 'items'
  }
  catch (e: any) {
    alert(`分析失败: ${e.data?.message || e.message}`)
  }
  finally {
    isAnalyzing.value = false
  }
}
</script>

<template>
  <div class="mx-auto p-4 max-w-5xl lg:p-8 sm:p-6">
    <header class="mb-8">
      <h1 class="text-2xl font-bold sm:text-3xl">
        市场情报
      </h1>
      <p class="text-gray-500 mt-1 dark:text-gray-400">
        TrendRadar 每日市场热点与新闻汇总
      </p>
    </header>

    <div class="flex flex-col gap-8 items-start md:flex-row">
      <!-- 左侧：原生 CSS 日历 -->
      <div class="p-4 card w-full select-none md:flex-shrink-0 md:w-auto">
        <!-- 日历头部：年月切换 -->
        <div class="mb-4 flex items-center justify-between">
          <button class="icon-btn p-1" @click="changeMonth(-1)">
            <div i-carbon-chevron-left />
          </button>
          <span class="text-lg font-bold">
            {{ viewDate.format('YYYY年 MM月') }}
          </span>
          <button class="icon-btn p-1" @click="changeMonth(1)">
            <div i-carbon-chevron-right />
          </button>
        </div>

        <!-- 星期头 -->
        <div class="mb-2 gap-1 grid grid-cols-7">
          <div
            v-for="wd in weekDays"
            :key="wd"
            class="text-xs text-gray-400 font-medium text-center flex h-8 items-center justify-center"
          >
            {{ wd }}
          </div>
        </div>

        <!-- 日期格子 -->
        <div class="gap-1 grid grid-cols-7">
          <template v-for="(item, index) in calendarDays" :key="index">
            <!-- 空白占位 -->
            <div v-if="!item.day" class="h-10 w-10" />

            <!-- 有效日期 -->
            <button
              v-else
              class="text-sm rounded-full flex h-10 w-10 transition-all items-center justify-center relative"
              :class="[
                item.isSelected
                  ? 'bg-primary text-white shadow-md font-bold'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200',
                item.isToday && !item.isSelected ? 'border border-primary text-primary font-bold' : '',
              ]"
              @click="selectDate(item.dateStr)"
            >
              {{ item.day }}
              <!-- 如果是今天且未被选中，显示一个小圆点指示 -->
              <span v-if="item.isToday && !item.isSelected" class="rounded-full bg-primary h-1 w-1 bottom-1 absolute" />
            </button>
          </template>
        </div>

        <div class="mt-4 text-center">
          <button
            class="text-xs text-primary hover:underline"
            @click="selectDate(dayjs().format('YYYY-MM-DD')); viewDate = dayjs()"
          >
            回到今天
          </button>
        </div>
      </div>

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
                :class="activeTab === 'items' ? 'bg-white text-primary shadow-sm dark:bg-gray-600 dark:text-white' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'"
                @click="activeTab = 'items'"
              >
                AI 精选
              </button>
              <button
                class="text-xs font-medium px-3 py-1.5 rounded-md transition-colors"
                :class="activeTab === 'raw' ? 'bg-white text-primary shadow-sm dark:bg-gray-600 dark:text-white' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'"
                @click="activeTab = 'raw'"
              >
                原始报告
              </button>
            </div>

            <div class="mx-1 bg-gray-200 h-6 w-[1px] dark:bg-gray-600" />

            <button
              class="text-sm icon-btn px-3 py-1.5 border rounded-md flex gap-1 items-center dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
              :disabled="!newsData?.content"
              title="复制原始报告文本"
              @click="handleCopy"
            >
              <div :class="copied ? 'i-carbon-checkmark text-green-500' : 'i-carbon-copy'" />
            </button>

            <!-- [新增] AI 分析按钮 (仅在 Raw Tab 显示) -->
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
          <div v-if="!pending && !newsData?.content && (!newsData?.items || newsData.items.length === 0)" class="text-gray-400 flex flex-col h-full items-center justify-center">
            <div i-carbon-document-unknown class="text-5xl mb-4 opacity-50" />
            <p>该日期暂无新闻数据</p>
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
                  <!-- 情感标签 -->
                  <div
                    class="text-[10px] tracking-wider px-1.5 py-0.5 border rounded flex-shrink-0 uppercase"
                    :class="{
                      'bg-red-50 text-red-600 border-red-100 dark:bg-red-900/20 dark:text-red-400': item.sentiment === 'positive',
                      'bg-green-50 text-green-600 border-green-100 dark:bg-green-900/20 dark:text-green-400': item.sentiment === 'negative',
                      'bg-gray-50 text-gray-500 border-gray-200 dark:bg-gray-700 dark:text-gray-400': item.sentiment === 'neutral',
                    }"
                  >
                    {{ item.sentiment === 'positive' ? '利好' : (item.sentiment === 'negative' ? '利空' : '中性') }}
                  </div>
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
            <!-- 如果有 Raw 内容但 AI 列表为空 (比如未触发清洗或清洗失败) -->
            <div v-else class="py-10 text-center">
              <p class="text-gray-500 mb-2">
                暂无结构化数据
              </p>
              <button class="text-sm text-primary hover:underline" @click="activeTab = 'raw'">
                查看原始报告
              </button>
            </div>
          </div>

          <!-- 2. 原始报告视图 -->
          <div v-else class="p-6 h-full overflow-y-auto">
            <div v-if="newsData?.content" class="max-w-none prose dark:prose-invert">
              <div class="text-base text-gray-800 leading-relaxed font-sans whitespace-pre-wrap dark:text-gray-200">
                {{ newsData.content }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
