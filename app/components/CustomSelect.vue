<script setup lang="ts">
import { useVModel } from '@vueuse/core'

interface SelectOption {
  value: string | number | null
  label: string
}

const props = defineProps<{
  modelValue: string | number | null
  options: SelectOption[]
  placeholder?: string
}>()

const emit = defineEmits(['update:modelValue'])

const value = useVModel(props, 'modelValue', emit)
const isOpen = ref(false)
const selectRef = ref(null)
const searchInputRef = ref<HTMLInputElement | null>(null)
const searchQuery = ref('')

const selectedOption = computed(() =>
  props.options.find(opt => opt.value === value.value),
)

// 根据搜索查询过滤选项
const filteredOptions = computed(() => {
  if (!searchQuery.value)
    return props.options
  return props.options.filter(opt =>
    opt.label.toLowerCase().includes(searchQuery.value.toLowerCase()),
  )
})

function toggleDropdown() {
  isOpen.value = !isOpen.value
}

function selectOption(option: SelectOption) {
  value.value = option.value
  isOpen.value = false
}

// 当下拉菜单打开时，自动聚焦到搜索输入框并清空上次的查询
watch(isOpen, async (newValue) => {
  if (newValue) {
    searchQuery.value = ''
    await nextTick() // 等待 DOM 更新
    searchInputRef.value?.focus()
  }
})

onClickOutside(selectRef, () => {
  isOpen.value = false
})
</script>

<template>
  <div ref="selectRef" class="relative">
    <!-- 模拟的 select 输入框 -->
    <button
      type="button"
      class="input-base text-left flex w-full items-center justify-between"
      @click="toggleDropdown"
    >
      <span :class="{ 'text-gray-400': !selectedOption }">
        {{ selectedOption ? selectedOption.label : placeholder || '请选择' }}
      </span>
      <div
        class="i-carbon-chevron-down text-lg transition-transform duration-200"
        :class="{ 'rotate-180': isOpen }"
      />
    </button>

    <!-- 下拉选项面板 -->
    <Transition name="fade">
      <div
        v-if="isOpen"
        class="mt-1 card flex flex-col max-h-60 w-full left-0 top-full absolute z-10 dark:border-gray-600"
      >
        <!-- 搜索输入区域 -->
        <div class="p-2 border-b flex-shrink-0 relative dark:border-gray-700">
          <div class="i-carbon-search text-lg op-50 left-4 top-1/2 absolute -translate-y-1/2" />
          <input
            ref="searchInputRef"
            v-model="searchQuery"
            type="text"
            placeholder="搜索选项..."
            class="input-base !py-1.5 !pl-9"
          >
        </div>

        <!-- 选项列表 -->
        <div class="p-1 flex-grow overflow-y-auto">
          <div v-if="filteredOptions.length === 0" class="text-sm text-gray-400 p-3 text-center">
            未找到匹配项
          </div>
          <ul v-else>
            <li
              v-for="option in filteredOptions"
              :key="String(option.value)"
              class="text-sm px-3 py-2 rounded-md cursor-pointer transition-colors"
              :class="[
                value === option.value
                  ? 'bg-primary/10 text-primary font-semibold'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-700',
              ]"
              @click="selectOption(option)"
            >
              {{ option.label }}
            </li>
          </ul>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(-5px);
}
</style>
