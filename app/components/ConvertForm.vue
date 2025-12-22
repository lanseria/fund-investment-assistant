<!-- app/components/ConvertForm.vue -->
<script setup lang="ts">
import type { Holding } from '~/types/holding'
import { useDayjs } from '#imports'

const props = defineProps<{
  fromCode: string
  fromName: string
  currentShares: number
  // 所有可选的目标基金（必须从已添加的基金中选）
  availableFunds: Holding[]
}>()

const emit = defineEmits(['submit', 'cancel'])

const dayjs = useDayjs()
// 默认 T
const now = dayjs()
const defaultDate = now.hour() >= 15 ? now.format('YYYY-MM-DD') : now.format('YYYY-MM-DD')

const formData = reactive({
  date: defaultDate,
  shares: null as number | null,
  toCode: null as string | null,
})

// 过滤掉源基金自己
const targetOptions = computed(() => {
  return props.availableFunds
    .filter(f => f.code !== props.fromCode)
    .map(f => ({
      value: f.code,
      label: `${f.name} (${f.code})`,
    }))
})

// 快捷比例
const ratios = [
  { label: '1/4', value: 0.25 },
  { label: '1/2', value: 0.5 },
  { label: '全部', value: 1 },
]

function setShares(ratio: number) {
  formData.shares = Math.floor(props.currentShares * ratio * 100) / 100
}

const canSubmit = computed(() => {
  return (
    formData.date
    && formData.toCode
    && (formData.shares ?? 0) > 0
    && (formData.shares ?? 0) <= props.currentShares
  )
})

function handleSubmit() {
  if (canSubmit.value) {
    emit('submit', {
      fromCode: props.fromCode,
      toCode: formData.toCode,
      shares: formData.shares,
      date: formData.date,
    })
  }
}
</script>

<template>
  <form @submit.prevent="handleSubmit">
    <div class="space-y-4">
      <!-- 头部信息 -->
      <div class="text-sm text-blue-800 p-3 rounded bg-blue-50 dark:text-blue-300 dark:bg-blue-900/20">
        <div class="mb-1 flex gap-2 items-center">
          <div i-carbon-shuffle class="text-lg" />
          <span class="font-bold">基金转换 (Switching)</span>
        </div>
        <p class="text-xs opacity-80">
          卖出 A 基金，用所得资金自动买入 B 基金。
        </p>
      </div>

      <!-- 源基金 -->
      <div>
        <label class="text-sm font-medium mb-1 block">转出基金 (Source)</label>
        <div class="input-base bg-gray-100 opacity-70 flex cursor-not-allowed justify-between dark:bg-gray-700">
          <span>{{ fromName }} ({{ fromCode }})</span>
          <span class="text-xs text-gray-500 flex items-center">
            可用: {{ currentShares }} 份
          </span>
        </div>
      </div>

      <!-- 目标基金 -->
      <div>
        <label class="text-sm font-medium mb-1 block">转入基金 (Target)</label>
        <CustomSelect
          v-model="formData.toCode"
          :options="targetOptions"
          placeholder="请选择目标基金"
        />
        <p class="text-xs text-gray-500 mt-1">
          仅限从已添加的观察列表/持仓中选择。
        </p>
      </div>

      <!-- 日期 -->
      <div>
        <label class="text-sm font-medium mb-1 block">转换日期 (申报日)</label>
        <input
          v-model="formData.date"
          type="date"
          class="input-base"
          required
        >
      </div>

      <!-- 份额 -->
      <div>
        <label class="text-sm font-medium mb-1 block">转换份额</label>
        <input
          v-model.number="formData.shares"
          type="number"
          step="0.01"
          min="0.01"
          :max="currentShares"
          class="input-base"
          placeholder="请输入转出份额"
        >
        <div class="mt-2 flex gap-2">
          <button
            v-for="r in ratios"
            :key="r.value"
            type="button"
            class="text-xs px-2 py-1 rounded bg-gray-100 transition-colors dark:bg-gray-600 hover:bg-gray-200 dark:hover:bg-gray-500"
            @click="setShares(r.value)"
          >
            {{ r.label }}
          </button>
        </div>
      </div>
    </div>

    <div class="mt-6 flex justify-end space-x-3">
      <button
        type="button"
        class="text-sm text-gray-700 font-medium px-4 py-2 rounded-md bg-gray-100 dark:text-gray-200 dark:bg-gray-600 hover:bg-gray-200 dark:hover:bg-gray-500"
        @click="emit('cancel')"
      >
        取消
      </button>
      <button
        type="submit"
        class="btn text-white bg-blue-600 hover:bg-blue-700"
        :disabled="!canSubmit"
      >
        确认转换
      </button>
    </div>
  </form>
</template>
