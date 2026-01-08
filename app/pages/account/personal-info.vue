<!-- eslint-disable no-alert -->
<script setup lang="ts">
import { apiFetch } from '~/utils/api'

definePageMeta({
  layout: 'account',
})

const authStore = useAuthStore()

// --- UI 状态 ---
const isToggling = ref(false)
const isEditingConfig = ref(false) // 控制高级配置折叠面板

// --- 表单数据 ---
const aiConfigForm = reactive({
  aiModel: '',
  aiTotalAmount: 100000,
  aiSystemPrompt: '',
})

// --- 初始化逻辑 ---
// 当用户信息加载后，填充表单
watch(() => authStore.user, (u) => {
  if (u) {
    aiConfigForm.aiModel = u.aiModel || 'xiaomi/mimo-v2-flash:free'
    aiConfigForm.aiTotalAmount = u.aiTotalAmount ? Number(u.aiTotalAmount) : 100000
    // 如果后端存的是 null，这里转为空字符串显示
    aiConfigForm.aiSystemPrompt = u.aiSystemPrompt || ''
  }
}, { immediate: true })

// --- 交互逻辑 ---

// 1. 切换 AI 主开关
async function toggleAiAgent() {
  if (!authStore.user)
    return
  const newState = !authStore.user.isAiAgent

  // 简单的确认交互
  if (!confirm(`确定要${newState ? '开启' : '关闭'} AI 自动操作功能吗？`))
    return

  isToggling.value = true
  try {
    // 调用通用配置更新接口
    await apiFetch('/api/user/ai-status', {
      method: 'PUT',
      body: { isAiAgent: newState },
    })
    // 乐观更新 Store
    authStore.user.isAiAgent = newState
  }
  catch (e: any) {
    alert(`操作失败: ${e.data?.message || '未知错误'}`)
    // 失败回滚
    authStore.user.isAiAgent = !newState
  }
  finally {
    isToggling.value = false
  }
}

// 2. 保存高级配置
async function saveAiConfig() {
  if (!authStore.user)
    return
  isToggling.value = true
  try {
    const res = await apiFetch<any>('/api/user/ai-status', {
      method: 'PUT',
      body: {
        aiModel: aiConfigForm.aiModel,
        aiTotalAmount: aiConfigForm.aiTotalAmount,
        // 如果为空字符串，传 null 给后端，表示使用系统默认
        aiSystemPrompt: aiConfigForm.aiSystemPrompt || null,
      },
    })

    // 更新 Store 中的用户信息
    Object.assign(authStore.user, res.config)
    isEditingConfig.value = false
    alert('AI 配置已保存成功！')
  }
  catch (e: any) {
    console.error(e)
    alert(`保存失败: ${e.message || '未知错误'}`)
  }
  finally {
    isToggling.value = false
  }
}

// 3. 恢复默认 Prompt
function fillDefaultPrompt() {
  if (confirm('确定要清空自定义 Prompt 吗？\n\n清空并保存后，系统将自动使用后端的默认策略模板。')) {
    aiConfigForm.aiSystemPrompt = ''
  }
}
</script>

<template>
  <div>
    <h1 class="text-2xl font-bold mb-4">
      个人信息
    </h1>

    <!-- 基础信息卡片 -->
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

      <!-- AI 配置区域 -->
      <div class="mt-6 pt-4 border-t dark:border-gray-700">
        <h2 class="text-lg font-bold mb-3">
          AI 智能代理设置
        </h2>

        <!-- 主开关 -->
        <div class="mb-4 p-4 border rounded-lg bg-gray-50 flex items-center justify-between dark:border-gray-700 dark:bg-gray-800">
          <div>
            <div class="font-medium flex gap-2 items-center">
              <div class="i-carbon-bot text-xl" />
              AI 自动操作开关
            </div>
            <p class="text-xs text-gray-500 mt-1">
              开启后，系统将在每个交易日 14:40 自动执行 AI 分析与下单。
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

        <!-- 高级配置折叠面板 -->
        <div class="border rounded-lg overflow-hidden dark:border-gray-700">
          <button
            class="p-4 bg-gray-50 flex w-full transition-colors items-center justify-between dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700"
            @click="isEditingConfig = !isEditingConfig"
          >
            <span class="font-medium flex gap-2 items-center">
              <div class="i-carbon-settings-adjust" />
              高级配置 (Prompt / 模型 / 资金)
            </span>
            <div class="i-carbon-chevron-down transition-transform" :class="{ 'rotate-180': isEditingConfig }" />
          </button>

          <!-- 展开的内容 -->
          <div v-if="isEditingConfig" class="p-4 border-t bg-white space-y-5 dark:border-gray-700 dark:bg-gray-900">
            <!-- 1. 模型选择 -->
            <div>
              <label class="text-sm text-gray-700 font-medium mb-1 block dark:text-gray-300">AI 模型 (OpenRouter ID)</label>
              <input
                v-model="aiConfigForm.aiModel"
                type="text"
                class="input-base"
                placeholder="例如: xiaomi/mimo-v2-flash:free"
              >
              <p class="text-xs text-gray-400 mt-1">
                必须是 OpenRouter 支持的模型 ID。
              </p>
            </div>

            <!-- 2. 资金设定 -->
            <div>
              <label class="text-sm text-gray-700 font-medium mb-1 block dark:text-gray-300">模拟总资金 (元)</label>
              <div class="relative">
                <span class="text-gray-500 left-3 top-2 absolute">¥</span>
                <input
                  v-model.number="aiConfigForm.aiTotalAmount"
                  type="number"
                  class="input-base pl-7"
                  placeholder="例如 100000"
                >
              </div>
              <p class="text-xs text-gray-400 mt-1">
                此金额将动态替换 Prompt 中的 <code class="px-1 rounded bg-gray-100 dark:bg-gray-800">[total_amount]</code> 占位符。
              </p>
            </div>

            <!-- 3. System Prompt -->
            <div>
              <div class="mb-1 flex items-center justify-between">
                <label class="text-sm text-gray-700 font-medium block dark:text-gray-300">System Prompt (系统提示词)</label>
                <button type="button" class="text-xs text-primary hover:underline" @click="fillDefaultPrompt">
                  恢复默认 / 清空
                </button>
              </div>
              <textarea
                v-model="aiConfigForm.aiSystemPrompt"
                rows="12"
                class="text-xs leading-relaxed font-mono input-base"
                placeholder="留空则使用系统默认 Prompt。支持 {{timestamp}} 和 {{total_amount}} 变量。"
              />
              <p class="text-xs text-gray-400 mt-1">
                提示：请保持 JSON 输出格式的约束，否则可能导致解析失败。
              </p>
            </div>

            <!-- 保存按钮 -->
            <div class="pt-2 flex justify-end">
              <button class="btn flex gap-2 items-center" :disabled="isToggling" @click="saveAiConfig">
                <div v-if="isToggling" class="i-carbon-circle-dash animate-spin" />
                保存配置
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
