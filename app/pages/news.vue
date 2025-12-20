<!-- app/pages/news.vue -->
<script setup lang="ts">
import { useClipboard } from '@vueuse/core'
import { appName } from '~/constants'

useHead({
  title: `市场情报 - ${appName}`,
})

const dayjs = useDayjs()
const { copy, copied } = useClipboard()

// --- 状态管理 ---
const selectedDate = ref(dayjs().format('YYYY-MM-DD')) // 当前选中的日期（用于查询数据）
const viewDate = ref(dayjs()) // 当前日历视图显示的月份

// --- 获取数据 ---
const { data: newsData, pending, refresh } = await useAsyncData(
  `news-${selectedDate.value}`,
  () => apiFetch(`/api/news/${selectedDate.value}`),
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
      <div class="card flex flex-grow flex-col min-h-[500px] w-full">
        <!-- 标题栏 -->
        <div class="p-4 border-b flex items-center justify-between dark:border-gray-700">
          <div>
            <h2 class="text-lg font-bold">
              {{ newsData?.title || `${selectedDate} 简报` }}
            </h2>
            <div class="text-xs text-gray-400 font-mono mt-0.5">
              {{ selectedDate }}
            </div>
          </div>
          <div class="flex gap-2">
            <button
              class="text-sm icon-btn px-3 py-1.5 border rounded-md flex gap-1 items-center dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
              :disabled="!newsData?.content"
              @click="handleCopy"
            >
              <div :class="copied ? 'i-carbon-checkmark text-green-500' : 'i-carbon-copy'" />
              {{ copied ? '已复制' : '复制全文' }}
            </button>
          </div>
        </div>

        <!-- 内容区域 -->
        <div class="p-6 flex-grow relative">
          <div v-if="pending" class="bg-white/50 flex items-center inset-0 justify-center absolute z-10 dark:bg-gray-800/50">
            <div i-carbon-circle-dash class="text-3xl text-primary animate-spin" />
          </div>

          <div v-if="newsData?.content" class="max-w-none prose dark:prose-invert">
            <!-- 使用 whitespace-pre-wrap 保留 markdown 文本的换行格式，或者如果你引入了 markdown 渲染器可以使用 v-html -->
            <div class="text-base text-gray-800 leading-relaxed font-sans whitespace-pre-wrap dark:text-gray-200">
              {{ newsData.content }}
            </div>
          </div>

          <div v-else-if="!pending" class="text-gray-400 flex flex-col h-full min-h-[300px] items-center justify-center">
            <div i-carbon-document-unknown class="text-5xl mb-4 opacity-50" />
            <p>该日期暂无新闻数据</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
