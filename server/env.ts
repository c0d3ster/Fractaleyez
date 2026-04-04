export const env = {
  MONGO_URI: process.env.MONGO_URI,
  NODE_ENV: process.env.NODE_ENV ?? 'development',
}

export const requireEnv = {
  MONGO_URI: (): string => {
    if (!env.MONGO_URI) throw new Error('MONGO_URI is required but not set')
    return env.MONGO_URI
  },
}
