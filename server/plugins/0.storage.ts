import redisDriver from 'unstorage/drivers/redis'

export default defineNitroPlugin(() => {
  const storage = useStorage()
  const config = useRuntimeConfig()

  // 从运行时配置动态传入凭据
  const driver = redisDriver({
    base: 'redis',
    host: config.redis.host,
    port: 6379,
    password: config.redis.password,
    db: 0,
    // 其他 redis 连接器选项
  })

  // 挂载驱动
  storage.mount('redis', driver)
})
