import { z } from 'zod'

export default defineMcpTool({
  name: 'test',
  description: 'A simple test tool',
  inputSchema: {
    message: z.string(),
  },
  handler: async ({ message }) => {
    return {
      content: [{
        type: 'text',
        text: `Test successful: ${message}`,
      }],
    }
  },
})
