<script setup lang="ts">
import { appName } from '~/constants'

// 1. 获取所有需要的 store
const authStore = useAuthStore()
const holdingStore = useHoldingStore()
const marketStore = useMarketStore()

useHead({
  title: appName,
})

// 2. 监听认证状态的变化
watch(() => authStore.isAuthenticated, (isAuth) => {
  if (isAuth) {
    // 如果用户已认证，则启动 SSE 连接 (盘中估值由服务端 cron 刷新并经 SSE 推送)
    console.warn('[Global] 用户已认证，正在启动 SSE...')
    holdingStore.startSseUpdates()
    marketStore.startMarketUpdates()
  }
  else {
    // 如果用户未认证（或已登出），则关闭 SSE 连接
    console.warn('[Global] 用户未认证，正在关闭服务...')
    holdingStore.stopSseUpdates()
    marketStore.stopMarketUpdates()
  }
}, {
  immediate: true, // 确保在组件加载时立即执行一次，处理初始状态
})

// 3. (可选但推荐) 在应用卸载时（例如关闭标签页）也进行清理
onUnmounted(() => {
  holdingStore.stopSseUpdates()
  marketStore.stopMarketUpdates()
})
</script>

<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
  <!-- 全局 AI 对话助手悬浮入口（仅登录用户可见） -->
  <AiChatWidget v-if="authStore.isAuthenticated" />
</template>

<style>
html,
body,
#__nuxt {
  height: 100vh;
  margin: 0;
  padding: 0;
}

html.dark {
  color-scheme: dark;
}
</style>
