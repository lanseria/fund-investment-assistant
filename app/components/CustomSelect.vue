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

// 使用 useVModel 简化 v-model 的双向绑定
const value = useVModel(props, 'modelValue', emit)

const isOpen = ref(false)
const selectRef = ref(null)

// 通过 modelValue 找到当前选中的选项对象，以便显示其 label
const selectedOption = computed(() =>
  props.options.find(opt => opt.value === value.value),
)

function toggleDropdown() {
  isOpen.value = !isOpen.value
}

function selectOption(option: SelectOption) {
  value.value = option.value
  isOpen.value = false
}

// 点击组件外部时，自动关闭下拉框
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
        class="mt-1 p-1 border card max-h-60 w-full left-0 top-full absolute z-10 overflow-y-auto dark:border-gray-600"
      >
        <ul>
          <li
            v-for="option in options"
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
