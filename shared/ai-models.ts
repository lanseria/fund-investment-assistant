export const AI_MODELS = [
  'glm-5.2',
] as const

export type AiModel = typeof AI_MODELS[number]
