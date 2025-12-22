export default defineEventHandler(async () => {
  const result = await runTask('fund:processTransactions')
  return result
})
