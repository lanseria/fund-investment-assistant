<!-- eslint-disable no-alert -->
<script setup lang="ts">
definePageMeta({
  layout: 'blank', // 使用一个空白布局
})

const authStore = useAuthStore()
const credentials = reactive({ username: '', password: '' })
const isLoading = ref(false)

async function handleLogin() {
  isLoading.value = true
  try {
    await authStore.login(credentials)
  }
  catch (error: any) {
    alert(`登录失败: ${error.data?.statusMessage || error.message}`)
  }
  finally {
    isLoading.value = false
  }
}
</script>

<template>
  <div class="flex min-h-screen items-center justify-center">
    <div class="p-8 card max-w-sm w-full space-y-6">
      <h1 class="text-2xl font-bold text-center">
        基金投资助手 - 登录
      </h1>
      <form class="space-y-4" @submit.prevent="handleLogin">
        <div>
          <label for="username" class="mb-1 block">用户名</label>
          <input id="username" v-model="credentials.username" type="text" class="input-base" required>
        </div>
        <div>
          <label for="password" class="mb-1 block">密码</label>
          <input id="password" v-model="credentials.password" type="password" class="input-base" required>
        </div>
        <button type="submit" class="btn w-full" :disabled="isLoading">
          {{ isLoading ? '登录中...' : '登录' }}
        </button>
      </form>
    </div>
  </div>
</template>
