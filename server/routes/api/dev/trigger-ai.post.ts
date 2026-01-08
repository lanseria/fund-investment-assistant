export default defineEventHandler(async () => {
  const result = await runTask('ai:runAutoTrade')
  return { result }
})
