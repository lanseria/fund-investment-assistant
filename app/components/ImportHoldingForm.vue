<script setup lang="ts">
const emit = defineEmits(['submit', 'cancel'])

const selectedFile = ref<File | null>(null)
const overwrite = ref(false)

const fileInput = ref<HTMLInputElement | null>(null)

function onFileChange(event: Event) {
  const target = event.target as HTMLInputElement
  if (target.files)
    selectedFile.value = target.files[0]
}

function handleSubmit() {
  if (selectedFile.value)
    emit('submit', { file: selectedFile.value, overwrite: overwrite.value })
}
</script>

<template>
  <form @submit.prevent="handleSubmit">
    <div class="space-y-4">
      <div>
        <label class="text-sm font-medium mb-1 block">选择 JSON 文件</label>
        <div class="mt-1 flex items-center">
          <button
            type="button"
            class="text-sm font-medium px-3 py-2 border border-gray-300 rounded-md bg-white dark:border-gray-600 dark:bg-gray-700 hover:bg-gray-50"
            @click="fileInput?.click()"
          >
            选择文件
          </button>
          <input ref="fileInput" type="file" class="hidden" accept=".json" @change="onFileChange">
          <span v-if="selectedFile" class="text-sm text-gray-500 ml-3">{{ selectedFile.name }}</span>
        </div>
      </div>
      <div class="flex items-start relative">
        <div class="flex h-6 items-center">
          <input id="overwrite" v-model="overwrite" type="checkbox" class="text-teal-600 border-gray-300 rounded h-4 w-4 focus:ring-teal-600">
        </div>
        <div class="text-sm leading-6 ml-3">
          <label for="overwrite" class="font-medium">覆盖模式</label>
          <p class="text-gray-500">
            选中此项将删除所有现有持仓，然后导入文件中的数据。
          </p>
        </div>
      </div>
    </div>
    <div class="mt-6 flex justify-end space-x-3">
      <button type="button" class="text-sm text-gray-700 font-medium px-4 py-2 rounded-md bg-gray-100" @click="emit('cancel')">
        取消
      </button>
      <button type="submit" class="btn" :disabled="!selectedFile">
        确认导入
      </button>
    </div>
  </form>
</template>
