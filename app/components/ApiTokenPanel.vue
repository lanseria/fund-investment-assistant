<!-- eslint-disable no-alert -->
<script setup lang="ts">
import { useClipboard } from '@vueuse/core'
import { apiFetch } from '~/utils/api'

const { copy, copied } = useClipboard({ legacy: true })
const generatedToken = ref<string | null>(null)
const isGenerating = ref(false)

async function generateToken() {
  if (generatedToken.value) {
    if (!confirm('重新生成将导致旧 Token 立即失效，且当前未保存的 Token 将丢失。确定继续吗？'))
      return
  }
  else {
    if (!confirm('确定要生成新的 API Token 吗？旧的 Token (如果有) 将失效。'))
      return
  }

  isGenerating.value = true
  try {
    const res = await apiFetch<{ token: string }>('/api/user/api-token', { method: 'POST' })
    generatedToken.value = res.token
  }
  catch (e: any) {
    alert(`生成失败: ${e.data?.statusMessage || e.message}`)
  }
  finally {
    isGenerating.value = false
  }
}
</script>

<template>
  <div class="mt-4 pt-4 border-t dark:border-gray-700">
    <h2 class="text-lg font-bold mb-3">
      API 访问与 MCP 集成
    </h2>

    <div class="p-4 border rounded-lg bg-white dark:border-gray-700 dark:bg-gray-800">
      <p class="text-sm text-gray-600 mb-4 dark:text-gray-400">
        您可以生成 API Token 以授权 Claude AI (通过 MCP) 访问您的持仓数据。
        <br>Token 永久有效，直到您再次点击生成。
      </p>

      <div v-if="generatedToken" class="mb-4 p-3 border border-green-200 rounded-md bg-green-50 dark:border-green-800 dark:bg-green-900/20">
        <div class="text-sm text-green-800 font-bold mb-1 dark:text-green-300">
          Token 已生成 (仅显示一次)
        </div>
        <div class="flex gap-2 items-center">
          <code class="text-sm font-mono px-2 py-1 border rounded bg-white flex-grow break-all dark:border-gray-600 dark:bg-gray-900">
            {{ generatedToken }}
          </code>
          <button class="text-xs btn px-3 py-1.5 flex-shrink-0" @click="copy(generatedToken)">
            {{ copied ? '已复制' : '复制' }}
          </button>
        </div>
        <p class="text-xs text-red-500 mt-2">
          请立即复制并妥善保存。刷新页面后将无法再次查看此 Token。
        </p>
      </div>

      <button class="btn text-white bg-gray-800 dark:bg-gray-700 hover:bg-gray-900 dark:hover:bg-gray-600" :disabled="isGenerating" @click="generateToken">
        {{ isGenerating ? '生成中...' : '生成 / 重置 Token' }}
      </button>
    </div>
  </div>
</template>
