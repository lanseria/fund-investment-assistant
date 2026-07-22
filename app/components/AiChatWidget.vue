<script setup lang="ts">
import type { ChatMessage } from '~/composables/useChatStore'
import MarkdownIt from 'markdown-exit'
import { useChatStore } from '~/composables/useChatStore'

const chatStore = useChatStore()

// markdown-exit 实例（安全配置：禁用原始 HTML，把换行渲染为 <br>）
const md = new MarkdownIt({
  html: false, // 禁止原始 HTML（防 XSS）
  breaks: true, // 单个换行 → <br>
  linkify: true, // 自动识别链接
})

const inputText = ref('')
const messagesContainer = ref<HTMLElement | null>(null)
const showSessionList = ref(false)

// 是否显示面板
const isOpen = computed(() => chatStore.isOpen)
const currentSession = computed(() =>
  chatStore.sessions.find(s => s.id === chatStore.currentSessionId),
)

// 工具名 → 中文友好标签 + 图标
const TOOL_META: Record<string, { label: string, icon: string }> = {
  get_portfolio: { label: '查询持仓', icon: 'i-carbon-portfolio' },
  get_fund_details: { label: '基金诊断', icon: 'i-carbon-analytics' },
  submit_trade_order: { label: '下单交易', icon: 'i-carbon-trading' },
  manage_pending_transactions: { label: '管理挂单', icon: 'i-carbon-list-checked' },
  manage_watchlist: { label: '管理自选', icon: 'i-carbon-favorite' },
  get_market_index: { label: '市场行情', icon: 'i-carbon-chart-line-smooth' },
  manage_sectors: { label: '板块字典', icon: 'i-carbon-grid' },
  admin_manage_users: { label: '用户管理', icon: 'i-carbon-user-multiple' },
  manage_ai_settings: { label: 'AI设置', icon: 'i-carbon-settings-adjust' },
}

function toolMeta(name: string) {
  return TOOL_META[name] || { label: name, icon: 'i-carbon-tool' }
}

/** 发送消息 */
async function handleSend() {
  const text = inputText.value.trim()
  if (!text || chatStore.isStreaming)
    return
  inputText.value = ''
  await chatStore.sendMessage(text)
}

/** Enter 发送 / Shift+Enter 换行 */
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSend()
  }
}

/** 自动滚动到底部 */
function scrollToBottom() {
  nextTick(() => {
    if (messagesContainer.value)
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
  })
}

watch(() => chatStore.messages.length, scrollToBottom)
// 流式内容变化时也滚动
watch(() => chatStore.messages.at(-1)?.content, scrollToBottom)

// 折叠的工具结果（按 toolCallId 记录展开状态）
const expandedResults = ref<Set<string>>(new Set())
function toggleResult(id: string) {
  if (expandedResults.value.has(id))
    expandedResults.value.delete(id)
  else
    expandedResults.value.add(id)
}

// 新建对话
async function handleNewChat() {
  showSessionList.value = false
  await chatStore.createSession()
}

// 选中会话
async function handleSelectSession(id: number) {
  showSessionList.value = false
  await chatStore.selectSession(id)
}

// 极简 Markdown 渲染（转义 + 常见语法），避免引入新依赖
// 使用 markdown-exit 渲染（标题/列表/粗体/代码块/链接等完整语法）
function renderMarkdown(text: string): string {
  if (!text)
    return ''
  return md.render(text)
}

// 快捷问题
const QUICK_PROMPTS = [
  { text: '查看我的持仓', icon: 'i-carbon-portfolio' },
  { text: '今天大盘怎么样？', icon: 'i-carbon-chart-line-smooth' },
  { text: '诊断基金 161725', icon: 'i-carbon-analytics' },
]
function sendQuick(text: string) {
  inputText.value = text
  handleSend()
}

// 打开面板时，若没有当前会话且有历史会话，自动选中第一个
watch(isOpen, (open) => {
  if (open && !chatStore.currentSessionId && chatStore.sessions.length > 0)
    chatStore.selectSession(chatStore.sessions[0]!.id)
})

function shouldShowQuickPrompts(msg: ChatMessage) {
  return msg.role === 'assistant' && msg.streaming && !msg.content && !(msg.toolCalls?.length)
}
</script>

<template>
  <div>
    <!-- 悬浮按钮 -->
    <button
      class="text-white rounded-full bg-primary flex h-14 w-14 shadow-lg transition-all duration-300 items-center bottom-6 right-6 justify-center fixed z-50 hover:bg-primary-hover hover:scale-105"
      :class="{ 'scale-90': isOpen }"
      aria-label="AI 助手"
      @click="chatStore.togglePanel()"
    >
      <div
        class="text-2xl"
        :class="chatStore.isStreaming ? 'i-carbon-circle-dash animate-spin' : (isOpen ? 'i-carbon-close' : 'i-carbon-chat-bot')"
      />
      <!-- 未读/在线脉冲 -->
      <span
        v-if="!isOpen"
        class="rounded-full bg-green-400 h-3 w-3 ring-2 ring-white right-0 top-0 absolute animate-ping dark:ring-gray-900"
      />
    </button>

    <!-- 对话面板 / 居中弹窗 -->
    <Transition name="chat-panel">
      <div
        v-if="isOpen"
        class="flex inset-0 justify-center fixed z-50"
        :class="chatStore.displayMode === 'dialog'
          ? 'items-center'
          // panel 模式：外层不拦截点击，面板自身 fixed 定位到右下角
          : 'pointer-events-none'"
      >
        <!-- dialog 模式的背景遮罩 -->
        <div
          v-if="chatStore.displayMode === 'dialog'"
          class="bg-black/50 inset-0 absolute"
          @click="chatStore.togglePanel()"
        />

        <!-- 主容器：panel 右下角 / dialog 居中放大 -->
        <div
          class="chat-container border rounded-lg bg-white flex flex-col shadow-2xl dark:border-gray-700 dark:bg-gray-800"
          :class="chatStore.displayMode === 'dialog'
            ? 'relative h-[85vh] w-[min(900px,calc(100vw-2rem))]'
            // panel 模式重新启用点击，并 fixed 到右下角
            : 'pointer-events-auto h-[600px] w-[400px] max-h-[calc(100vh-8rem)] max-w-[calc(100vw-2rem)] bottom-24 right-6 fixed'"
        >
          <!-- 顶栏 -->
          <div class="px-4 py-3 border-b flex shrink-0 items-center justify-between dark:border-gray-700">
            <div class="flex gap-2 min-w-0 items-center">
              <div class="i-carbon-chat-bot text-xl text-primary shrink-0" />
              <span class="font-bold truncate">
                {{ showSessionList ? '历史会话' : (currentSession?.title || 'AI 助手') }}
              </span>
            </div>
            <div class="flex shrink-0 gap-1 items-center">
              <button
                v-if="!showSessionList"
                class="icon-btn p-1.5 rounded"
                title="历史会话"
                @click="showSessionList = true"
              >
                <div class="i-carbon-list" />
              </button>
              <button
                class="icon-btn p-1.5 rounded"
                :title="showSessionList ? '返回对话' : '新对话'"
                @click="showSessionList ? (showSessionList = false) : handleNewChat()"
              >
                <div :class="showSessionList ? 'i-carbon-arrow-left' : 'i-carbon-add'" />
              </button>
              <!-- 切换展示模式：panel ↔ dialog -->
              <button
                class="icon-btn p-1.5 rounded"
                :title="chatStore.displayMode === 'dialog' ? '收起为悬浮窗' : '放大显示'"
                @click="chatStore.toggleDisplayMode()"
              >
                <div :class="chatStore.displayMode === 'dialog' ? 'i-carbon-minimize' : 'i-carbon-maximize'" />
              </button>
              <button class="icon-btn p-1.5 rounded" title="关闭" @click="chatStore.togglePanel()">
                <div class="i-carbon-close" />
              </button>
            </div>
          </div>

          <!-- 会话列表视图 -->
          <div v-if="showSessionList" class="p-2 flex-1 overflow-y-auto">
            <button
              v-for="s in chatStore.sessions"
              :key="s.id"
              class="mb-1 px-3 py-2.5 text-left rounded-md flex gap-2 w-full transition-colors items-center hover:bg-gray-100 dark:hover:bg-gray-700"
              :class="{ 'bg-primary/10 dark:bg-primary/20': s.id === chatStore.currentSessionId }"
              @click="handleSelectSession(s.id)"
            >
              <div class="i-carbon-chat text-gray-400 flex-shrink-0" />
              <div class="flex-1 min-w-0">
                <div class="text-sm truncate">
                  {{ s.title }}
                </div>
                <div class="text-xs text-gray-400">
                  {{ new Date(s.updatedAt).toLocaleString('zh-CN') }}
                </div>
              </div>
              <div
                class="i-carbon-trash-can text-gray-400 flex-shrink-0 hover:text-red-500"
                @click.stop="chatStore.deleteSession(s.id)"
              />
            </button>
            <div v-if="chatStore.sessions.length === 0" class="text-sm text-gray-400 py-8 text-center">
              暂无历史会话
            </div>
          </div>

          <!-- 消息视图 -->
          <template v-else>
            <!-- 消息区 -->
            <div ref="messagesContainer" class="p-4 flex-1 overflow-y-auto space-y-4">
              <!-- 空状态 -->
              <div
                v-if="chatStore.messages.length === 0"
                class="text-center flex flex-col gap-4 h-full items-center justify-center"
              >
                <div class="i-carbon-chat-bot text-5xl text-primary op-60" />
                <div>
                  <p class="font-bold mb-1">
                    👋 你好，我是你的 AI 投资助手
                  </p>
                  <p class="text-sm text-gray-500 dark:text-gray-400">
                    可以问我持仓、行情，或让我帮你下单
                  </p>
                </div>
                <div class="flex flex-col gap-2 w-full">
                  <button
                    v-for="p in QUICK_PROMPTS"
                    :key="p.text"
                    class="text-sm px-3 py-2 border rounded-md flex gap-2 transition-colors items-center dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700"
                    :disabled="chatStore.isStreaming"
                    @click="sendQuick(p.text)"
                  >
                    <div :class="p.icon" class="text-primary" />
                    {{ p.text }}
                  </button>
                </div>
              </div>

              <!-- 消息列表 -->
              <div
                v-for="(msg, idx) in chatStore.messages"
                :key="idx"
                class="flex flex-col"
                :class="msg.role === 'user' ? 'items-end' : 'items-start'"
              >
                <!-- 工具调用卡片（仅 assistant） -->
                <template v-if="msg.role === 'assistant' && msg.toolCalls?.length">
                  <div
                    v-for="tc in msg.toolCalls"
                    :key="tc.toolCallId"
                    class="text-sm mb-1 border rounded-md w-full overflow-hidden dark:border-gray-600"
                  >
                    <button
                      class="px-3 py-2 bg-gray-50 flex gap-2 w-full transition-colors items-center dark:bg-gray-900/50 hover:bg-gray-100 dark:hover:bg-gray-900"
                      @click="toggleResult(tc.toolCallId)"
                    >
                      <div :class="toolMeta(tc.name).icon" class="text-primary shrink-0" />
                      <span class="font-medium text-left flex-1">{{ toolMeta(tc.name).label }}</span>
                      <!-- 状态 -->
                      <span v-if="tc.pending" class="text-xs text-gray-400 flex gap-1 items-center">
                        <div class="i-carbon-circle-dash animate-spin" /> 执行中
                      </span>
                      <span v-else-if="tc.isError" class="text-xs text-red-500 flex gap-1 items-center">
                        <div class="i-carbon-close-filled" /> 失败
                      </span>
                      <span v-else-if="tc.result" class="text-xs text-green-500 flex gap-1 items-center">
                        <div class="i-carbon-checkmark-filled" /> 完成
                      </span>
                      <div
                        v-if="tc.result"
                        class="i-carbon-chevron-down text-xs text-gray-400 transition-transform"
                        :class="{ 'rotate-180': expandedResults.has(tc.toolCallId) }"
                      />
                    </button>
                    <!-- 工具结果（折叠） -->
                    <div
                      v-if="tc.result && expandedResults.has(tc.toolCallId)"
                      class="text-xs text-gray-600 font-mono px-3 py-2 bg-gray-50 max-h-48 whitespace-pre-wrap overflow-y-auto dark:text-gray-300 dark:bg-gray-900/30"
                    >
                      {{ tc.result }}
                    </div>
                  </div>
                </template>

                <!-- 文本气泡 -->
                <div
                  v-if="msg.content || (msg.role === 'assistant' && msg.streaming && !msg.toolCalls?.length)"
                  class="text-sm leading-relaxed px-3 py-2 rounded-lg max-w-[85%]"
                  :class="msg.role === 'user'
                    ? 'bg-primary text-white rounded-br-none'
                    : 'bg-gray-100 dark:bg-gray-700 rounded-bl-none'"
                >
                  <template v-if="msg.role === 'user'">
                    {{ msg.content }}
                  </template>
                  <template v-else>
                    <!-- 思考占位 -->
                    <span v-if="shouldShowQuickPrompts(msg)" class="text-gray-400 flex gap-1 items-center">
                      <span class="rounded-full bg-gray-400 h-2 w-2 inline-block animate-bounce" style="animation-delay: 0ms" />
                      <span class="rounded-full bg-gray-400 h-2 w-2 inline-block animate-bounce" style="animation-delay: 150ms" />
                      <span class="rounded-full bg-gray-400 h-2 w-2 inline-block animate-bounce" style="animation-delay: 300ms" />
                      思考中...
                    </span>
                    <div v-else class="max-w-none prose prose-sm dark:prose-invert" v-html="renderMarkdown(msg.content)" />
                  </template>
                  <!-- 流式光标 -->
                  <span v-if="msg.role === 'assistant' && msg.streaming && msg.content" class="ml-0.5 align-middle bg-primary h-4 w-1.5 inline-block animate-pulse" />
                </div>
              </div>
            </div>

            <!-- 输入区 -->
            <div class="p-3 border-t shrink-0 dark:border-gray-700">
              <div class="flex gap-2 items-end">
                <textarea
                  v-model="inputText"
                  class="text-sm input-base flex-1 max-h-32 resize-none"
                  rows="1"
                  placeholder="输入消息，Enter 发送，Shift+Enter 换行"
                  :disabled="chatStore.isStreaming"
                  @keydown="onKeydown"
                />
                <button
                  class="btn px-3 py-2 flex flex-shrink-0 gap-1 items-center"
                  :disabled="!inputText.trim() || chatStore.isStreaming"
                  @click="handleSend()"
                >
                  <div v-if="chatStore.isStreaming" class="i-carbon-circle-dash animate-spin" />
                  <div v-else class="i-carbon-send" />
                </button>
              </div>
            </div>
          </template>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.chat-panel-enter-active,
.chat-panel-leave-active {
  transition: opacity 0.25s ease;
}
.chat-panel-enter-from,
.chat-panel-leave-to {
  opacity: 0;
}
</style>
