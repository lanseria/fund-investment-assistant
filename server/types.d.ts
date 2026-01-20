import type { UserPayload } from './utils/auth'

declare module 'h3' {
  interface H3EventContext {
    userId?: number
    user?: UserPayload
  }
}
