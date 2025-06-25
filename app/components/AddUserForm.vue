<!-- app/components/AddUserForm.vue -->
<script setup lang="ts">
const emit = defineEmits(['submit', 'cancel'])

const formData = reactive({
  username: '',
  password: '',
  role: 'user' as 'user' | 'admin',
})

const canSubmit = computed(() => formData.username.length >= 3 && formData.password.length >= 6)

function handleSubmit() {
  if (canSubmit.value)
    emit('submit', { ...formData })
}
</script>

<template>
  <form @submit.prevent="handleSubmit">
    <div class="space-y-4">
      <!-- 用户名 -->
      <div>
        <label for="username" class="text-sm font-medium mb-1 block">用户名</label>
        <input
          id="username"
          v-model="formData.username"
          type="text"
          placeholder="至少3个字符"
          class="input-base"
          required
        >
      </div>

      <!-- 密码 -->
      <div>
        <label for="password" class="text-sm font-medium mb-1 block">密码</label>
        <input
          id="password"
          v-model="formData.password"
          type="password"
          placeholder="至少6个字符"
          class="input-base"
          required
        >
      </div>

      <!-- 角色 -->
      <div>
        <label for="role" class="text-sm font-medium mb-1 block">角色</label>
        <select
          id="role"
          v-model="formData.role"
          class="input-base"
        >
          <option value="user">
            User
          </option>
          <option value="admin">
            Admin
          </option>
        </select>
      </div>
    </div>

    <!-- 表单操作按钮 -->
    <div class="mt-6 flex justify-end space-x-3">
      <button
        type="button"
        class="text-sm text-gray-700 font-medium px-4 py-2 rounded-md bg-gray-100 dark:text-gray-200 dark:bg-gray-600 hover:bg-gray-200 dark:hover:bg-gray-500"
        @click="emit('cancel')"
      >
        取消
      </button>
      <button
        type="submit"
        class="btn"
        :disabled="!canSubmit"
      >
        确认添加
      </button>
    </div>
  </form>
</template>
