ERROR Token validation failed for path /api/auth/me: Decryption failed: invalid authentication tag 1:40:50 PM
ERROR [request error] [unhandled] [POST] http://localhost:3000/api/auth/refresh 1:40:50 PM

ℹ Error: Invalid token signature

⁃ at verify (node_modules/.pnpm/paseto-ts@2.0.5/node_modules/paseto-ts/dist/v4/verify.js:47:15)
⁃ at Object.handler (server/routes/api/auth/refresh.post.ts:20:0)

15 ┃ const refreshPublicKey = await useStorage('redis').getItem<string>('refreshPublicKey')
16 ┃ if (!refreshPublicKey)
17 ┃ throw new Error('Server not initialized: public key is missing.')
18 ┃
19 ┃ // PASETO 会自动验证 refreshToken 是否已过期
❯ 20 ┃ const { payload } = await verify(refreshPublicKey, refreshToken)
21 ┃ const userId = payload.sub
22 ┃
23 ┃ const db = useDb()
24 ┃ const user = await db.query.users.findFirst({ where: eq(users.id, Number(userId)) })
25 ┃ if (!user)

⁃ at process.processTicksAndRejections (node:internal/process/task_queues:105:5)
⁃ (async file://node_modules/.pnpm/h3@1.15.4/node_modules/h3/dist/index.mjs:2004:19)
⁃ at async Object.callAsync (node_modules/.pnpm/unctx@2.5.0/node_modules/unctx/dist/index.mjs:72:16)
⁃ at async Server.toNodeHandle (node_modules/.pnpm/h3@1.15.4/node_modules/h3/dist/index.mjs:2296:7)

[CAUSE]
PasetoSignatureInvalid {
stack: 'Invalid token signature\n' +
'at verify (./node_modules/.pnpm/paseto-ts@2.0.5/node_modules/paseto-ts/dist/v4/verify.js:47:15)\n' +
'at Object.handler (./server/routes/api/auth/refresh.post.ts:20:0)\n' +
' at process.processTicksAndRejections (node:internal/process/task_queues:105:5)\n' +
'at async file://./node_modules/.pnpm/h3@1.15.4/node_modules/h3/dist/index.mjs:2004:19)\n' +
'at async Object.callAsync (./node_modules/.pnpm/unctx@2.5.0/node_modules/unctx/dist/index.mjs:72:16)\n' +
'at async Server.toNodeHandle (./node_modules/.pnpm/h3@1.15.4/node_modules/h3/dist/index.mjs:2296:7)',
message: 'Invalid token signature',
code: 'ERR_PASETO_SIGNATURE_INVALID',
name: 'PasetoSignatureInvalid',
}
