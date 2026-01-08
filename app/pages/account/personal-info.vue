<!-- eslint-disable no-alert -->
<script setup lang="ts">
import AiSettingsPanel from '~/components/AiSettingsPanel.vue'
import { apiFetch } from '~/utils/api'

definePageMeta({
  layout: 'account',
})

const authStore = useAuthStore()
const isToggling = ref(false)

// 表单数据 (直接绑定到组件，但独立于 authStore 以便编辑)
const aiForm = reactive({
  isAiAgent: false,
  aiModel: '',
  aiTotalAmount: 100000,
  aiSystemPrompt: '',
})

// 初始化
watch(() => authStore.user, (u) => {
  if (u) {
    aiForm.isAiAgent = u.isAiAgent
    aiForm.aiModel = u.aiModel || 'xiaomi/mimo-v2-flash:free'
    aiForm.aiTotalAmount = u.aiTotalAmount ? Number(u.aiTotalAmount) : 100000
    aiForm.aiSystemPrompt = u.aiSystemPrompt || ''
  }
}, { immediate: true })

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
    alert(`操作失败: ${e.data?.message || '未知错误'}`)
  }
  finally {
    isToggling.value = false
  }
}

// 处理配置保存 (Immediate Mode)
async function handleSaveConfig() {
  isToggling.value = true
  try {
    const res = await apiFetch<any>('/api/user/ai-status', {
      method: 'PUT',
      body: {
        aiModel: aiForm.aiModel,
        aiTotalAmount: aiForm.aiTotalAmount,
        aiSystemPrompt: aiForm.aiSystemPrompt || null,
      },
    })
    if (authStore.user)
      Object.assign(authStore.user, res.config)
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

      <!-- 使用新组件 -->
      <AiSettingsPanel
        v-model:is-ai-agent="aiForm.isAiAgent"
        v-model:ai-model="aiForm.aiModel"
        v-model:ai-total-amount="aiForm.aiTotalAmount"
        v-model:ai-system-prompt="aiForm.aiSystemPrompt"
        mode="immediate"
        :loading="isToggling"
        @toggle="handleToggle"
        @save-config="handleSaveConfig"
      />
    </div>
  </div>
</template>
