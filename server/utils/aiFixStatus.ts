export interface AiFixStatus {
  loading: boolean
  model?: string
  startedAt?: string
  finishedAt?: string
  error?: string
}

const AI_FIX_LOADING_PREFIX = 'ai:daily-ops:loading'

export function getAiFixLoadingKey(date: string, userId: number) {
  return `${AI_FIX_LOADING_PREFIX}:${date}:${userId}`
}

export async function getAiFixStatus(date: string, userId: number) {
  const storage = useStorage('redis')
  return await storage.getItem<AiFixStatus>(getAiFixLoadingKey(date, userId))
}

export async function setAiFixStatus(date: string, userId: number, status: AiFixStatus) {
  const storage = useStorage('redis')
  await storage.setItem(getAiFixLoadingKey(date, userId), status)
}
