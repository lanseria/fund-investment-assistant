<!-- eslint-disable no-alert -->
<script setup lang="ts">
import { SECTOR_DICT_TYPE } from '~/constants'
import { apiFetch } from '~/utils/api'

const props = defineProps<{
  fundCode: string
  fundName: string
  currentSector: string | null
}>()

const emit = defineEmits(['success', 'cancel'])

const dictStore = useDictStore()

// 获取板块字典列表

const sectorOptions = computed(() => dictStore.getDictData(SECTOR_DICT_TYPE))

const selectedSector = ref(props.currentSector)
const isSubmitting = ref(false)

async function handleSubmit() {
  isSubmitting.value = true
  try {
    await apiFetch(`/api/funds/${props.fundCode}/sector`, {
      method: 'PUT',
      body: { sector: selectedSector.value },
    })
    emit('success', { code: props.fundCode, newSector: selectedSector.value })
  }
  catch (error: any) {
    alert(`更新失败: ${error.data?.statusMessage || '未知错误'}`)
  }
  finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <form @submit.prevent="handleSubmit">
    <div class="space-y-4">
      <p>正在为基金 <span class="font-semibold">{{ fundName }} ({{ fundCode }})</span> 设置板块。</p>
      <div>
        <label for="sector-select" class="text-sm font-medium mb-1 block">选择板块</label>
        <select id="sector-select" v-model="selectedSector" class="input-base">
          <option :value="null">
            -- 清空/不设置 --
          </option>
          <option v-for="opt in sectorOptions" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>
      </div>
    </div>
    <div class="mt-6 flex justify-end space-x-3">
      <button type="button" class="px-4 py-2 rounded-md bg-gray-100 dark:bg-gray-600" @click="emit('cancel')">
        取消
      </button>
      <button type="submit" class="btn" :disabled="isSubmitting">
        {{ isSubmitting ? '保存中...' : '确认保存' }}
      </button>
    </div>
  </form>
</template>
