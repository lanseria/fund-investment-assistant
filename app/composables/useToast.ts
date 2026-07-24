import { acceptHMRUpdate, defineStore } from 'pinia'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

export interface ToastItem {
  id: number
  type: ToastType
  message: string
  /** 自动关闭延时(ms)，0 表示不自动关闭 */
  duration: number
}

interface ToastState {
  toasts: ToastItem[]
}

let toastId = 0

export const useToastStore = defineStore('toast', {
  state: (): ToastState => ({
    toasts: [],
  }),

  actions: {
    /**
     * 推送一条通知
     * @param type 通知类型
     * @param message 通知内容
     * @param duration 自动关闭延时(ms)，默认 3000，传 0 则常驻直到手动关闭
     */
    push(type: ToastType, message: string, duration = 3000) {
      const id = ++toastId
      this.toasts.push({ id, type, message, duration })

      if (duration > 0) {
        setTimeout(() => this.remove(id), duration)
      }
      return id
    },

    /** 便捷方法 */
    success(message: string, duration?: number) {
      return this.push('success', message, duration)
    },
    error(message: string, duration?: number) {
      return this.push('error', message, duration ?? 5000) // 错误信息默认停留更久
    },
    warning(message: string, duration?: number) {
      return this.push('warning', message, duration ?? 4000)
    },
    info(message: string, duration?: number) {
      return this.push('info', message, duration)
    },

    /** 移除指定通知 */
    remove(id: number) {
      const index = this.toasts.findIndex(t => t.id === id)
      if (index !== -1)
        this.toasts.splice(index, 1)
    },

    /** 清空所有通知 */
    clear() {
      this.toasts.splice(0, this.toasts.length)
    },
  },
})

/**
 * Toast 通知 composable，提供 push/success/error/warning/info/remove 等方法。
 * 全站替换原生 alert() 的统一方案。
 *
 * @example
 * const toast = useToast()
 * toast.success('保存成功')
 * toast.error('操作失败: ' + err.message)
 */
export function useToast() {
  return useToastStore()
}

if (import.meta.hot)
  import.meta.hot.accept(acceptHMRUpdate(useToastStore, import.meta.hot))
