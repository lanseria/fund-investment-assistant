import { getUserFromEvent } from '~~/server/utils/auth'

export default defineEventHandler((event) => {
  // The auth middleware has already validated the token and attached the user.
  // We just need to return it.
  return getUserFromEvent(event)
})
