/* eslint-disable no-console */
import { generateKeys } from 'paseto-ts/v4'

/**
 * 安全初始化PASETO密钥
 * 1. localKey: 用于access token的对称加密 (V4.local)
 * 2. refreshPrivateKey/PublicKey: 用于refresh token的非对称签名 (V4.public)
 */
export default defineNitroPlugin(async () => {
  const storage = useStorage('redis')

  try {
    const localKey = await storage.getItem('localKey')
    if (!localKey) {
      const newLocalKey = await generateKeys('local')
      await storage.setItem('localKey', newLocalKey)
      console.info('✔ PASETO: Generated new localKey for access tokens.')
    }

    const privateKey = await storage.getItem('refreshPrivateKey')
    const publicKey = await storage.getItem('refreshPublicKey')

    if (!privateKey || !publicKey) {
      const keyPair = await generateKeys('public')
      await Promise.all([
        storage.setItem('refreshPrivateKey', keyPair.secretKey),
        storage.setItem('refreshPublicKey', keyPair.publicKey),
      ])
      console.info('✔ PASETO: Generated new key pair for refresh tokens.')
    }

    console.info('✅ PASETO: All keys are properly initialized.')
  }
  catch (error) {
    console.error('❌ PASETO: Failed to initialize keys:', error)
    throw error
  }
})
