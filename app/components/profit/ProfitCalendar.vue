<script setup lang="ts">
import { formatCurrency } from '~/utils/format'

const props = defineProps<{
  calendarData: Record<string, number> // 'YYYY-MM-DD': amount
}>()

const dayjs = useDayjs()
const viewDate = ref(dayjs()) // 当前查看的月份

const weekDays = ['日', '一', '二', '三', '四', '五', '六']

const daysInMonth = computed(() => {
  const startOfMonth = viewDate.value.startOf('month')
  const endOfMonth = viewDate.value.endOf('month')
  const startDay = startOfMonth.day()
  const days = []

  // 填充月初空白
  for (let i = 0; i < startDay; i++) {
    days.push(null)
  }

  // 填充日期
  for (let i = 1; i <= endOfMonth.date(); i++) {
    const date = startOfMonth.date(i).format('YYYY-MM-DD')
    days.push({
      date,
      day: i,
      profit: props.calendarData[date] ?? 0,
      isToday: date === dayjs().format('YYYY-MM-DD'),
    })
  }
  return days
})

// 计算本月合计
const monthTotal = computed(() => {
  return daysInMonth.value.reduce((sum, d) => sum + (d?.profit || 0), 0)
})

function changeMonth(delta: number) {
  viewDate.value = viewDate.value.add(delta, 'month')
}

function getBgColor(profit: number) {
  if (profit === 0)
    return 'bg-gray-50 dark:bg-gray-800'
  // 根据盈亏金额深浅显示颜色 (简单逻辑)
  if (profit > 0) {
    if (profit > 1000)
      return 'bg-red-200 dark:bg-red-900/60'
    if (profit > 200)
      return 'bg-red-100 dark:bg-red-900/40'
    return 'bg-red-50 dark:bg-red-900/20'
  }
  else {
    if (profit < -1000)
      return 'bg-green-200 dark:bg-green-900/60'
    if (profit < -200)
      return 'bg-green-100 dark:bg-green-900/40'
    return 'bg-green-50 dark:bg-green-900/20'
  }
}

function getTextColor(profit: number) {
  if (profit > 0)
    return 'text-red-600 dark:text-red-300'
  if (profit < 0)
    return 'text-green-600 dark:text-green-300'
  return 'text-gray-400'
}
</script>

<template>
  <div class="p-4 card">
    <div class="mb-4 flex items-center justify-between">
      <h3 class="text-lg font-bold flex gap-2 items-center">
        每日盈亏日历
        <span class="text-xs text-gray-500 font-normal px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-700">
          月合计: <span :class="monthTotal >= 0 ? 'text-red-500' : 'text-green-500'">{{ formatCurrency(monthTotal) }}</span>
        </span>
      </h3>
      <div class="flex gap-2 items-center">
        <button class="icon-btn p-1" @click="changeMonth(-1)">
          <div i-carbon-chevron-left />
        </button>
        <span class="font-bold font-mono text-center w-20">{{ viewDate.format('YYYY-MM') }}</span>
        <button class="icon-btn p-1" @click="changeMonth(1)">
          <div i-carbon-chevron-right />
        </button>
      </div>
    </div>

    <!-- 星期头 -->
    <div class="mb-2 grid grid-cols-7">
      <div v-for="wd in weekDays" :key="wd" class="text-xs text-gray-400 font-bold text-center">
        {{ wd }}
      </div>
    </div>

    <!-- 日历格 -->
    <div class="gap-1 grid grid-cols-7 sm:gap-2">
      <div
        v-for="(day, idx) in daysInMonth"
        :key="idx"
        class="p-1 rounded-md flex flex-col aspect-square ring-primary/50 transition-colors items-center justify-center relative hover:ring-2"
        :class="day ? getBgColor(day.profit) : ''"
      >
        <template v-if="day">
          <span class="text-xs text-gray-600 font-bold mb-0.5 dark:text-gray-400">{{ day.day }}</span>
          <span
            class="text-[10px] font-bold font-mono text-center w-full truncate sm:text-xs"
            :class="getTextColor(day.profit)"
          >
            <!-- [修改] 移除 Math.floor，使用 toFixed(2) 保留两位小数 -->
            {{ day.profit !== 0 ? (day.profit > 0 ? `+${day.profit.toFixed(2)}` : day.profit.toFixed(2)) : '-' }}
          </span>
          <!-- 今日标记 -->
          <div v-if="day.isToday" class="rounded-full bg-blue-500 h-1.5 w-1.5 right-1 top-1 absolute" />
        </template>
      </div>
    </div>
  </div>
</template>
