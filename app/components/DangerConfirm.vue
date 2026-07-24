<script setup lang="ts">
import { computed, ref, watch } from 'vue'

/**
 * 危险操作确认弹窗。
 * 统一全站删除/清空/覆盖等高风险操作的确认交互，
 * 支持要求用户输入特定文本（如基金代码）二次确认。
 *
 * 用 v-model:open 控制显隐，confirm 事件触发确认。
 */
const props = withDefaults(defineProps<{
  /** 是否显示 */
  open: boolean
  /** 弹窗标题 */
  title: string
  /** 警告内容（主体描述） */
  message: string
  /** 红色危险提示列表（每条一行） */
  impacts?: string[]
  /** 若设置，用户需输入与此完全一致的文本才可确认 */
  confirmText?: string
  /** 确认按钮文案 */
  confirmLabel?: string
  /** 提交中（禁用按钮） */
  loading?: boolean
}>(), {
  confirmLabel: '确认删除',
  loading: false,
})

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'confirm'): void
}>()

// 用户输入的确认文本
const userInput = ref('')

// open 变化时重置输入
watch(() => props.open, (val) => {
  if (val)
    userInput.value = ''
})

// 是否可提交（无 confirmText 时恒真，否则需匹配）
const canConfirm = computed(() => {
  if (props.loading)
    return false
  if (!props.confirmText)
    return true
  return userInput.value.trim() === props.confirmText
})

function close() {
  emit('update:open', false)
}

function handleConfirm() {
  if (!canConfirm.value)
    return
  emit('confirm')
}
</script>

<template>
  <Modal :model-value="open" :title="title" @update:model-value="emit('update:open', $event)">
    <form @submit.prevent="handleConfirm">
      <div class="space-y-4">
        <!-- 危险提示框 -->
        <div class="text-sm text-red-800 p-3 rounded bg-red-50 space-y-2 dark:text-red-300 dark:bg-red-900/20">
          <p class="font-bold">
            {{ message }}
          </p>
          <ul v-if="impacts && impacts.length" class="ml-4 list-disc space-y-0.5">
            <li v-for="(impact, i) in impacts" :key="i">
              {{ impact }}
            </li>
          </ul>
        </div>

        <!-- 文本确认输入 -->
        <div v-if="confirmText">
          <label class="text-sm font-medium mb-1 block">
            请输入 <span class="font-bold font-mono">{{ confirmText }}</span> 以确认
          </label>
          <input
            v-model="userInput"
            type="text"
            class="font-mono input-base"
            placeholder="输入确认文本"
            autofocus
          >
        </div>
      </div>

      <div class="mt-6 pt-4 border-t flex justify-end space-x-3 dark:border-gray-700">
        <button
          type="button"
          class="px-4 py-2 rounded-md bg-gray-100 dark:bg-gray-600"
          @click="close"
        >
          取消
        </button>
        <button
          type="submit"
          class="btn text-white bg-red-600 hover:bg-red-700"
          :disabled="!canConfirm"
        >
          {{ loading ? '处理中...' : confirmLabel }}
        </button>
      </div>
    </form>
  </Modal>
</template>
