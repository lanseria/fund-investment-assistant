export const AI_MODELS = [
  'glm-5.3',
] as const

export type AiModel = typeof AI_MODELS[number]
