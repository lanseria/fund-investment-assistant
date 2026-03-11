export const AI_MODELS = [
  'doubao-seed-2.0-code',
  'doubao-seed-2.0-pro',
  'doubao-seed-2.0-lite',
  'doubao-seed-code',
  'minimax-m2.5',
  'glm-4.7',
  'deepseek-v3.2',
  'kimi-k2.5',
] as const

export type AiModel = typeof AI_MODELS[number]
