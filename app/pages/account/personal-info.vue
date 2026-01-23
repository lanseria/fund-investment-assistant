<!-- eslint-disable no-alert -->
<script setup lang="ts">
import AiSettingsPanel from '~/components/AiSettingsPanel.vue'
import { apiFetch } from '~/utils/api'
import { formatCurrency } from '~/utils/format'

definePageMeta({
  layout: 'account',
})

const authStore = useAuthStore()
const isToggling = ref(false)

// 表单数据 (直接绑定到组件，但独立于 authStore 以便编辑)
const aiForm = reactive({
  isAiAgent: false,
  aiSystemPrompt: '',
})

// 可用现金编辑状态
const isEditingCash = ref(false)
const localAvailableCash = ref(0)
const isSavingCash = ref(false)

// 初始化
watch(() => authStore.user, (u) => {
  if (u) {
    aiForm.isAiAgent = u.isAiAgent
    aiForm.aiSystemPrompt = u.aiSystemPrompt || ''
    localAvailableCash.value = u.availableCash ? Number(u.availableCash) : 0
  }
}, { immediate: true })

// 保存可用现金
async function saveCash() {
  isSavingCash.value = true
  try {
    await apiFetch('/api/user/ai-status', {
      method: 'PUT',
      body: { availableCash: localAvailableCash.value },
    })
    if (authStore.user) {
      authStore.user.availableCash = String(localAvailableCash.value)
    }
    isEditingCash.value = false
  }
  catch (e: any) {
    alert(`保存失败: ${e.message}`)
  }
  finally {
    isSavingCash.value = false
  }
}

// 处理开关 (Immediate Mode)
async function handleToggle(newState: boolean) {
  if (!confirm(`确定要${newState ? '开启' : '关闭'} AI 自动操作功能吗？`))
    return

  isToggling.value = true
  try {
    await apiFetch('/api/user/ai-status', {
      method: 'PUT',
      body: { isAiAgent: newState },
    })
    if (authStore.user)
      authStore.user.isAiAgent = newState
    aiForm.isAiAgent = newState
  }
  catch (e: any) {
    alert(`操作失败: ${e.data?.statusMessage || '未知错误'}`)
  }
  finally {
    isToggling.value = false
  }
}

// 处理配置保存 (Immediate Mode)
async function handleSaveConfig() {
  isToggling.value = true
  try {
    await apiFetch('/api/user/ai-status', {
      method: 'PUT',
      body: {
        aiSystemPrompt: aiForm.aiSystemPrompt || null,
      },
    })
    alert('AI 配置已保存成功！')
  }
  catch (e: any) {
    alert(`保存失败: ${e.message}`)
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

    <div v-if="authStore.user" class="space-y-4">
      <!-- 基础信息卡片 -->
      <div class="p-4 border rounded-lg bg-white space-y-3 dark:border-gray-700 dark:bg-gray-800">
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

        <!-- [修改] 可用现金编辑行 -->
        <div class="flex h-8 items-center">
          <span class="text-gray-500 w-24">可用现金:</span>

          <!-- 查看模式 -->
          <div v-if="!isEditingCash" class="group flex gap-3 items-center">
            <span class="text-lg text-gray-800 font-bold font-numeric dark:text-gray-200">
              {{ formatCurrency(authStore.user.availableCash) }}
            </span>
            <button
              class="text-xs icon-btn text-primary opacity-0 transition-opacity group-hover:opacity-100"
              title="修改现金余额"
              @click="isEditingCash = true"
            >
              <div i-carbon-edit />
            </button>
            <span class="text-xs text-gray-400"> (买入扣除/卖出增加)</span>
          </div>

          <!-- 编辑模式 -->
          <div v-else class="flex gap-2 items-center">
            <div class="w-40 relative">
              <span class="text-sm text-gray-500 left-2 top-1/2 absolute -translate-y-1/2">¥</span>
              <input
                v-model.number="localAvailableCash"
                type="number"
                step="0.01"
                class="text-sm input-base !py-1 !pl-6"
                @keyup.enter="saveCash"
              >
            </div>
            <button
              class="icon-btn text-green-500 p-1 border rounded dark:border-green-900/50 hover:bg-green-50 dark:hover:bg-green-900/20"
              :disabled="isSavingCash"
              title="保存"
              @click="saveCash"
            >
              <div i-carbon-checkmark />
            </button>
            <button
              class="icon-btn text-gray-400 p-1 border rounded dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700"
              title="取消"
              @click="isEditingCash = false; localAvailableCash = Number(authStore.user?.availableCash || 0)"
            >
              <div i-carbon-close />
            </button>
          </div>
        </div>
      </div>

      <!-- AI 设置组件 -->
      <AiSettingsPanel
        v-model:is-ai-agent="aiForm.isAiAgent"
        v-model:ai-system-prompt="aiForm.aiSystemPrompt"
        mode="immediate"
        :loading="isToggling"
        @toggle="handleToggle"
        @save-config="handleSaveConfig"
      />

      <!-- API Token 面板 -->
      <ApiTokenPanel />
    </div>
  </div>
</template>
