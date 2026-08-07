<script setup lang="ts">
// 全局「回到顶部」悬浮按钮：样式与 AiChatWidget 悬浮按钮一致
// 默认布局为 window 整页滚动 (min-h-screen，无内层滚动容器)

const visible = ref(false)
const scrolling = ref(false)

function onScroll() {
  visible.value = window.scrollY > 300
}

function scrollToTop() {
  if (scrolling.value)
    return
  scrolling.value = true
  // 使用原生 smooth 行为，兼容性最好；降级为瞬切
  try {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  catch {
    window.scrollTo(0, 0)
  }
  // smooth 期间锁定重复点击，1s 后释放
  setTimeout(() => {
    scrolling.value = false
  }, 1000)
}

onMounted(() => {
  onScroll()
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('resize', onScroll, { passive: true })
})

onUnmounted(() => {
  window.removeEventListener('scroll', onScroll)
  window.removeEventListener('resize', onScroll)
})
</script>

<template>
  <Transition name="backtop">
    <button
      v-if="visible"
      class="text-white rounded-full bg-primary flex h-14 w-14 shadow-lg transition-all duration-300 items-center bottom-6 right-[5.5rem] justify-center fixed z-50 hover:bg-primary-hover hover:scale-105"
      :class="{ 'scale-90': scrolling }"
      aria-label="回到顶部"
      title="回到顶部"
      @click="scrollToTop"
    >
      <div class="i-carbon-arrow-up text-2xl" />
    </button>
  </Transition>
</template>

<style scoped>
.backtop-enter-active,
.backtop-leave-active {
  transition:
    opacity 0.25s ease,
    transform 0.25s ease;
}
.backtop-enter-from,
.backtop-leave-to {
  opacity: 0;
  transform: scale(0.8);
}
</style>
