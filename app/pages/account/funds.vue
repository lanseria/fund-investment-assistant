<!-- eslint-disable no-alert -->
<script setup lang="ts">
import { SECTOR_DICT_TYPE } from '~/constants'
import { apiFetch } from '~/utils/api'

definePageMeta({
  layout: 'account',
})

// 基金列表项类型 (与后端 GET /api/admin/funds 返回结构对应)
interface AdminFundItem {
  code: string
  name: string
  fundType: 'open' | 'qdii_lof'
  sector: string | null
  yesterdayNav: string
  todayEstimateNav: number | null
  percentageChange: number | null
  todayEstimateUpdateTime: string | null
  holderCount: number
  watcherCount: number
}

const { data: funds, pending, error, refresh } = useAsyncData<AdminFundItem[]>('admin-funds', () =>
  apiFetch<AdminFundItem[]>('/api/admin/funds'))

const dictStore = useDictStore()

// 板块下拉选项
const sectorOptions = computed(() => {
  const options = dictStore.getDictData(SECTOR_DICT_TYPE)
  return [
    { value: null, label: '-- 不设置 --' },
    ...options.map(opt => ({ value: opt.value, label: `${opt.label} (${opt.value})` })),
  ]
})

// --- 搜索与筛选 (前端过滤) ---
const searchKeyword = ref('')
const filterType = ref<'all' | 'open' | 'qdii_lof'>('all')

const filteredFunds = computed(() => {
  if (!funds.value)
    return []
  const keyword = searchKeyword.value.trim().toLowerCase()
  return funds.value.filter((f) => {
    const matchType = filterType.value === 'all' || f.fundType === filterType.value
    const matchKeyword = !keyword
      || f.code.includes(keyword)
      || f.name.toLowerCase().includes(keyword)
    return matchType && matchKeyword
  })
})

// --- 新增基金 Modal ---
const isAddModalOpen = ref(false)
const addForm = reactive({ code: '' })
const isSubmitting = ref(false)

function openAddModal() {
  addForm.code = ''
  isAddModalOpen.value = true
}

async function handleAddFund() {
  const code = addForm.code.trim()
  if (!/^\d{6}$/.test(code)) {
    alert('请输入有效的6位数字基金代码')
    return
  }
  isSubmitting.value = true
  try {
    await apiFetch('/api/admin/funds', {
      method: 'POST',
      body: { code },
    })
    isAddModalOpen.value = false
    await refresh()
    alert(`基金 ${code} 添加成功`)
  }
  catch (err: any) {
    alert(`添加失败: ${err.data?.statusMessage || '未知错误'}`)
  }
  finally {
    isSubmitting.value = false
  }
}

// --- 编辑基金 Modal ---
const isEditModalOpen = ref(false)
const editingFund = ref<AdminFundItem | null>(null)
const editForm = reactive({
  name: '',
  sector: null as string | null,
  fundType: 'open' as 'open' | 'qdii_lof',
})

const fundTypeOptions = [
  { value: 'open', label: '普通开放式 (open)' },
  { value: 'qdii_lof', label: 'QDII/LOF (qdii_lof)' },
]

function openEditModal(fund: AdminFundItem) {
  editingFund.value = fund
  editForm.name = fund.name
  editForm.sector = fund.sector
  editForm.fundType = fund.fundType
  isEditModalOpen.value = true
}

async function handleEditFund() {
  if (!editingFund.value)
    return
  if (!editForm.name.trim()) {
    alert('基金名称不能为空')
    return
  }
  isSubmitting.value = true
  try {
    await apiFetch(`/api/admin/funds/${editingFund.value.code}`, {
      method: 'PUT',
      body: {
        name: editForm.name.trim(),
        sector: editForm.sector,
        fundType: editForm.fundType,
      },
    })
    isEditModalOpen.value = false
    await refresh()
    alert('修改成功')
  }
  catch (err: any) {
    alert(`修改失败: ${err.data?.statusMessage || '未知错误'}`)
  }
  finally {
    isSubmitting.value = false
  }
}

// --- 删除基金 (强制级联，输入代码二次确认) ---
const isDeleteModalOpen = ref(false)
const deletingFund = ref<AdminFundItem | null>(null)
const deleteConfirmCode = ref('')

function openDeleteModal(fund: AdminFundItem) {
  deletingFund.value = fund
  deleteConfirmCode.value = ''
  isDeleteModalOpen.value = true
}

async function handleDeleteFund() {
  if (!deletingFund.value)
    return
  // 必须输入完全一致的基金代码才允许删除
  if (deleteConfirmCode.value.trim() !== deletingFund.value.code) {
    alert('输入的基金代码不匹配，请重新输入')
    return
  }
  isSubmitting.value = true
  try {
    await apiFetch(`/api/admin/funds/${deletingFund.value.code}`, { method: 'DELETE' })
    isDeleteModalOpen.value = false
    await refresh()
    alert(`基金 ${deletingFund.value.code} 及其所有关联数据已删除`)
  }
  catch (err: any) {
    alert(`删除失败: ${err.data?.statusMessage || '未知错误'}`)
  }
  finally {
    isSubmitting.value = false
  }
}

// --- 工具函数 ---
// 涨跌幅着色
function changeColor(change: number | null): string {
  if (change === null || change === 0)
    return 'text-gray-500 dark:text-gray-400'
  return change > 0 ? 'text-red-500' : 'text-green-500'
}

// 涨跌幅文本 (带正负号与%)
function changeText(change: number | null): string {
  if (change === null)
    return '-'
  const sign = change > 0 ? '+' : ''
  return `${sign}${change.toFixed(2)}%`
}
</script>

<template>
  <div>
    <header class="mb-4 flex items-center justify-between">
      <h1 class="text-2xl font-bold">
        基金管理
      </h1>
      <button class="btn flex items-center" @click="openAddModal">
        <div i-carbon-add mr-1 />
        添加基金
      </button>
    </header>

    <!-- 搜索与筛选 -->
    <div class="mb-4 flex flex-wrap gap-3 items-center">
      <div class="flex flex-1 min-w-[200px] items-center relative">
        <div i-carbon-search class="text-gray-400 ml-3 left-0 absolute" />
        <input
          v-model="searchKeyword"
          type="text"
          placeholder="按代码或名称搜索..."
          class="input-base pl-9"
        >
      </div>
      <div class="flex gap-2 items-center">
        <span class="text-sm text-gray-500">类型</span>
        <select v-model="filterType" class="input-base">
          <option value="all">
            全部
          </option>
          <option value="open">
            普通开放式
          </option>
          <option value="qdii_lof">
            QDII/LOF
          </option>
        </select>
      </div>
      <span class="text-sm text-gray-400">
        共 {{ filteredFunds.length }} 只
      </span>
    </div>

    <div v-if="pending">
      加载中...
    </div>
    <div v-else-if="error" class="text-red-500">
      加载失败: {{ error.message }}
    </div>
    <div v-else class="border border-gray-200 rounded-lg shadow-sm overflow-hidden dark:border-gray-700">
      <table class="text-left w-full table-fixed">
        <thead class="border-b border-gray-200 bg-gray-50/50 dark:border-gray-700 dark:bg-gray-800">
          <tr>
            <th class="text-xs text-gray-500 font-semibold px-4 py-3 w-[18%] uppercase">
              代码
            </th>
            <th class="text-xs text-gray-500 font-semibold px-4 py-3 w-[30%] uppercase">
              名称
            </th>
            <th class="text-xs text-gray-500 font-semibold px-4 py-3 text-center w-[10%] uppercase">
              类型
            </th>
            <th class="text-xs text-gray-500 font-semibold px-4 py-3 text-right w-[12%] uppercase">
              昨日净值
            </th>
            <th class="text-xs text-gray-500 font-semibold px-4 py-3 text-right w-[12%] uppercase">
              估算涨跌
            </th>
            <th class="text-xs text-gray-500 font-semibold px-4 py-3 text-center w-[10%] uppercase">
              持仓/关注
            </th>
            <th class="text-xs text-gray-500 font-semibold px-4 py-3 text-right w-[8%] uppercase">
              操作
            </th>
          </tr>
        </thead>

        <tbody class="bg-white divide-gray-100 divide-y dark:bg-gray-900 dark:divide-gray-800">
          <tr
            v-for="fund in filteredFunds"
            :key="fund.code"
            class="group transition-colors duration-150 hover:bg-gray-50/80 dark:hover:bg-gray-800/60"
          >
            <!-- 代码 -->
            <td class="px-4 py-3 align-middle">
              <NuxtLink :to="`/fund/${fund.code}`" class="text-sm text-primary font-medium font-mono hover:underline">
                {{ fund.code }}
              </NuxtLink>
            </td>

            <!-- 名称 + 板块 -->
            <td class="px-4 py-3 align-middle">
              <div class="flex flex-col gap-1 min-w-0">
                <span class="text-sm text-gray-900 font-medium truncate dark:text-gray-100">
                  {{ fund.name }}
                </span>
                <span
                  v-if="fund.sector"
                  class="text-[10px] text-blue-700 px-1.5 py-0.5 rounded bg-blue-50 w-fit inline-block dark:text-blue-300 dark:bg-blue-900/30"
                >
                  {{ dictStore.getLabel(SECTOR_DICT_TYPE, fund.sector) || fund.sector }}
                </span>
              </div>
            </td>

            <!-- 类型 -->
            <td class="px-4 py-3 text-center align-middle">
              <span
                class="text-[10px] px-1.5 py-0.5 border rounded"
                :class="fund.fundType === 'qdii_lof'
                  ? 'border-amber-200 text-amber-700 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300'
                  : 'border-gray-200 text-gray-500 bg-gray-50 dark:border-gray-700 dark:bg-gray-800'"
              >
                {{ fund.fundType === 'qdii_lof' ? 'QDII/LOF' : '开放式' }}
              </span>
            </td>

            <!-- 昨日净值 -->
            <td class="px-4 py-3 text-right align-middle">
              <span class="text-sm text-gray-700 font-mono tabular-nums dark:text-gray-200">
                {{ fund.yesterdayNav }}
              </span>
            </td>

            <!-- 估算涨跌 -->
            <td class="px-4 py-3 text-right align-middle">
              <span class="text-sm font-mono tabular-nums" :class="changeColor(fund.percentageChange)">
                {{ changeText(fund.percentageChange) }}
              </span>
            </td>

            <!-- 持仓/关注人数 -->
            <td class="px-4 py-3 text-center align-middle">
              <div class="text-xs flex gap-1 justify-center">
                <span class="text-blue-700 px-1.5 py-0.5 rounded bg-blue-50 dark:text-blue-300 dark:bg-blue-900/20" title="持仓人数">
                  持 {{ fund.holderCount }}
                </span>
                <span class="text-gray-500 px-1.5 py-0.5 rounded bg-gray-50 dark:text-gray-400 dark:bg-gray-800" title="关注人数">
                  关 {{ fund.watcherCount }}
                </span>
              </div>
            </td>

            <!-- 操作 -->
            <td class="px-4 py-3 text-right align-middle">
              <div class="opacity-60 flex gap-1 transition-opacity justify-end group-hover:opacity-100">
                <button
                  class="icon-btn p-2 hover:text-blue-600 hover:bg-blue-50 dark:hover:text-blue-400 dark:hover:bg-blue-900/30"
                  title="编辑基金"
                  @click="openEditModal(fund)"
                >
                  <div i-carbon-edit class="text-lg" />
                </button>
                <button
                  class="icon-btn p-2 hover:text-red-600 hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-900/30"
                  title="删除基金"
                  @click="openDeleteModal(fund)"
                >
                  <div i-carbon-trash-can class="text-lg" />
                </button>
              </div>
            </td>
          </tr>

          <!-- 空状态 -->
          <tr v-if="filteredFunds.length === 0">
            <td colspan="7" class="text-gray-400 py-8 text-center">
              {{ funds && funds.length > 0 ? '没有符合条件的基金' : '暂无基金数据' }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 新增基金 Modal -->
    <Modal v-model="isAddModalOpen" title="添加基金">
      <form @submit.prevent="handleAddFund">
        <div class="space-y-4">
          <p class="text-sm text-gray-500">
            输入6位基金代码，系统将自动从上游接口获取基金名称、净值、费率等信息。
          </p>
          <div>
            <label class="text-sm font-medium mb-1 block">基金代码</label>
            <input
              v-model="addForm.code"
              type="text"
              class="font-mono input-base"
              placeholder="如 110022"
              maxlength="6"
              required
              autofocus
            >
          </div>
        </div>
        <div class="mt-6 flex justify-end space-x-3">
          <button type="button" class="px-4 py-2 rounded-md bg-gray-100 dark:bg-gray-600" @click="isAddModalOpen = false">
            取消
          </button>
          <button type="submit" class="btn" :disabled="isSubmitting">
            {{ isSubmitting ? '获取中...' : '确认添加' }}
          </button>
        </div>
      </form>
    </Modal>

    <!-- 编辑基金 Modal -->
    <Modal v-model="isEditModalOpen" title="编辑基金信息">
      <form @submit.prevent="handleEditFund">
        <div class="space-y-4">
          <p class="text-sm text-gray-500">
            正在编辑：<span class="font-mono font-semibold">{{ editingFund?.code }}</span>
          </p>
          <div>
            <label class="text-sm font-medium mb-1 block">基金名称</label>
            <input
              v-model="editForm.name"
              type="text"
              class="input-base"
              required
            >
          </div>
          <div>
            <label class="text-sm font-medium mb-1 block">基金类型</label>
            <CustomSelect v-model="editForm.fundType" :options="fundTypeOptions" />
          </div>
          <div>
            <label class="text-sm font-medium mb-1 block">所属板块</label>
            <CustomSelect v-model="editForm.sector" :options="sectorOptions" />
          </div>
        </div>
        <div class="mt-6 pt-4 border-t flex justify-end space-x-3 dark:border-gray-700">
          <button type="button" class="px-4 py-2 rounded-md bg-gray-100 dark:bg-gray-600" @click="isEditModalOpen = false">
            取消
          </button>
          <button type="submit" class="btn" :disabled="isSubmitting">
            {{ isSubmitting ? '保存中...' : '保存修改' }}
          </button>
        </div>
      </form>
    </Modal>

    <!-- 删除基金 Modal (强制级联，需输入代码确认) -->
    <Modal v-model="isDeleteModalOpen" title="⚠️ 危险操作：删除基金">
      <form @submit.prevent="handleDeleteFund">
        <div class="space-y-4">
          <div class="text-sm text-red-800 p-3 rounded bg-red-50 space-y-1 dark:text-red-300 dark:bg-red-900/20">
            <p class="font-bold">
              即将删除基金：{{ deletingFund?.code }} {{ deletingFund?.name }}
            </p>
            <p>此操作将<strong>级联删除</strong>以下所有关联数据，且不可恢复：</p>
            <ul class="ml-4 list-disc">
              <li>所有用户的该基金持仓记录 ({{ deletingFund?.holderCount }} 人持仓, {{ deletingFund?.watcherCount }} 人关注)</li>
              <li>该基金的全部交易记录</li>
              <li>基金费率信息</li>
              <li>历史净值数据</li>
              <li>策略信号记录</li>
            </ul>
          </div>
          <div>
            <label class="text-sm font-medium mb-1 block">
              请输入基金代码 <span class="font-bold font-mono">{{ deletingFund?.code }}</span> 以确认删除
            </label>
            <input
              v-model="deleteConfirmCode"
              type="text"
              class="font-mono input-base"
              placeholder="输入基金代码确认"
              autofocus
            >
          </div>
        </div>
        <div class="mt-6 pt-4 border-t flex justify-end space-x-3 dark:border-gray-700">
          <button type="button" class="px-4 py-2 rounded-md bg-gray-100 dark:bg-gray-600" @click="isDeleteModalOpen = false">
            取消
          </button>
          <button
            type="submit"
            class="btn text-white bg-red-600 hover:bg-red-700"
            :disabled="!deletingFund || deleteConfirmCode.trim() !== deletingFund.code || isSubmitting"
          >
            {{ isSubmitting ? '删除中...' : '确认删除' }}
          </button>
        </div>
      </form>
    </Modal>
  </div>
</template>
