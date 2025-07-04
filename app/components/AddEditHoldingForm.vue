<!-- app/components/AddEditHoldingForm.vue -->
<script setup lang="ts">
import type { Holding } from '~/types/holding'

const props = defineProps<{ initialData?: Holding | null }>()
const emit = defineEmits(['submit', 'cancel'])

const formData = reactive({
  code: '',
  shares: null as number | null,
  costPrice: null as number | null,
  name: '', // name 字段保留，用于可能的自定义名称
})

const isEditing = computed(() => !!props.initialData)

watch(() => props.initialData, (newData) => {
  if (newData) {
    // [重大修改] 填充新字段
    formData.code = newData.code
    formData.shares = newData.shares
    formData.costPrice = newData.costPrice
    formData.name = newData.name
  }
  else {
    // [重大修改] 重置新字段
    formData.code = ''
    formData.shares = null
    formData.costPrice = null
    formData.name = ''
  }
}, { immediate: true })

const canSubmit = computed(() => formData.code && formData.shares !== null && formData.shares > 0 && formData.costPrice !== null && formData.costPrice > 0)

function handleSubmit() {
  if (canSubmit.value) {
    // 提交时只发送需要的数据
    emit('submit', {
      code: formData.code,
      shares: formData.shares,
      costPrice: formData.costPrice,
    })
  }
}
</script>

<template>
  <form @submit.prevent="handleSubmit">
    <div class="space-y-4">
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

      <!-- [重大修改] 持有份额 -->
      <div>
        <label for="holding-shares" class="text-sm font-medium mb-1 block">持有份额</label>
        <input
          id="holding-shares"
          v-model.number="formData.shares"
          type="number"
          step="0.01"
          placeholder="例如: 1000.50"
          class="input-base"
          required
        >
      </div>

      <!-- [重大修改] 持仓成本价 -->
      <div>
        <label for="cost-price" class="text-sm font-medium mb-1 block">持仓成本价</label>
        <input
          id="cost-price"
          v-model.number="formData.costPrice"
          type="number"
          step="0.0001"
          placeholder="例如: 1.2345"
          class="input-base"
          required
        >
      </div>

      <!-- 基金名称 (可选, 保持不变) -->
      <div>
        <label for="fund-name" class="text-sm font-medium mb-1 block">基金名称 (可选)</label>
        <input
          id="fund-name"
          v-model="formData.name"
          type="text"
          placeholder="若不填，将尝试自动获取"
          class="input-base"
          disabled
        >
        <p class="text-xs text-gray-500 mt-1">
          基金名称将自动获取，此处不可编辑。
        </p>
      </div>
    </div>

    <!-- 表单操作按钮 (保持不变) -->
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
