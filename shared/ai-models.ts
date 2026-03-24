export const AI_MODELS = [
  'GLM-5',
] as const

export type AiModel = typeof AI_MODELS[number]
