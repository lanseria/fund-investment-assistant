<script setup lang="ts">
import type { HolidayStatus } from '~/composables/useHolidays'
import { apiFetch } from '~/utils/api'

/**
 * 导航栏右上角的节假日导入提醒徽标。
 * 当年数据缺失,或已到 12 月仍未导入次年数据时显示:
 * - 管理员点击跳转 /account/holidays 导入
 * - 普通用户点击提示联系管理员
 */
const authStore = useAuthStore()
const toast = useToast()
const status = ref<HolidayStatus | null>(null)

onMounted(async () => {
  if (!authStore.isAuthenticated)
    return
  try {
    status.value = await apiFetch<HolidayStatus>('/api/holidays/status')
  }
  catch (e) {
    console.error('获取节假日导入状态失败:', e)
  }
})

/** 当前是否需要提醒 */
const isMissing = computed(() => !!status.value?.missingCurrentYear || !!status.value?.missingNextYear)

/** 提示文案,如 "2027 年法定节假日尚未导入" */
const tipText = computed(() => {
  if (!status.value)
    return ''
  if (status.value.missingCurrentYear)
    return `${status.value.currentYear} 年法定节假日数据尚未导入,交易日判定将不准确`
  if (status.value.missingNextYear)
    return `${status.value.nextYear} 年法定节假日数据尚未导入,请及时导入以免影响明年交易日判定`
  return ''
})

function handleClick() {
  if (authStore.isAdmin) {
    navigateTo('/account/holidays')
    return
  }
  toast.warning('法定节假日数据缺失,请联系管理员导入')
}
</script>

<template>
  <button
    v-if="isMissing"
    class="px-2 py-1.5 rounded-md flex transition-colors items-center relative hover:bg-gray-100 dark:hover:bg-gray-700"
    :title="tipText"
    @click="handleClick"
  >
    <div class="i-carbon-warning-alt text-xl text-amber-500 animate-pulse" />
    <span
      class="rounded-full bg-red-500 h-2 w-2 right-0.5 top-0.5 absolute"
      aria-hidden="true"
    />
    <span class="sr-only">{{ tipText }}</span>
  </button>
</template>
