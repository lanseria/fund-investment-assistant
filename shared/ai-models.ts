export const AI_MODELS = [
  'deepseek-v4-flash-0731',
] as const

export type AiModel = typeof AI_MODELS[number]
