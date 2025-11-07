export default defineNuxtPlugin(async () => {
  // 仅在客户端执行，或根据需要调整
  // 如果 SSR 页面也需要字典，则可以移除 if 判断
  if (import.meta.client) {
    const dictStore = useDictStore()
    // 触发 action，它内部有防止重复请求的逻辑
    await dictStore.fetchAllDicts()
  }
})
