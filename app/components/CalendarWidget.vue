<!-- app/components/CalendarWidget.vue -->
<script setup lang="ts">
const props = defineProps<{
  modelValue: string // 格式: YYYY-MM-DD
}>()

const emit = defineEmits(['update:modelValue'])

const dayjs = useDayjs()
const viewDate = ref(dayjs(props.modelValue)) // 当前视图显示的月份

// 如果外部选中的日期变了，且不在当前视图月份内，自动跳转视图到该月
watch(() => props.modelValue, (newVal) => {
  const newDate = dayjs(newVal)
  if (!newDate.isSame(viewDate.value, 'month'))
    viewDate.value = newDate
})

const weekDays = ['日', '一', '二', '三', '四', '五', '六']

const calendarDays = computed(() => {
  const year = viewDate.value.year()
  const month = viewDate.value.month()
  const firstDayOfMonth = dayjs(new Date(year, month, 1))
  const daysInMonth = firstDayOfMonth.daysInMonth()
  const startDayOfWeek = firstDayOfMonth.day()

  const days = []
  // 填充空白
  for (let i = 0; i < startDayOfWeek; i++) {
    days.push({ day: null, dateStr: '' })
  }
  // 填充日期
  for (let i = 1; i <= daysInMonth; i++) {
    const dateStr = dayjs(new Date(year, month, i)).format('YYYY-MM-DD')
    days.push({
      day: i,
      dateStr,
      isToday: dateStr === dayjs().format('YYYY-MM-DD'),
      isSelected: dateStr === props.modelValue,
    })
  }
  return days
})

function changeMonth(delta: number) {
  viewDate.value = viewDate.value.add(delta, 'month')
}

function selectDate(dateStr: string) {
  if (dateStr)
    emit('update:modelValue', dateStr)
}

function jumpToToday() {
  const today = dayjs().format('YYYY-MM-DD')
  emit('update:modelValue', today)
  viewDate.value = dayjs()
}
</script>

<template>
  <div class="p-4 card w-full select-none md:flex-shrink-0 md:w-auto">
    <!-- 头部：月份切换 -->
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
      <div v-for="wd in weekDays" :key="wd" class="text-xs text-gray-400 font-medium text-center flex h-8 items-center justify-center">
        {{ wd }}
      </div>
    </div>

    <!-- 日期格子 -->
    <div class="gap-1 grid grid-cols-7">
      <template v-for="(item, index) in calendarDays" :key="index">
        <div v-if="!item.day" class="h-10 w-10" />
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
          <span v-if="item.isToday && !item.isSelected" class="rounded-full bg-primary h-1 w-1 bottom-1 absolute" />
        </button>
      </template>
    </div>

    <!-- 回到今天 -->
    <div class="mt-4 text-center">
      <button class="text-xs text-primary hover:underline" @click="jumpToToday">
        回到今天
      </button>
    </div>
  </div>
</template>
