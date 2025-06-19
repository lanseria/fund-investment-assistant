import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import * as schema from '~~/server/database/schemas'

let _db: NodePgDatabase<typeof schema> | null = null

export function useDb() {
  if (!_db) {
    const config = useRuntimeConfig()
    if (!config.dbUrl)
      throw new Error('DATABASE_URL is not defined in runtime config.')

    const client = new pg.Client({
      connectionString: config.dbUrl,
    })

    // 注意：在生产环境，建议使用 pg.Pool 以获得更好的性能和连接管理
    client.connect()

    _db = drizzle(client, { schema, logger: true })
  }
  return _db
}
