export const AI_MODELS = [
  'GLM-5',
  'GLM-5-Turbo',
] as const

export type AiModel = typeof AI_MODELS[number]
