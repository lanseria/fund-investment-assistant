// server/utils/db.ts
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from '~~/server/database/schemas'

let _db: NodePgDatabase<typeof schema> | null = null

export function useDb() {
  // 如果实例已存在，直接返回，实现单例模式
  if (_db)
    return _db

  const config = useRuntimeConfig()
  if (!config.dbUrl)
    throw new Error('DATABASE_URL is not defined in runtime config.')

  // 始终使用连接池 (Pool)，以避免并发查询导致 "Calling client.query() when the client is already executing a query" 警告
  const driver = new Pool({
    connectionString: config.dbUrl,
  })

  _db = drizzle(driver, { schema, logger: false })

  return _db
}
