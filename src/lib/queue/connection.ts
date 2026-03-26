import IORedis from 'ioredis'

let connection: IORedis | null = null

export function getRedisConnection(): IORedis {
  if (!connection) {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379'
    connection = new IORedis(redisUrl, {
      maxRetriesPerRequest: null, // Required by BullMQ
      enableReadyCheck: false,
      retryStrategy: (times) => {
        if (times > 10) return null
        return Math.min(times * 200, 5000)
      },
    })

    connection.on('error', (err) => {
      console.error('[Redis] Connection error:', err.message)
    })

    connection.on('connect', () => {
      console.log('[Redis] Connected successfully')
    })
  }

  return connection
}

export async function closeRedisConnection() {
  if (connection) {
    await connection.quit()
    connection = null
  }
}
