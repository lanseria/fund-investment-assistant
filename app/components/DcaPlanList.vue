<!-- eslint-disable no-alert -->
<script setup lang="ts">
import type { DcaPlan } from '~/types/dcaPlan'
import { anchorDayLabel, frequencyLabel } from '~~/shared/dcaPlan'

const props = defineProps<{
  /** 预填基金代码 (从基金详情页进入): 无该基金的计划时自动打开新建表单 */
  presetFundCode?: string
  presetFundName?: string
}>()

const store = useDcaPlanStore()

// 视图状态: null = 列表;'create' = 新建表单;DcaPlan = 编辑该计划
const formState = ref<'create' | DcaPlan | null>(null)
const isSubmitting = ref(false)
const togglingId = ref<number | null>(null)

onMounted(async () => {
  const plans = await store.fetchPlans()
  // 从详情页进入且该基金还没有定投计划 → 直接打开新建表单
  if (props.presetFundCode && plans && !plans.some(p => p.fundCode === props.presetFundCode))
    formState.value = 'create'
})

function openCreate() {
  formState.value = 'create'
}

function openEdit(plan: DcaPlan) {
  formState.value = plan
}

function backToList() {
  formState.value = null
}

async function handleSubmit(payload: any) {
  isSubmitting.value = true
  try {
    if (formState.value && formState.value !== 'create')
      await store.updatePlan(formState.value.id, payload)
    else
      await store.createPlan(payload)
    formState.value = null
  }
  catch {
    // 错误提示由 store 统一 alert,保持表单打开
  }
  finally {
    isSubmitting.value = false
  }
}

/** 启停切换 (暂停的计划保留,不再自动扣款) */
async function toggleEnabled(plan: DcaPlan) {
  togglingId.value = plan.id
  try {
    await store.updatePlan(plan.id, { enabled: !plan.enabled })
  }
  finally {
    togglingId.value = null
  }
}

async function handleDelete(plan: DcaPlan) {
  const name = plan.fundName || plan.fundCode
  if (!confirm(`确定删除「${name}」的定投计划吗？\n(已生成的待确认买入单不受影响)`))
    return
  await store.deletePlan(plan.id)
}
</script>

<template>
  <div>
    <!-- 新建/编辑表单 -->
    <DcaPlanForm
      v-if="formState"
      :plan="formState === 'create' ? null : formState"
      :preset-fund-code="formState === 'create' ? presetFundCode : undefined"
      :preset-fund-name="formState === 'create' ? presetFundName : undefined"
      :loading="isSubmitting"
      @submit="handleSubmit"
      @cancel="backToList"
    />

    <!-- 计划列表 -->
    <template v-else>
      <div class="mb-3 flex justify-end">
        <button class="text-sm btn flex items-center" @click="openCreate">
          <div i-carbon-add mr-1 />
          新建计划
        </button>
      </div>

      <div v-if="store.isLoading" class="text-gray-400 flex h-40 items-center justify-center">
        <div i-carbon-circle-dash class="text-3xl animate-spin" />
      </div>

      <div v-else-if="store.plans.length === 0" class="text-gray-500 py-12 text-center">
        <div i-carbon-recently-viewed class="text-4xl mx-auto mb-3 opacity-50" />
        <p>暂无定投计划</p>
        <p class="text-xs mt-1 opacity-70">
          创建后系统将在每个扣款日自动帮你买入
        </p>
      </div>

      <ul v-else class="space-y-2">
        <li
          v-for="plan in store.plans"
          :key="plan.id"
          class="p-3 border rounded-md transition-colors dark:border-gray-600"
          :class="plan.enabled ? 'border-gray-200 dark:border-gray-600' : 'opacity-60 border-dashed'"
        >
          <div class="flex gap-2 items-center justify-between">
            <div class="min-w-0">
              <p class="font-medium truncate">
                {{ plan.fundName || plan.fundCode }}
                <span class="text-xs text-gray-400 font-mono ml-1">{{ plan.fundCode }}</span>
              </p>
              <p class="text-xs text-gray-500 mt-1">
                {{ frequencyLabel(plan.frequency) }}{{ anchorDayLabel(plan.frequency, plan.anchorDay) }} ·
                每期 <span class="text-red-500 font-mono">¥{{ plan.amount.toFixed(2) }}</span>
              </p>
              <p class="text-xs text-gray-500 mt-0.5">
                <template v-if="plan.enabled">
                  下次扣款: <span class="font-mono">{{ plan.nextExecutionDate }}</span>
                </template>
                <template v-else>
                  已暂停
                </template>
                <span v-if="plan.lastExecutionDate" class="ml-2 opacity-70">上次: {{ plan.lastExecutionDate }}</span>
              </p>
            </div>
            <div class="flex shrink-0 gap-1 items-center">
              <button
                class="icon-btn"
                :class="{ 'text-primary': plan.enabled }"
                :title="plan.enabled ? '暂停定投' : '恢复定投'"
                :disabled="togglingId === plan.id"
                @click="toggleEnabled(plan)"
              >
                <div :class="plan.enabled ? 'i-carbon-pause' : 'i-carbon-play'" />
              </button>
              <button class="icon-btn" title="编辑计划" @click="openEdit(plan)">
                <div i-carbon-edit />
              </button>
              <button class="icon-btn text-red-500" title="删除计划" @click="handleDelete(plan)">
                <div i-carbon-trash-can />
              </button>
            </div>
          </div>
        </li>
      </ul>

      <p class="text-xs text-gray-400 leading-relaxed mt-4">
        定投在扣款日凌晨自动生成买入单，按当日净值于次日凌晨确认，并从可用现金扣款；扣款日前可随时暂停或撤销。
      </p>
    </template>
  </div>
</template>
