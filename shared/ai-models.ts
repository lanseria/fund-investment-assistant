export const AI_MODELS = [
  'doubao-seed-2.0-code',
  'doubao-seed-2.0-pro',
] as const

export type AiModel = typeof AI_MODELS[number]
