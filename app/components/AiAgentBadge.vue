<script setup lang="ts">
defineProps<{ mode?: 'auto' | 'draft' | 'off' | string }>()
</script>

<template>
  <div
    v-if="mode === 'auto'"
    class="text-white leading-none px-1.5 py-0.5 align-middle rounded-full inline-flex gap-0 select-none shadow-sm items-center from-blue-500 to-purple-500 bg-gradient-to-br"
    title="AI 自动操作"
  >
    <div class="i-f7-sparkles text-10px" />
    <span class="text-11px tracking-widest">AI:Auto</span>
  </div>
  <div
    v-else-if="mode === 'draft'"
    class="text-white leading-none px-1.5 py-0.5 align-middle rounded-full inline-flex gap-0 select-none shadow-sm items-center from-purple-500 to-pink-500 bg-gradient-to-br"
    title="AI 预操作模式"
  >
    <div class="i-carbon-edit text-10px mr-0.5" />
    <span class="text-11px tracking-widest">AI:Draft</span>
  </div>
</template>
