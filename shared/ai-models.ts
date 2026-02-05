export const AI_MODELS = [
  'glm-4.7',
  'deepseek-v3.2',
  'kimi-k2-thinking',
  'kimi-k2.5',
] as const

export type AiModel = typeof AI_MODELS[number]
