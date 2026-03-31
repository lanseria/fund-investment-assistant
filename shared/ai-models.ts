export const AI_MODELS = [
  'glm-5.1',
] as const

export type AiModel = typeof AI_MODELS[number]
