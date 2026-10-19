export const AI_MODELS = [
  'deepseek-v4.1-flash-1017',
] as const

export type AiModel = typeof AI_MODELS[number]
