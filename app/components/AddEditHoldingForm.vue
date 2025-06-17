<script setup lang="ts">
import type { Holding } from '~/types/holding'

const props = defineProps<{
  initialData?: Holding | null // 接收初始数据，用于编辑模式
}>()

const emit = defineEmits(['submit', 'cancel'])

const formData = reactive({
  code: '',
  holding_amount: null as number | null,
  name: '', // 可选的名称
})

const isEditing = computed(() => !!props.initialData)

// 当 initialData 变化时（例如，从添加到编辑），填充表单
watch(() => props.initialData, (newData) => {
  if (newData) {
    formData.code = newData.code
    formData.holding_amount = newData.holding_amount
    formData.name = newData.name
  }
  else {
    // 如果是添加模式，重置表单
    formData.code = ''
    formData.holding_amount = null
    formData.name = ''
  }
}, { immediate: true })

const canSubmit = computed(() => formData.code && formData.holding_amount && formData.holding_amount > 0)

function handleSubmit() {
  if (canSubmit.value) {
    // 触发 submit 事件，并将表单数据传递给父组件
    emit('submit', { ...formData })
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

      <!-- 持有金额 -->
      <div>
        <label for="holding-amount" class="text-sm font-medium mb-1 block">持有金额 (元)</label>
        <input
          id="holding-amount"
          v-model.number="formData.holding_amount"
          type="number"
          step="0.01"
          placeholder="例如: 5000.00"
          class="input-base"
          required
        >
      </div>

      <!-- 基金名称 (可选) -->
      <div>
        <label for="fund-name" class="text-sm font-medium mb-1 block">基金名称 (可选)</label>
        <input
          id="fund-name"
          v-model="formData.name"
          type="text"
          placeholder="若不填，将尝试自动获取"
          class="input-base"
        >
        <p class="text-xs text-gray-500 mt-1">
          对于QDII等特殊基金，可能需要手动填写。
        </p>
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
