/* eslint-disable no-console */
// server/routes/api/sse/holdings.get.ts (这是移动后的新文件)
import { getUserFromEvent } from '~~/server/utils/auth'
import { emitter } from '~~/server/utils/emitter'
import { getUserHoldingsAndSummary } from '~~/server/utils/holdings'

export default defineEventHandler(async (event) => {
  const user = getUserFromEvent(event)
  const eventStream = createEventStream(event)

  async function sendUpdate() {
    try {
      const data = await getUserHoldingsAndSummary(user.id)
      await eventStream.push(JSON.stringify(data))
    }
    catch (e) {
      console.error(`[SSE] Error sending update to user ${user.id}:`, e)
    }
  }

  emitter.on('holdings:updated', sendUpdate)

  eventStream.onClosed(async () => {
    console.log(`[SSE] Connection closed for user ${user.id}. Removing listener.`)
    emitter.off('holdings:updated', sendUpdate)
    await eventStream.close()
  })

  sendUpdate()
  return eventStream.send()
})
