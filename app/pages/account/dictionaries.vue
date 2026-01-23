<!-- eslint-disable no-alert -->
<script setup lang="ts">
import { apiFetch } from '~/utils/api'

definePageMeta({
  layout: 'account',
})

// --- State ---
const selectedType = ref<string | null>(null)
const isTypeModalOpen = ref(false)
const isDataModalOpen = ref(false)
const editingType = ref<any>(null)
const editingData = ref<any>(null)

// --- Data Fetching ---

// [核心修改] 1. 使用 await 等待数据获取完成
const { data: dictTypes, pending: typesPending, refresh: refreshTypes } = await useAsyncData(
  'admin-dict-types',
  () => apiFetch<any[]>('/api/admin/dict-types'),
)

// [核心修改] 3. 在 await 之后，同步执行成功后的逻辑
// 这段代码只会在 dictTypes 成功获取后执行
if (!selectedType.value && dictTypes.value && dictTypes.value.length > 0)
  selectedType.value = dictTypes.value[0].type

// 根据选择的类型，获取字典数据 (右侧面板)
// 因为上面的代码已经设置了 selectedType 的初始值，所以这里的 watch 会正确触发并加载初始数据
const { data: dictData, pending: dataPending, refresh: refreshData } = useAsyncData(
  'admin-dict-data',
  () => {
    if (!selectedType.value)
      return Promise.resolve([])
    return apiFetch<any[]>(`/api/admin/dict-data/${selectedType.value}`)
  },
  { watch: [selectedType] }, // 监听 selectedType 的变化，自动重新获取数据
)

// --- Modal Logic ---
function openAddTypeModal() {
  editingType.value = {}
  isTypeModalOpen.value = true
}
function openEditTypeModal(type: any) {
  editingType.value = { ...type }
  isTypeModalOpen.value = true
}
function openAddDataModal() {
  editingData.value = { dictType: selectedType.value, sortOrder: 0 }
  isDataModalOpen.value = true
}
function openEditDataModal(data: any) {
  editingData.value = { ...data }
  isDataModalOpen.value = true
}

// --- API Actions ---
async function handleTypeSubmit() {
  try {
    const isEditing = !!editingType.value.createdAt // 简单判断是否为编辑
    const url = isEditing ? `/api/admin/dict-types/${editingType.value.type}` : '/api/admin/dict-types'
    const method = isEditing ? 'PUT' : 'POST'

    const newOrUpdatedType = await apiFetch<any>(url, { method, body: editingType.value })

    isTypeModalOpen.value = false
    await refreshTypes()

    // [体验优化] 如果是新增，则自动选中新增的类型
    if (!isEditing)
      selectedType.value = newOrUpdatedType.type
  }
  catch (e: any) { alert(`操作失败: ${e.data?.statusMessage}`) }
}

async function handleDataSubmit() {
  try {
    const isEditing = !!editingData.value.id
    const url = isEditing ? `/api/admin/dict-data/${editingData.value.id}` : '/api/admin/dict-data'
    const method = isEditing ? 'PUT' : 'POST'

    await apiFetch(url, { method, body: editingData.value })

    isDataModalOpen.value = false
    await refreshData()
  }
  catch (e: any) { alert(`操作失败: ${e.data?.statusMessage}`) }
}

async function deleteType(type: string) {
  if (confirm(`确定删除字典类型 "${type}" 吗？其下的所有数据项将一并被删除！`)) {
    try {
      await apiFetch(`/api/admin/dict-types/${type}`, { method: 'DELETE' })
      selectedType.value = null // 清空选择
      await refreshTypes()
    }
    catch (e: any) { alert(`删除失败: ${e.data?.statusMessage}`) }
  }
}

async function deleteData(id: number) {
  if (confirm('确定删除此数据项吗？')) {
    try {
      await apiFetch(`/api/admin/dict-data/${id}`, { method: 'DELETE' })
      await refreshData()
    }
    catch (e: any) { alert(`删除失败: ${e.data?.statusMessage}`) }
  }
}
</script>

<template>
  <div>
    <h1 class="text-2xl font-bold mb-4">
      字典管理
    </h1>
    <!-- [修改] 限制整体布局高度，为内部滚动做准备 -->
    <div class="flex flex-col gap-6 h-[calc(100vh-220px)] md:flex-row">
      <!-- Left Panel: Dictionary Types (基本不变) -->
      <div class="p-4 border rounded-lg overflow-y-auto md:w-1/3">
        <div class="mb-3 flex items-center justify-between">
          <h2 class="font-semibold">
            字典类别
          </h2>
          <button class="btn flex items-center" @click="openAddTypeModal">
            <div i-carbon-add mr-1 /> 新增
          </button>
        </div>
        <div v-if="typesPending && !dictTypes" class="text-gray-500">
          加载中...
        </div>
        <ul v-else class="space-y-1">
          <li v-for="t in dictTypes" :key="t.type" class="group">
            <a
              href="#"
              class="p-2 rounded-md flex transition-colors items-center justify-between"
              :class="selectedType === t.type ? 'bg-primary/10 text-primary' : 'hover:bg-gray-100 dark:hover:bg-gray-700'"
              @click.prevent="selectedType = t.type"
            >
              <div>
                <p class="font-medium">
                  {{ t.name }}
                </p>
                <p class="text-xs text-gray-400 font-mono">
                  {{ t.type }}
                </p>
              </div>
              <div class="opacity-0 flex transition-opacity items-center group-hover:opacity-100" :class="{ 'opacity-100': selectedType === t.type }">
                <button class="text-sm icon-btn" @click.stop="openEditTypeModal(t)">
                  <div i-carbon-edit />
                </button>
                <button class="text-sm icon-btn hover:text-red-500" @click.stop="deleteType(t.type)">
                  <div i-carbon-trash-can />
                </button>
              </div>
            </a>
          </li>
        </ul>
      </div>

      <!-- Right Panel: Dictionary Data -->
      <!-- [修改] 1. 将右侧面板设置为 flex 容器，方向为垂直 -->
      <div class="flex flex-col md:w-2/3">
        <div v-if="!selectedType" class="text-gray-500 border rounded-lg flex h-full items-center justify-center">
          请在左侧选择一个字典类别
        </div>
        <!-- [修改] 2. 将内容区域也设置为 flex 容器，让表格区域可以伸展 -->
        <div v-else class="flex flex-grow flex-col min-h-0">
          <div class="mb-3 flex flex-shrink-0 items-center justify-between">
            <h2 class="font-semibold">
              数据项
            </h2>
            <button class="btn flex items-center" @click="openAddDataModal">
              <div i-carbon-add mr-1 />新增
            </button>
          </div>
          <div v-if="dataPending" class="text-gray-500">
            加载中...
          </div>
          <!-- [修改] 3. 这是核心：包裹表格的 div 现在负责滚动 -->
          <div v-else class="border rounded-lg flex-grow min-h-0 relative overflow-auto">
            <table class="text-left w-full">
              <!-- [修改] 4. thead 加上 sticky 定位，并确保有不透明的背景色 -->
              <thead class="bg-gray-50 top-0 sticky z-10 dark:bg-gray-800">
                <tr>
                  <th class="p-3">
                    标签(Label)
                  </th>
                  <th class="p-3">
                    值(Value)
                  </th>
                  <th class="p-3">
                    排序
                  </th>
                  <th class="p-3 text-right">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in dictData" :key="item.id" class="border-t dark:border-gray-700">
                  <td class="p-3">
                    {{ item.label }}
                  </td>
                  <td class="font-mono p-3">
                    {{ item.value }}
                  </td>
                  <td class="p-3">
                    {{ item.sortOrder }}
                  </td>
                  <td class="p-3 text-right">
                    <div class="flex gap-2 justify-end">
                      <button class="icon-btn" @click="openEditDataModal(item)">
                        <div i-carbon-edit />
                      </button>
                      <button class="icon-btn hover:text-red-500" @click="deleteData(item.id)">
                        <div i-carbon-trash-can />
                      </button>
                    </div>
                  </td>
                </tr>
                <tr v-if="dictData?.length === 0">
                  <td colspan="4" class="text-gray-400 p-4 text-center">
                    暂无数据项
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>

    <!-- Modals -->
    <Modal v-model="isTypeModalOpen" :title="editingType && editingType.createdAt ? '编辑类别' : '新增类别'">
      <form v-if="isTypeModalOpen" class="space-y-4" @submit.prevent="handleTypeSubmit">
        <div>
          <label class="text-sm font-medium mb-1 block">类别名称/描述</label>
          <input v-model="editingType.name" type="text" class="input-base" required>
        </div>
        <div>
          <label class="text-sm font-medium mb-1 block">类别编码 (Type)</label>
          <input v-model="editingType.type" type="text" class="input-base" :disabled="!!editingType.createdAt" required>
          <p class="text-xs text-gray-500 mt-1">
            只能包含小写字母、数字和下划线，创建后不可修改。
          </p>
        </div>
        <div class="mt-6 flex justify-end space-x-3">
          <button type="button" class="text-sm text-gray-700 font-medium px-4 py-2 rounded-md bg-gray-100 dark:text-gray-200 dark:bg-gray-600 hover:bg-gray-200 dark:hover:bg-gray-500" @click="isTypeModalOpen = false">
            取消
          </button>
          <button type="submit" class="btn">
            保存
          </button>
        </div>
      </form>
    </Modal>

    <Modal v-model="isDataModalOpen" :title="editingData && editingData.id ? '编辑数据项' : '新增数据项'">
      <form v-if="isDataModalOpen" class="space-y-4" @submit.prevent="handleDataSubmit">
        <div>
          <label class="text-sm font-medium mb-1 block">标签 (Label)</label>
          <input v-model="editingData.label" type="text" class="input-base" required>
        </div>
        <div>
          <label class="text-sm font-medium mb-1 block">值 (Value)</label>
          <input v-model="editingData.value" type="text" class="input-base" required>
        </div>
        <div>
          <label class="text-sm font-medium mb-1 block">排序</label>
          <input v-model.number="editingData.sortOrder" type="number" class="input-base">
        </div>
        <div class="mt-6 flex justify-end space-x-3">
          <button type="button" class="text-sm text-gray-700 font-medium px-4 py-2 rounded-md bg-gray-100 dark:text-gray-200 dark:bg-gray-600 hover:bg-gray-200 dark:hover:bg-gray-500" @click="isDataModalOpen = false">
            取消
          </button>
          <button type="submit" class="btn">
            保存
          </button>
        </div>
      </form>
    </Modal>
  </div>
</template>
