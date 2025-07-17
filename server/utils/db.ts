/* eslint-disable no-console */
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
// server/utils/db.ts
import { env } from 'node:process'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Client, Pool } from 'pg'
import * as schema from '~~/server/database/schemas'

let _db: NodePgDatabase<typeof schema> | null = null

export function useDb() {
  // 如果实例已存在，直接返回，实现单例模式
  if (_db)
    return _db

  const config = useRuntimeConfig()
  if (!config.dbUrl)
    throw new Error('DATABASE_URL is not defined in runtime config.')

  // 根据环境变量选择使用 Pool 还是 Client
  let driver: Pool | Client
  if (env.NODE_ENV === 'production') {
    // 生产环境: 使用连接池 (Pool) 以获得更好的性能和连接管理
    console.log('Database: Initializing with pg.Pool for production.')
    driver = new Pool({
      connectionString: config.dbUrl,
      // 你可以在这里添加更多生产环境的连接池配置, 例如:
      // max: 20, // 最大连接数
      // idleTimeoutMillis: 30000, // 空闲连接超时时间
      // connectionTimeoutMillis: 2000, // 连接超时时间
    })
  }
  else {
    // 开发环境: 使用单个客户端 (Client) 更简单直接
    console.log('Database: Initializing with pg.Client for development.')
    driver = new Client({
      connectionString: config.dbUrl,
    })
    // pg.Client 需要显式连接
    driver.connect()
  }

  _db = drizzle(driver, { schema, logger: false })

  return _db
}
