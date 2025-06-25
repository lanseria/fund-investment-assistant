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
      class="flex items-center inset-0 justify-center fixed z-50"
      aria-modal="true"
      role="dialog"
    >
      <!-- 背景遮罩 -->
      <div
        class="bg-black/50 inset-0 fixed"
        @click="closeModal"
      />

      <!-- 模态框内容面板 -->
      <div class="m-4 p-6 rounded-lg bg-white max-w-md w-full shadow-xl relative dark:bg-gray-800">
        <!-- 头部 -->
        <div class="pb-4 border-b flex items-center justify-between dark:border-gray-700">
          <h3 class="text-xl font-bold">
            {{ title }}
          </h3>
          <button class="icon-btn text-2xl" @click="closeModal">
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
