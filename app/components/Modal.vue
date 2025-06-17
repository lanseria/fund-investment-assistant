<script setup lang="ts">
const props = defineProps<{
  modelValue: boolean // 使用 v-model 控制模态框的显示与隐藏
  title: string
}>()

const emit = defineEmits(['update:modelValue'])

// 点击背景或按 Esc 键关闭模态框
function closeModal() {
  emit('update:modelValue', false)
}

// 监听 Esc 键
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.modelValue)
    closeModal()
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <!-- 使用 Transition 组件实现淡入淡出效果 -->
  <Transition name="fade">
    <!-- 模态框容器 -->
    <div
      v-if="modelValue"
      class="fixed inset-0 z-50 flex items-center justify-center"
      aria-modal="true"
      role="dialog"
    >
      <!-- 背景遮罩 -->
      <div
        class="fixed inset-0 bg-black/50"
        @click="closeModal"
      />

      <!-- 模态框内容面板 -->
      <div class="relative w-full max-w-md bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 m-4">
        <!-- 头部 -->
        <div class="flex items-center justify-between pb-4 border-b dark:border-gray-700">
          <h3 class="text-xl font-bold">
            {{ title }}
          </h3>
          <button class="icon-btn !text-2xl" @click="closeModal">
            <div i-carbon-close />
          </button>
        </div>

        <!-- 内容区域 (通过插槽传入) -->
        <div class="mt-4">
          <slot />
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
/* 定义 Vue Transition 的过渡效果 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>