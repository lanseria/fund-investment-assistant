<!-- eslint-disable no-alert -->
<script setup lang="ts">
definePageMeta({
  layout: 'account',
})

const authStore = useAuthStore()

const isToggling = ref(false)

async function toggleAiAgent() {
  if (!authStore.user)
    return
  const newState = !authStore.user.isAiAgent

  if (!confirm(`确定要${newState ? '开启' : '关闭'} AI 自动操作功能吗？`))
    return

  isToggling.value = true
  try {
    await apiFetch('/api/user/ai-status', {
      method: 'PUT',
      body: { isAiAgent: newState },
    })
    // 手动更新本地 store 状态，避免重新 fetchUser
    authStore.user.isAiAgent = newState
  }
  catch (e: any) {
    alert(`操作失败: ${e.data?.message || '未知错误'}`)
  }
  finally {
    isToggling.value = false
  }
}
</script>

<template>
  <div>
    <h1 class="text-2xl font-bold mb-4">
      个人信息
    </h1>
    <div v-if="authStore.user" class="space-y-3">
      <div class="flex items-center">
        <span class="text-gray-500 w-24">用户名:</span>
        <span class="font-semibold">{{ authStore.user.username }}</span>
      </div>
      <div class="flex items-center">
        <span class="text-gray-500 w-24">角色:</span>
        <span class="text-xs px-2 py-1 rounded-full" :class="authStore.isAdmin ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'">
          {{ authStore.user.role }}
        </span>
      </div>
      <div class="flex items-center">
        <span class="text-gray-500 w-24">用户 ID:</span>
        <span class="font-mono">{{ authStore.user.id }}</span>
      </div>

      <div class="mt-4 pt-4 border-t dark:border-gray-700">
        <h2 class="text-lg font-bold mb-3">
          功能设置
        </h2>
        <div class="p-4 border rounded-lg bg-gray-50 flex items-center justify-between dark:border-gray-700 dark:bg-gray-800">
          <div>
            <div class="font-medium flex gap-2 items-center">
              <div class="i-carbon-bot text-xl" />
              AI 自动操作
            </div>
            <p class="text-xs text-gray-500 mt-1">
              开启后，AI 将根据策略自动进行买卖操作。
            </p>
          </div>

          <button
            class="border-2 border-transparent rounded-full inline-flex flex-shrink-0 h-6 w-11 cursor-pointer transition-colors duration-200 ease-in-out relative focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
            :class="authStore.user.isAiAgent ? 'bg-primary' : 'bg-gray-200 dark:bg-gray-600'"
            :disabled="isToggling"
            @click="toggleAiAgent"
          >
            <span
              class="rounded-full bg-white h-5 w-5 inline-block pointer-events-none ring-0 shadow transform transition duration-200 ease-in-out"
              :class="authStore.user.isAiAgent ? 'translate-x-5' : 'translate-x-0'"
            />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
