export const AI_MODELS = [
  'doubao-seed-2-0-pro-260215',
] as const

export type AiModel = typeof AI_MODELS[number]
