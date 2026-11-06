import { env } from 'node:process'
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'postgresql',
  schema: './server/database/schemas.ts',
  out: './server/database/drizzle',
  migrations: { schema: 'drizzle_fund' },
  dbCredentials: {
    url: env.NUXT_DB_URL!,
  },
  verbose: true,
  strict: true,
})
