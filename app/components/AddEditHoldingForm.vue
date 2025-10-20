<script setup lang="ts">
import type { Holding } from '~/types/holding'

const props = defineProps<{ initialData?: Holding | null }>()
const emit = defineEmits(['submit', 'cancel'])

const formData = reactive({
  code: '',
  shares: null as number | null,
  costPrice: null as number | null,
  name: '',
  fundType: 'open' as 'open' | 'qdii_lof',
})

const isEditing = computed(() => !!props.initialData)

watch(() => props.initialData, (newData) => {
  if (newData) {
    formData.code = newData.code
    formData.shares = newData.shares
    formData.costPrice = newData.costPrice
    formData.name = newData.name
  }
  else {
    formData.code = ''
    formData.shares = null
    formData.costPrice = null
    formData.name = ''
    formData.fundType = 'open'
  }
}, { immediate: true })

const canSubmit = computed(() => {
  if (!formData.code)
    return false // 代码是必须的
  // 如果填写了份额或成本价，则两者都必须是正数
  if (formData.shares !== null || formData.costPrice !== null) {
    return (formData.shares ?? 0) > 0 && (formData.costPrice ?? 0) > 0
  }
  // 如果都没填，只关注基金，也允许提交
  return true
})

function handleSubmit() {
  if (canSubmit.value) {
    const payload: any = {
      code: formData.code,
      // [修改] 如果为空字符串或0，则发送null
      shares: formData.shares || null,
      costPrice: formData.costPrice || null,
    }
    if (!isEditing.value)
      payload.fundType = formData.fundType

    emit('submit', payload)
  }
}
</script>

<template>
  <form @submit.prevent="handleSubmit">
    <div class="space-y-4">
      <!-- 基金类型选择器 -->
      <div v-if="!isEditing">
        <label for="fund-type" class="text-sm font-medium mb-1 block">基金类型</label>
        <select
          id="fund-type"
          v-model="formData.fundType"
          class="input-base"
        >
          <option value="open">
            普通开放式基金
          </option>
          <option value="qdii_lof">
            QDII-LOF / 场内基金
          </option>
        </select>
        <p class="text-xs text-gray-500 mt-1">
          选择正确类型以获取实时价格。此项添加后不可修改。
        </p>
      </div>

      <!-- 基金代码 -->
      <div>
        <label for="fund-code" class="text-sm font-medium mb-1 block">基金代码</label>
        <input
          id="fund-code"
          v-model="formData.code"
          type="text"
          placeholder="例如: 161725"
          :disabled="isEditing"
          class="input-base"
          required
        >
      </div>

      <!-- 持有份额 -->
      <div>
        <label for="holding-shares" class="text-sm font-medium mb-1 block">持有份额 (选填)</label>
        <input
          id="holding-shares"
          v-model.number="formData.shares"
          type="number"
          step="0.01"
          placeholder="若不持仓，可留空"
          class="input-base"
        >
      </div>

      <!-- 持仓成本价 -->
      <div>
        <label for="cost-price" class="text-sm font-medium mb-1 block">持仓成本价 (选填)</label>
        <input
          id="cost-price"
          v-model.number="formData.costPrice"
          type="number"
          step="0.0001"
          placeholder="若不持仓，可留空"
          class="input-base"
        >
      </div>
    </div>

    <!-- 表单操作按钮 -->
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
        class="btn"
        :disabled="!canSubmit"
      >
        {{ isEditing ? '保存更改' : '确认添加' }}
      </button>
    </div>
  </form>
</template>
