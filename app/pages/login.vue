<script setup lang="ts">
import { appName } from '~/constants'

definePageMeta({
  layout: 'blank',
})

useHead({
  title: `登录 - ${appName}`,
})

const authStore = useAuthStore()
const { cycleTheme, currentTheme } = useTheme()
const colorMode = useColorMode()

function toggleDark() {
  colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark'
}

// 使用 VueUse 的 useLocalStorage 持久化状态
const rememberMe = useLocalStorage('auth-remember', false)
const savedUsername = useLocalStorage('auth-username', '')
const savedPassword = useLocalStorage('auth-password', '')

// 初始化时，如果开启了记住密码，则读取本地存储
const credentials = reactive({
  username: rememberMe.value ? savedUsername.value : '',
  password: rememberMe.value ? savedPassword.value : '',
})

const isLoading = ref(false)
const errorMessage = ref('') // 用于存储错误信息
const showPassword = ref(false)

if (authStore.isAuthenticated) {
  navigateTo('/')
}

// 左侧品牌区特性列表
const features = [
  { icon: 'i-carbon-flash', title: '实时估值', desc: '盘中 SSE 推送，持仓涨跌实时可见' },
  { icon: 'i-carbon-analytics', title: '策略信号', desc: '主力资金 · RSI · 布林带多维信号' },
  { icon: 'i-carbon-bot', title: 'AI 助手', desc: '智能分析持仓，给出操作建议' },
]

async function handleLogin() {
  isLoading.value = true
  errorMessage.value = '' // 开始登录前清空错误信息
  try {
    await authStore.login(credentials)

    // 登录成功后，根据是否勾选“记住我”来更新本地存储
    if (rememberMe.value) {
      savedUsername.value = credentials.username
      savedPassword.value = credentials.password
    }
    else {
      savedUsername.value = ''
      savedPassword.value = ''
    }

    // 成功后，全局中间件会自动处理跳转
  }
  catch (error: any) {
    // 将 alert 替换为设置错误信息
    errorMessage.value = error.data?.statusMessage || '登录时发生未知错误，请重试。'
  }
  finally {
    isLoading.value = false
  }
}
</script>

<template>
  <div class="login-page flex min-h-screen">
    <!-- 左侧品牌展示区（桌面端） -->
    <aside class="brand-panel w-[45%] hidden items-center relative overflow-hidden lg:flex">
      <div class="brand-grid" aria-hidden="true" />

      <!-- 装饰性净值曲线 -->
      <svg class="op-90 w-full bottom-0 right-0 absolute" viewBox="0 0 600 300" fill="none" aria-hidden="true">
        <defs>
          <linearGradient id="curve-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#ffffff" stop-opacity="0.10" />
            <stop offset="100%" stop-color="#ffffff" stop-opacity="0" />
          </linearGradient>
        </defs>
        <path
          d="M0 268 C 50 258 80 262 120 232 S 210 196 255 204 S 355 128 415 136 S 520 66 600 44 L 600 300 L 0 300 Z"
          fill="url(#curve-fill)"
        />
        <path
          d="M0 268 C 50 258 80 262 120 232 S 210 196 255 204 S 355 128 415 136 S 520 66 600 44"
          stroke="rgba(255,255,255,0.22)"
          stroke-width="2"
        />
        <circle cx="415" cy="136" r="4" fill="rgba(255,255,255,0.5)" />
        <circle cx="600" cy="44" r="5" style="fill: var(--theme-primary)" />
      </svg>

      <div class="p-12 w-full relative z-10 xl:p-16">
        <div class="mx-auto max-w-md w-full">
          <!-- 品牌标识 -->
          <div class="flex gap-3 items-center">
            <div class="border border-white/15 rounded-xl bg-white/10 flex flex-shrink-0 h-12 w-12 items-center justify-center backdrop-blur">
              <div class="i-carbon-finance text-2xl" style="color: color-mix(in srgb, var(--theme-primary) 55%, white)" />
            </div>
            <div>
              <p class="text-xl text-white font-bold">
                {{ appName }}
              </p>
              <p class="text-xs text-white/45 tracking-widest uppercase">
                Fund Assistant
              </p>
            </div>
          </div>

          <!-- 主标语 -->
          <h2 class="text-3xl text-white leading-snug tracking-tight font-bold mt-10 xl:text-4xl">
            让每一笔投资
            <br>
            都有数据可依
          </h2>
          <p class="text-white/55 leading-relaxed mt-4">
            实时估值、策略信号与 AI 决策辅助，一站式管理您的基金投资组合。
          </p>

          <!-- 特性列表 -->
          <ul class="mt-10 space-y-5">
            <li v-for="f in features" :key="f.title" class="flex gap-4 items-start">
              <div class="border border-white/12 rounded-lg bg-white/8 flex flex-shrink-0 h-10 w-10 items-center justify-center">
                <div :class="f.icon" class="text-xl text-white/90" />
              </div>
              <div>
                <p class="text-white font-medium">
                  {{ f.title }}
                </p>
                <p class="text-sm text-white/50 mt-0.5">
                  {{ f.desc }}
                </p>
              </div>
            </li>
          </ul>

          <!-- 示意数据卡片 -->
          <div class="mt-10 p-5 border border-white/12 rounded-xl bg-white/8 shadow-2xl backdrop-blur">
            <div class="flex items-center justify-between">
              <span class="text-sm text-white/55">预估总资产</span>
              <span class="text-xs text-emerald-300 font-mono px-2 py-0.5 border border-emerald-300/20 rounded-full bg-emerald-400/10">
                ▲ +2.35%
              </span>
            </div>
            <div class="mt-1 flex gap-2 items-baseline">
              <p class="text-2xl text-white font-mono font-semibold">
                ¥128,460.52
              </p>
              <span class="text-[10px] text-white/30 px-1 border border-white/15 rounded">示意</span>
            </div>
            <div class="text-xs text-white/45 mt-4 pt-4 border-t border-white/10 flex justify-between">
              <span>持仓 8 只</span>
              <span>今日交易 3 笔</span>
              <span>策略信号 5 条</span>
            </div>
          </div>
        </div>
      </div>
    </aside>

    <!-- 右侧登录表单区 -->
    <main class="p-4 flex flex-1 items-center justify-center relative lg:p-8 sm:p-6">
      <div class="form-bg" aria-hidden="true" />

      <!-- 主题与深色模式切换 -->
      <div class="flex gap-2 right-4 top-4 fixed z-20">
        <button
          class="border border-white/60 rounded-lg bg-white/70 flex h-9 w-9 cursor-pointer shadow-sm transition-colors items-center justify-center backdrop-blur dark:border-white/10 dark:bg-white/10 hover:bg-white/90 dark:hover:bg-white/15"
          :title="`切换主题: ${currentTheme.label}`"
          @click="cycleTheme()"
        >
          <div class="i-carbon-color-palette text-lg text-gray-600 dark:text-gray-300" />
        </button>
        <button
          class="border border-white/60 rounded-lg bg-white/70 flex h-9 w-9 cursor-pointer shadow-sm transition-colors items-center justify-center backdrop-blur dark:border-white/10 dark:bg-white/10 hover:bg-white/90 dark:hover:bg-white/15"
          :title="colorMode.value === 'dark' ? '切换亮色' : '切换深色'"
          @click="toggleDark()"
        >
          <div class="i-carbon-sun dark:i-carbon-moon text-lg text-gray-600 dark:text-gray-300" />
        </button>
      </div>

      <div class="max-w-sm w-full relative z-10">
        <!-- 移动端品牌标识 -->
        <div class="mb-8 flex flex-col items-center lg:hidden">
          <div class="border border-white/60 rounded-2xl bg-white/70 flex h-14 w-14 shadow-sm items-center justify-center backdrop-blur dark:border-white/10 dark:bg-white/10">
            <div class="i-carbon-finance text-3xl" style="color: var(--theme-primary)" />
          </div>
          <p class="text-lg font-bold mt-3">
            {{ appName }}
          </p>
        </div>

        <!-- 登录卡片 -->
        <div class="auth-card p-8 rounded-2xl">
          <h1 class="auth-title text-2xl font-bold">
            欢迎回来
          </h1>
          <p class="text-gray-500 mt-1 dark:text-gray-400">
            登录您的 {{ appName }} 账户
          </p>

          <form class="mt-8 space-y-5" @submit.prevent="handleLogin">
            <!-- 用户名输入 -->
            <div class="space-y-1.5">
              <label for="username" class="text-sm font-medium">用户名</label>
              <div class="relative">
                <div class="i-carbon-user text-lg op-40 left-3 top-1/2 absolute -translate-y-1/2" />
                <input
                  id="username"
                  v-model="credentials.username"
                  type="text"
                  autocomplete="username"
                  class="input-base pl-10"
                  placeholder="请输入用户名"
                  required
                >
              </div>
            </div>

            <!-- 密码输入 -->
            <div class="space-y-1.5">
              <label for="password" class="text-sm font-medium">密码</label>
              <div class="relative">
                <div class="i-carbon-locked text-lg op-40 left-3 top-1/2 absolute -translate-y-1/2" />
                <input
                  id="password"
                  v-model="credentials.password"
                  :type="showPassword ? 'text' : 'password'"
                  autocomplete="current-password"
                  class="input-base pl-10 pr-10"
                  placeholder="请输入密码"
                  required
                >
                <button
                  type="button"
                  class="text-gray-400 cursor-pointer transition-colors right-3 top-1/2 absolute hover:text-primary -translate-y-1/2"
                  :aria-label="showPassword ? '隐藏密码' : '显示密码'"
                  @click="showPassword = !showPassword"
                >
                  <div :class="showPassword ? 'i-carbon-view-off' : 'i-carbon-view'" class="text-lg" />
                </button>
              </div>
            </div>

            <!-- 记住密码选项 -->
            <label class="text-sm text-gray-600 flex gap-2 cursor-pointer select-none items-center dark:text-gray-400">
              <input
                v-model="rememberMe"
                type="checkbox"
                class="accent-primary border-gray-300 rounded h-4 w-4 cursor-pointer dark:border-gray-600"
              >
              记住账号密码
            </label>

            <!-- 错误信息提示 -->
            <Transition name="fade">
              <div
                v-if="errorMessage"
                role="alert"
                class="text-sm text-red-600 px-3 py-2.5 border border-red-200/70 rounded-lg bg-red-50 flex gap-2 items-start dark:text-red-400 dark:border-red-500/20 dark:bg-red-500/10"
              >
                <div class="i-carbon-warning mt-0.5 flex-shrink-0" />
                <span>{{ errorMessage }}</span>
              </div>
            </Transition>

            <!-- 登录按钮 -->
            <button
              type="submit"
              class="text-base btn flex h-11 w-full shadow-lg shadow-primary/25 transition-shadow items-center justify-center hover:shadow-primary/40"
              :disabled="isLoading"
            >
              <span v-if="!isLoading">登录</span>
              <span v-else class="flex gap-2 items-center">
                <div class="i-carbon-circle-dash animate-spin" />
                登录中...
              </span>
            </button>
          </form>
        </div>

        <p class="text-xs text-gray-400 leading-relaxed mt-6 text-center dark:text-gray-500">
          © {{ new Date().getFullYear() }} {{ appName }} · 数据仅供参考，不构成投资建议
        </p>
      </div>
    </main>
  </div>
</template>

<style scoped>
/* 页面级排版：与首页一致的中文友好无衬线栈 + 等宽数字 */
.login-page {
  font-family:
    system-ui,
    -apple-system,
    'Segoe UI',
    'PingFang SC',
    'Hiragino Sans GB',
    'Microsoft YaHei',
    'Noto Sans CJK SC',
    sans-serif;
  font-variant-numeric: tabular-nums;
  -webkit-font-smoothing: antialiased;
}

/* --- 左侧品牌面板：深色底 + 主题色光晕（color-mix 挂在 --theme-primary 上，换主题自动跟随） --- */
.brand-panel {
  background:
    radial-gradient(
      42rem 42rem at 85% -10%,
      color-mix(in srgb, var(--theme-primary) 60%, transparent),
      transparent 62%
    ),
    radial-gradient(
      34rem 34rem at -12% 105%,
      color-mix(in srgb, var(--theme-primary) 38%, transparent),
      transparent 60%
    ),
    linear-gradient(158deg, #0b1120 20%, #101b30);
}

/* 网格纹理，中心渐隐 */
.brand-grid {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(to right, rgb(255 255 255 / 0.05) 1px, transparent 1px),
    linear-gradient(to bottom, rgb(255 255 255 / 0.05) 1px, transparent 1px);
  background-size: 2.5rem 2.5rem;
  -webkit-mask-image: radial-gradient(75% 75% at 60% 40%, black, transparent);
  mask-image: radial-gradient(75% 75% at 60% 40%, black, transparent);
}

/* --- 右侧表单区氛围背景（含移动端），与首页同语言 --- */
.form-bg {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(
      36rem 36rem at 110% -15%,
      color-mix(in srgb, var(--theme-primary) 12%, transparent),
      transparent 60%
    ),
    radial-gradient(28rem 28rem at -15% 110%, color-mix(in srgb, var(--theme-primary) 9%, transparent), transparent 58%);
}

.form-bg::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(to right, rgb(15 23 42 / 0.04) 1px, transparent 1px),
    linear-gradient(to bottom, rgb(15 23 42 / 0.04) 1px, transparent 1px);
  background-size: 2.5rem 2.5rem;
  -webkit-mask-image: linear-gradient(to bottom, black, transparent 80%);
  mask-image: linear-gradient(to bottom, black, transparent 80%);
}

html.dark .form-bg {
  background:
    radial-gradient(
      36rem 36rem at 110% -15%,
      color-mix(in srgb, var(--theme-primary) 22%, transparent),
      transparent 60%
    ),
    radial-gradient(
      28rem 28rem at -15% 110%,
      color-mix(in srgb, var(--theme-primary) 15%, transparent),
      transparent 58%
    );
}

html.dark .form-bg::before {
  background-image:
    linear-gradient(to right, rgb(148 163 184 / 0.05) 1px, transparent 1px),
    linear-gradient(to bottom, rgb(148 163 184 / 0.05) 1px, transparent 1px);
}

/* --- 登录卡片：玻璃拟态 --- */
.auth-card {
  background: rgb(255 255 255 / 0.8);
  border: 1px solid rgb(255 255 255 / 0.65);
  box-shadow: 0 8px 40px rgb(15 23 42 / 0.08);
  -webkit-backdrop-filter: blur(12px);
  backdrop-filter: blur(12px);
  animation: rise 0.5s ease both;
}

html.dark .auth-card {
  background: rgb(31 41 55 / 0.75);
  border-color: rgb(255 255 255 / 0.08);
  box-shadow: 0 8px 40px rgb(0 0 0 / 0.4);
}

/* 卡片入场动效 */
@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(12px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* 标题：品牌色渐变文字 */
.auth-title {
  background-image: linear-gradient(120deg, #0f172a 35%, color-mix(in srgb, var(--theme-primary) 75%, #0f172a));
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

html.dark .auth-title {
  background-image: linear-gradient(120deg, #f9fafb 35%, color-mix(in srgb, var(--theme-primary) 65%, #f9fafb));
}

/* 错误提示过渡 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
