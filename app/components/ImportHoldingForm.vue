<script setup lang="ts">
defineProps<{ loading?: boolean }>()
const emit = defineEmits(['submit', 'cancel'])

const toast = useToast()

const selectedFile = ref<File | null>(null)
const jsonText = ref('')
const overwrite = ref(false)

const fileInput = ref<HTMLInputElement | null>(null)

/** 交给 AI 的提示词:把持仓截图/表格/文字整理成可直接导入的 JSON */
const AI_PROMPT = `请把我提供的基金持仓信息(截图、表格或文字记录均可)整理成可直接导入「基金投资助手」的 JSON 数组。

严格按以下结构输出,顶层就是数组,不要包裹其他字段:
[
  {
    "code": "161725",
    "shares": 1234.56,
    "costPrice": 0.9123,
    "fundType": "open"
  }
]

字段说明:
- code:6 位基金代码,字符串。只有基金名称时请先查证对应的 6 位代码;查不到就跳过该基金,不要编造代码;
- shares:持有份额,单位「份」,数字且必须大于 0。需按「持有金额 ÷ 单位净值」或「累计买入份额 - 累计卖出份额」换算,不要填持有金额;
- costPrice:持仓成本价,单位「元/份」,数字且必须大于 0,等于总成本 ÷ 持有份额;
- fundType:可选,默认 "open"(普通场外开放式基金);场内 ETF / LOF / QDII 填 "qdii_lof"。

要求:
1. 只输出 JSON 本身,不要 markdown 代码块标记,不要任何解释文字;
2. 数字不带货币符号、千分位逗号或单位;份额保留 2 位小数,成本价保留 4 位小数;
3. 每只基金只出现一次;
4. 无法确定份额或成本价的基金直接跳过,不要用 0 或占位值填充;跳过原因请放在 JSON 之外单独说明。`

async function copyPrompt() {
  if (!import.meta.client)
    return
  try {
    await navigator.clipboard.writeText(AI_PROMPT)
    toast.success('已复制提示词,发给 AI 即可生成导入用的 JSON')
  }
  catch (e) {
    console.error('复制失败:', e)
    toast.error('复制失败,请手动复制下方提示词')
  }
}

function onFileChange(event: Event) {
  const target = event.target as HTMLInputElement
  if (target.files && target.files.length > 0) {
    selectedFile.value = target.files[0]!
    // 选了文件就清空粘贴内容,避免两种来源同时提交造成歧义
    jsonText.value = ''
  }
}

/** 手工编辑粘贴内容时清掉已选文件,保证每次提交只有一个数据来源 */
function onTextInput() {
  selectedFile.value = null
}

const canSubmit = computed(() => !!selectedFile.value || jsonText.value.trim().length > 0)

/**
 * 解析粘贴的文本,兼容 AI 偶尔包一层 { holdings: [...] } 的情况。
 */
function parsePasted(text: string): { code: string, shares: number, costPrice: number, fundType: 'open' | 'qdii_lof' }[] {
  const parsed = JSON.parse(text)
  let list: unknown = parsed
  if (!Array.isArray(parsed) && parsed && typeof parsed === 'object') {
    for (const key of ['holdings', 'data', 'items', 'list']) {
      const value = (parsed as Record<string, unknown>)[key]
      if (Array.isArray(value)) {
        list = value
        break
      }
    }
  }
  if (!Array.isArray(list))
    throw new Error('JSON 顶层应为数组')
  if (list.length === 0)
    throw new Error('数组为空,没有可导入的持仓')

  const invalidCodes = list
    .filter((item) => {
      const row = item as Record<string, unknown>
      const code = row?.code
      return typeof code !== 'string'
        || !/^\d{6}$/.test(code)
        || !Number.isFinite(Number(row.shares))
        || Number(row.shares) <= 0
        || !Number.isFinite(Number(row.costPrice))
        || Number(row.costPrice) <= 0
    })
    .slice(0, 5)
    .map(item => String((item as Record<string, unknown>)?.code ?? '(缺少 code)'))

  if (invalidCodes.length > 0)
    throw new Error(`以下条目缺少合法的 code / shares / costPrice:${invalidCodes.join('、')}`)

  // AI 常把数字写成字符串(如 "1234.56"),统一转成数字再交给后端
  return list.map((item) => {
    const row = item as Record<string, unknown>
    const fundType = row.fundType === 'qdii_lof'
      ? 'qdii_lof'
      : 'open'
    return {
      code: String(row.code).trim(),
      shares: Number(row.shares),
      costPrice: Number(row.costPrice),
      fundType,
    }
  })
}

function handleSubmit() {
  const text = jsonText.value.trim()

  if (text && !selectedFile.value) {
    let rows: ReturnType<typeof parsePasted>
    try {
      rows = parsePasted(text)
    }
    catch (e) {
      toast.error(e instanceof SyntaxError
        ? '粘贴的内容不是合法 JSON,请检查后重试'
        : (e as Error).message)
      return
    }

    const content = JSON.stringify(rows, null, 2)
    const file = new File([content], 'holdings-from-ai.json', { type: 'application/json' })
    emit('submit', { file, overwrite: overwrite.value })
    return
  }

  if (selectedFile.value)
    emit('submit', { file: selectedFile.value, overwrite: overwrite.value })
}
</script>

<template>
  <form class="flex flex-col max-h-[75vh]" @submit.prevent="handleSubmit">
    <div class="pr-1 overflow-y-auto space-y-4">
      <!-- ① 复制提示词 -> AI 生成 -->
      <div class="p-3 border rounded-md bg-gray-50 dark:border-gray-700 dark:bg-gray-900/40">
        <div class="flex gap-2 items-center justify-between">
          <div class="text-sm font-medium">
            第一步:让 AI 生成 JSON
          </div>
          <button type="button" class="text-sm text-primary flex gap-1 items-center hover:underline" @click="copyPrompt">
            <div i-carbon-copy />
            复制提示词
          </button>
        </div>
        <p class="text-xs text-gray-500 mt-1 dark:text-gray-400">
          把提示词发给 AI,并附上你的持仓截图或表格,AI 会输出可直接导入的 JSON。
        </p>
        <details class="mt-2">
          <summary class="text-xs text-gray-500 cursor-pointer dark:text-gray-400 hover:text-primary">
            展开提示词全文
          </summary>
          <pre class="text-xs leading-relaxed mt-2 p-3 border rounded bg-white whitespace-pre-wrap overflow-x-auto dark:border-gray-700 dark:bg-gray-800">{{ AI_PROMPT }}</pre>
        </details>
      </div>

      <!-- ② 粘贴 AI 返回的 JSON -->
      <div>
        <label for="import-json" class="text-sm font-medium mb-1 block">第二步:粘贴 AI 返回的 JSON</label>
        <textarea
          id="import-json"
          v-model="jsonText"
          rows="8"
          class="text-xs font-mono p-3 border rounded-md bg-white w-full dark:border-gray-600 dark:bg-gray-700"
          placeholder="[
  { &quot;code&quot;: &quot;161725&quot;, &quot;shares&quot;: 1234.56, &quot;costPrice&quot;: 0.9123 }
]"
          @input="onTextInput"
        />
      </div>

      <!-- ③ 或直接选文件 -->
      <div>
        <label class="text-sm font-medium mb-1 block">或者选择 JSON 文件</label>
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
          <input id="overwrite" v-model="overwrite" type="checkbox" class="text-primary border-gray-300 rounded h-4 w-4 focus:ring-primary">
        </div>
        <div class="text-sm leading-6 ml-3">
          <label for="overwrite" class="font-medium">覆盖模式</label>
          <p class="text-gray-500">
            选中此项将删除所有现有持仓，然后导入文件中的数据。
          </p>
        </div>
      </div>
    </div>
    <div class="mt-6 pt-4 border-t flex justify-end space-x-3 dark:border-gray-700">
      <button type="button" class="text-sm text-gray-700 font-medium px-4 py-2 rounded-md bg-gray-100" :disabled="loading" @click="emit('cancel')">
        取消
      </button>
      <button type="submit" class="btn flex items-center justify-center" :disabled="!canSubmit || loading">
        <span v-if="loading" class="flex gap-2 items-center">
          <div class="i-carbon-circle-dash animate-spin" />
          导入中...
        </span>
        <span v-else>确认导入</span>
      </button>
    </div>
  </form>
</template>
