import redisDriver from 'unstorage/drivers/redis'

export default defineNitroPlugin(() => {
  const storage = useStorage()
  const config = useRuntimeConfig()

  // 从运行时配置动态传入凭据
  // base 即 Redis 实际键名的前缀 (如 fund-prod:localKey)，
  // 通过 NUXT_REDIS_KEY_PREFIX 区分不同部署实例，避免密钥/缓存串用
  const driver = redisDriver({
    base: config.redis.keyPrefix || 'fund',
    host: config.redis.host,
    port: 6379,
    password: config.redis.password,
    db: 0,
    // 其他 redis 连接器选项
  })

  // 挂载驱动
  storage.mount('redis', driver)
})
