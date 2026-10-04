<!-- eslint-disable no-console -->
<script setup lang="ts">
import type { HolidayYearGroup } from '~/composables/useHolidays'
import { differenceInCalendarDays, parseISO } from 'date-fns'
import { apiFetch } from '~/utils/api'

definePageMeta({
  layout: 'account',
})

const authStore = useAuthStore()
const toast = useToast()

// --- 已导入数据 ---
const { data: holidayGroups, pending, refresh } = await useAsyncData(
  'admin-holidays',
  () => apiFetch<HolidayYearGroup[]>('/api/holidays'),
  { default: () => [] as HolidayYearGroup[] },
)

// --- 导入弹窗 ---
const isImportOpen = ref(false)
const importText = ref('')
const isImporting = ref(false)

function openImportModal() {
  importText.value = ''
  isImportOpen.value = true
}

async function handleImport() {
  let payload: any
  try {
    payload = JSON.parse(importText.value)
  }
  catch {
    toast.error('JSON 解析失败,请检查格式 (需为完整的 JSON 文本)')
    return
  }

  isImporting.value = true
  try {
    const res = await apiFetch<{ year: number, imported: number }>('/api/holidays/import', {
      method: 'POST',
      body: payload,
    })
    toast.success(`${res.year} 年节假日导入成功,共 ${res.imported} 个假期区间`)
    isImportOpen.value = false
    await refresh()
  }
  catch (e: any) {
    toast.error(`导入失败: ${e?.data?.message || e?.message || '未知错误'}`)
  }
  finally {
    isImporting.value = false
  }
}

// --- 删除某年 ---
const deletingYear = ref<number | null>(null)
const isDeleteOpen = ref(false)
const isDeleting = ref(false)

function confirmDeleteYear(year: number) {
  deletingYear.value = year
  isDeleteOpen.value = true
}

async function handleDeleteYear() {
  if (deletingYear.value == null)
    return
  isDeleting.value = true
  try {
    await apiFetch(`/api/holidays/${deletingYear.value}`, { method: 'DELETE' })
    toast.success(`${deletingYear.value} 年节假日数据已删除`)
    isDeleteOpen.value = false
    deletingYear.value = null
    await refresh()
  }
  catch (e: any) {
    toast.error(`删除失败: ${e?.data?.message || e?.message || '未知错误'}`)
  }
  finally {
    isDeleting.value = false
  }
}

// --- AI 提示词 (复制后发给任意 AI,让其根据官方放假安排生成可导入的 JSON) ---
const currentYear = new Date().getFullYear()
const promptYear = ref(currentYear + 1)
const promptYearOptions = [currentYear, currentYear + 1, currentYear + 2]

function buildPrompt(year: number): string {
  return [
    `请根据国务院办公厅公布的 ${year} 年部分节假日安排(可通过检索官方新闻获取),整理出 A 股市场全年法定节假日休市数据。`,
    '',
    '严格按以下 JSON 格式输出:',
    '{',
    `  "year": ${year},`,
    '  "holidays": [',
    '    { "name": "元旦", "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" },',
    '    { "name": "春节", "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" },',
    '    { "name": "清明节", "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" },',
    '    { "name": "劳动节", "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" },',
    '    { "name": "端午节", "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" },',
    '    { "name": "中秋节", "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" },',
    '    { "name": "国庆节", "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" }',
    '  ]',
    '}',
    '',
    '要求:',
    `1. start / end 为该假期连续休市的起止日期(YYYY-MM-DD,包含当天),所有日期必须属于 ${year} 年;`,
    '2. name 使用中文假期名称:元旦、春节、清明节、劳动节、端午节、中秋节、国庆节;',
    '3. 若官方安排中中秋节与国庆节连休合并公布,可合并为一条 (name 写 "中秋国庆");若某假期与周末相邻放假,只需覆盖官方公布的连续休市日,周末本就休市无需包含;',
    `4. 如果 ${year} 年安排尚未公布,请明确说明"尚未公布"并停止,不要编造数据;`,
    '5. 只输出 JSON 本身,不要 markdown 代码块标记,不要任何解释文字。',
  ].join('\n')
}

async function copyPrompt() {
  if (!import.meta.client)
    return
  try {
    await navigator.clipboard.writeText(buildPrompt(promptYear.value))
    toast.success(`已复制 ${promptYear.value} 年节假日生成提示词,粘贴给 AI 即可`)
  }
  catch (e) {
    console.error('复制失败:', e)
    toast.error('复制失败,请手动复制页面下方提示词')
  }
}

const promptPreview = computed(() => buildPrompt(promptYear.value))

/** 区间天数 (含起止) */
function dayCount(start: string, end: string): number {
  return differenceInCalendarDays(parseISO(end), parseISO(start)) + 1
}
</script>

<template>
  <div>
    <div class="mb-6 flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold">
          法定节假日管理
        </h1>
        <p class="text-sm text-gray-500 mt-1 dark:text-gray-400">
          A 股交易日判定依赖每年法定节假日数据,需在每年 12 月前导入次年安排
        </p>
      </div>
    </div>

    <!-- 非管理员 -->
    <EmptyState
      v-if="!authStore.isAdmin"
      icon="i-carbon-lock"
      message="仅管理员可管理节假日数据"
      description="如发现节假日数据缺失,请联系管理员导入"
    />

    <template v-else>
      <!-- 操作区 -->
      <div class="mb-6 p-5 border rounded-lg bg-white dark:border-gray-700 dark:bg-gray-800">
        <div class="flex flex-wrap gap-3 items-center justify-between">
          <div class="text-sm text-gray-500 dark:text-gray-400">
            <p>
              通过
              <span class="text-gray-700 font-medium dark:text-gray-200">「复制 AI 提示词」</span>
              获取提示词并发给 AI,由 AI 根据官方放假安排生成 JSON 后粘贴导入
            </p>
          </div>
          <div class="flex gap-2 items-center">
            <CustomSelect
              v-model="promptYear"
              :options="promptYearOptions.map(y => ({ label: `${y} 年`, value: y }))"
              class="w-30"
            />
            <button class="btn flex" @click="copyPrompt">
              <div i-carbon-copy class="mr-1" />
              复制 AI 提示词
            </button>
            <button class="btn-primary btn" @click="openImportModal">
              <div i-carbon-import class="mr-1" />
              导入数据
            </button>
          </div>
        </div>
      </div>

      <!-- 数据列表 -->
      <div v-if="pending" class="text-gray-400 py-10 text-center">
        加载中...
      </div>
      <EmptyState
        v-else-if="!holidayGroups || holidayGroups.length === 0"
        icon="i-carbon-calendar"
        message="尚未导入任何节假日数据"
        description="交易日判定将仅按周末休市,请尽快导入各年度数据"
      >
        <button class="text-sm btn mt-2" @click="openImportModal">
          去导入
        </button>
      </EmptyState>
      <div v-else class="flex flex-col gap-6">
        <div
          v-for="group in holidayGroups"
          :key="group.year"
          class="border rounded-lg bg-white overflow-hidden dark:border-gray-700 dark:bg-gray-800"
        >
          <div class="px-5 py-3 border-b flex items-center justify-between dark:border-gray-700">
            <h2 class="font-semibold flex gap-2 items-center">
              <div class="i-carbon-calendar text-lg text-primary" />
              {{ group.year }} 年
              <span class="text-xs text-gray-400 font-normal">共 {{ group.holidays.length }} 个假期</span>
            </h2>
            <button
              class="text-sm text-red-600 flex gap-1 items-center dark:text-red-400 hover:underline"
              @click="confirmDeleteYear(group.year)"
            >
              <div i-carbon-trash-can />
              删除该年
            </button>
          </div>
          <table class="text-sm w-full">
            <thead>
              <tr class="text-gray-500 text-left border-b dark:text-gray-400 dark:border-gray-700">
                <th class="font-medium px-5 py-2">
                  假期
                </th>
                <th class="font-medium px-5 py-2">
                  休市区间
                </th>
                <th class="font-medium px-5 py-2 text-right">
                  天数
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="h in group.holidays"
                :key="h.id"
                class="border-b dark:border-gray-700 last:border-0"
              >
                <td class="px-5 py-2.5">
                  {{ h.name }}
                </td>
                <td class="text-gray-500 px-5 py-2.5 dark:text-gray-400">
                  {{ h.startDate }} ~ {{ h.endDate }}
                </td>
                <td class="px-5 py-2.5 text-right tabular-nums">
                  {{ dayCount(h.startDate, h.endDate) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- 提示词预览 -->
      <details class="mt-6">
        <summary class="text-sm text-gray-500 cursor-pointer dark:text-gray-400 hover:text-primary">
          展开 AI 提示词全文 ({{ promptYear }} 年)
        </summary>
        <pre class="text-xs leading-relaxed mt-3 p-4 border rounded-lg bg-gray-100 overflow-x-auto dark:border-gray-700 dark:bg-gray-900">{{ promptPreview }}</pre>
      </details>
    </template>

    <!-- 导入弹窗 -->
    <Modal v-model="isImportOpen" title="导入法定节假日 (整年替换)">
      <div class="flex flex-col gap-3">
        <p class="text-sm text-gray-500 dark:text-gray-400">
          粘贴 AI 生成的 JSON 数据。导入将<b>替换</b>该年份的全部现有数据:
        </p>
        <textarea
          v-model="importText"
          rows="14"
          class="text-xs font-mono p-3 border rounded-md bg-gray-50 w-full dark:border-gray-700 dark:bg-gray-900"
          placeholder="{
  &quot;year&quot;: 2027,
  &quot;holidays&quot;: [
    { &quot;name&quot;: &quot;元旦&quot;, &quot;start&quot;: &quot;2027-01-01&quot;, &quot;end&quot;: &quot;2027-01-03&quot; },
    { &quot;name&quot;: &quot;春节&quot;, &quot;start&quot;: &quot;2027-02-05&quot;, &quot;end&quot;: &quot;2027-02-11&quot; }
  ]
}"
        />
        <div class="flex gap-2 justify-end">
          <button class="btn" :disabled="isImporting" @click="isImportOpen = false">
            取消
          </button>
          <button class="btn-primary btn" :disabled="isImporting || !importText.trim()" @click="handleImport">
            {{ isImporting ? '导入中...' : '确认导入' }}
          </button>
        </div>
      </div>
    </Modal>

    <!-- 删除确认 -->
    <DangerConfirm
      v-model:open="isDeleteOpen"
      :title="`删除 ${deletingYear ?? ''} 年节假日数据`"
      :message="`确定删除 ${deletingYear} 年的全部法定节假日数据吗?`"
      :impacts="['删除后该年份的法定节假日将被视为交易日(仅周末休市)', '所有定时任务的交易日判定都会立即受影响']"
      :confirm-text="String(deletingYear ?? '')"
      confirm-label="确认删除"
      :loading="isDeleting"
      @confirm="handleDeleteYear"
    />
  </div>
</template>
