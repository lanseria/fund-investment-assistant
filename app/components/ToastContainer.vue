<script setup lang="ts">
const toastStore = useToastStore()

// 各类型对应的图标与配色
const typeConfig: Record<string, { icon: string, color: string }> = {
  success: { icon: 'i-carbon-checkmark-filled', color: 'text-green-500' },
  error: { icon: 'i-carbon-misuse-alt', color: 'text-red-500' },
  warning: { icon: 'i-carbon-warning-alt', color: 'text-amber-500' },
  info: { icon: 'i-carbon-information', color: 'text-blue-500' },
}
</script>

<template>
  <Teleport to="body">
    <!-- 通知容器：固定在右上角，垂直堆叠 -->
    <div class="flex flex-col gap-2 pointer-events-none right-4 top-4 fixed z-[100]">
      <TransitionGroup name="toast">
        <div
          v-for="toast in toastStore.toasts"
          :key="toast.id"
          class="p-3 card flex gap-3 max-w-sm min-w-72 pointer-events-auto shadow-lg items-start"
          role="alert"
        >
          <!-- 类型图标 -->
          <div :class="[typeConfig[toast.type].icon, typeConfig[toast.type].color]" class="text-xl flex-shrink-0" />

          <!-- 内容 -->
          <div class="text-sm text-gray-700 flex-1 break-words dark:text-gray-200">
            {{ toast.message }}
          </div>

          <!-- 关闭按钮 -->
          <button
            class="text-gray-400 flex-shrink-0 hover:text-gray-600 -mt-0.5 dark:hover:text-gray-200"
            title="关闭"
            @click="toastStore.remove(toast.id)"
          >
            <div i-carbon-close />
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
/* 进入/离开动画 */
.toast-enter-active,
.toast-leave-active {
  transition: all 0.3s ease;
}

.toast-enter-from {
  opacity: 0;
  transform: translateX(100%);
}

.toast-leave-to {
  opacity: 0;
  transform: translateX(100%);
}

/* 列表项移动动画 */
.toast-move {
  transition: transform 0.3s ease;
}
</style>
