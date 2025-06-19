import { deleteHoldingByCode, HoldingNotFoundError } from '~~/server/utils/holdings'

export default defineEventHandler(async (event) => {
  const code = getRouterParam(event, 'code')
  if (!code)
    throw createError({ statusCode: 400, statusMessage: 'Fund code is required.' })

  try {
    await deleteHoldingByCode(code)
    setResponseStatus(event, 204) // No Content
  }
  catch (error) {
    if (error instanceof HoldingNotFoundError)
      throw createError({ statusCode: 404, statusMessage: error.message })

    throw createError({ statusCode: 500, statusMessage: 'Internal Server Error' })
  }
})
