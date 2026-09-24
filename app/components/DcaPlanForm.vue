<script setup lang="ts">
import type { DcaFrequency, DcaPlan, DcaPlanPayload } from '~/types/dcaPlan'
import { format } from 'date-fns'
import { anchorDayLabel, computeNextExecutionDate, frequencyLabel } from '~~/shared/dcaPlan'

const props = defineProps<{
  /** 编辑模式传入已有计划;创建模式不传 */
  plan?: DcaPlan | null
  /** 创建模式预填的基金代码 (如从基金详情页「设为定投」进入) */
  presetFundCode?: string
  presetFundName?: string
  loading?: boolean
}>()

const emit = defineEmits<{
  submit: [payload: DcaPlanPayload]
  cancel: []
}>()

const isEditing = computed(() => !!props.plan)

const formData = reactive({
  fundCode: props.plan?.fundCode ?? props.presetFundCode ?? '',
  amount: props.plan?.amount ?? null as number | null,
  frequency: (props.plan?.frequency ?? 'monthly') as DcaFrequency,
  anchorDay: props.plan?.anchorDay ?? 25 as number | null,
})

// 频率切换时把锚点收敛到合法范围 (月 25 日对周计划无意义)
watch(() => formData.frequency, (freq) => {
  if (freq === 'daily' || freq === 'biweekly')
    formData.anchorDay = null
  else if (freq === 'weekly')
    formData.anchorDay = 1
  else if (freq === 'monthly' && (!formData.anchorDay || formData.anchorDay > 28))
    formData.anchorDay = 25
})

// 周计划锚点选项 (周一~周五,周末非交易日)
const weekdayOptions = [
  { value: 1, label: '周一' },
  { value: 2, label: '周二' },
  { value: 3, label: '周三' },
  { value: 4, label: '周四' },
  { value: 5, label: '周五' },
]
// 月计划锚点选项 (1-28 日,规避月末缺 29-31 日的顺延歧义)
const monthDayOptions = Array.from({ length: 28 }, (_, i) => ({ value: i + 1, label: `${i + 1} 日` }))

// 基金名称: 编辑时来自计划,预填时由外部传入,否则尝试从持仓列表反查
const holdingStore = useHoldingStore()
const fundName = computed(() =>
  props.plan?.fundName
  ?? props.presetFundName
  ?? holdingStore.holdings.find(h => h.code === formData.fundCode)?.name,
)

const isFundCodeLocked = isEditing

// 首期(下次)扣款日实时预览: 与服务端同一套 shared 计算逻辑
const nextExecutionPreview = computed(() => {
  if (formData.frequency !== 'daily' && formData.frequency !== 'biweekly' && !formData.anchorDay)
    return null
  try {
    return computeNextExecutionDate(format(new Date(), 'yyyy-MM-dd'), formData.frequency, formData.anchorDay)
  }
  catch {
    return null
  }
})

const canSubmit = computed(() => {
  if ((formData.amount ?? 0) <= 0)
    return false
  if (!isFundCodeLocked.value && !/^\d{6}$/.test(formData.fundCode))
    return false
  if (formData.frequency !== 'daily' && formData.frequency !== 'biweekly' && !formData.anchorDay)
    return false
  return true
})

function handleSubmit() {
  if (!canSubmit.value)
    return
  emit('submit', {
    fundCode: formData.fundCode,
    amount: formData.amount ?? undefined,
    frequency: formData.frequency,
    anchorDay: formData.frequency === 'daily' || formData.frequency === 'biweekly' ? null : formData.anchorDay,
  })
}
</script>

<template>
  <form @submit.prevent="handleSubmit">
    <div class="space-y-4">
      <div
        v-if="isEditing"
        class="text-sm p-3 rounded bg-gray-50 dark:bg-gray-700"
      >
        <p><span class="text-gray-500 mr-2">基金:</span>{{ fundName }} ({{ formData.fundCode }})</p>
        <p class="text-xs text-gray-500 mt-1">
          当前计划: {{ frequencyLabel(plan!.frequency) }}{{ anchorDayLabel(plan!.frequency, plan!.anchorDay) }} · 每期 ¥{{ plan!.amount }}
        </p>
      </div>

      <!-- 基金代码 (仅创建模式) -->
      <div v-if="!isEditing">
        <label class="text-sm font-medium mb-1 block">基金代码</label>
        <input
          v-model="formData.fundCode"
          type="text"
          maxlength="6"
          class="font-mono input-base"
          placeholder="6位基金代码，如 001111"
          :disabled="!!presetFundCode"
          autofocus
        >
        <p v-if="fundName" class="text-xs text-gray-500 mt-1">
          {{ fundName }}
        </p>
      </div>

      <!-- 每期金额 -->
      <div>
        <label class="text-sm font-medium mb-1 block">每期定投金额 (元)</label>
        <div class="relative">
          <span class="text-gray-500 left-3 top-2 absolute">¥</span>
          <input
            v-model.number="formData.amount"
            type="number"
            step="0.01"
            min="0.01"
            class="input-base pl-7"
            placeholder="请输入每期金额"
          >
        </div>
      </div>

      <!-- 定投频率 -->
      <div>
        <label class="text-sm font-medium mb-1 block">定投频率</label>
        <select v-model="formData.frequency" class="input-base">
          <option value="daily">
            每天
          </option>
          <option value="weekly">
            每周
          </option>
          <option value="biweekly">
            每两周
          </option>
          <option value="monthly">
            每月
          </option>
        </select>
      </div>

      <!-- 扣款日 (每天/每两周无锚点) -->
      <div v-if="formData.frequency !== 'daily' && formData.frequency !== 'biweekly'">
        <label class="text-sm font-medium mb-1 block">
          扣款日 ({{ formData.frequency === 'weekly' ? '星期' : '日期' }})
        </label>
        <select v-model.number="formData.anchorDay" class="input-base">
          <template v-if="formData.frequency === 'weekly'">
            <option v-for="opt in weekdayOptions" :key="opt.value" :value="opt.value">
              每{{ opt.label }}
            </option>
          </template>
          <template v-else>
            <option v-for="opt in monthDayOptions" :key="opt.value" :value="opt.value">
              每月 {{ opt.label }}
            </option>
          </template>
        </select>
        <p v-if="nextExecutionPreview" class="text-xs text-gray-500 mt-1">
          首期扣款日: <span class="font-mono">{{ nextExecutionPreview }}</span>（遇周末/节假日自动顺延）
        </p>
      </div>
      <p v-if="formData.frequency === 'daily'" class="text-xs text-gray-500 mt-1">
        每个交易日自动扣款一次，周末/节假日自动跳过。
        <span v-if="nextExecutionPreview">首期扣款日: <span class="font-mono">{{ nextExecutionPreview }}</span></span>
      </p>
      <p v-else-if="formData.frequency === 'biweekly'" class="text-xs text-gray-500 mt-1">
        每两周自动扣款一次，遇周末/节假日自动顺延。
        <span v-if="nextExecutionPreview">首期扣款日: <span class="font-mono">{{ nextExecutionPreview }}</span></span>
      </p>

      <!-- 结算说明 -->
      <div class="text-xs text-gray-500 p-3 rounded bg-gray-50 dark:bg-gray-700">
        扣款日由系统在每个交易日凌晨自动下单，按当日收盘净值确认份额并从可用现金中扣款，可在「待确认」中撤销。
      </div>
    </div>

    <div class="mt-6 flex justify-end space-x-3">
      <button
        type="button"
        class="text-sm text-gray-700 font-medium px-4 py-2 rounded-md bg-gray-100 dark:text-gray-200 dark:bg-gray-600 hover:bg-gray-200 dark:hover:bg-gray-500"
        :disabled="loading"
        @click="emit('cancel')"
      >
        取消
      </button>
      <button
        type="submit"
        class="btn bg-red-500 flex items-center justify-center hover:bg-red-600"
        :disabled="!canSubmit || loading"
      >
        <span v-if="loading" class="flex gap-2 items-center">
          <div class="i-carbon-circle-dash animate-spin" />
          提交中...
        </span>
        <span v-else>{{ isEditing ? '保存修改' : '创建计划' }}</span>
      </button>
    </div>
  </form>
</template>
