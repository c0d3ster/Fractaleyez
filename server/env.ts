export const env = {
  MONGO_URI: process.env.MONGO_URI,
  CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
  R2_BUCKET_NAME: process.env.R2_BUCKET_NAME,
  R2_PUBLIC_URL: process.env.R2_PUBLIC_URL,
}

export const requireEnv = {
  MONGO_URI: (): string => {
    if (!env.MONGO_URI) throw new Error('MONGO_URI is required but not set')
    return env.MONGO_URI
  },
  CLERK_SECRET_KEY: (): string => {
    if (!env.CLERK_SECRET_KEY) throw new Error('CLERK_SECRET_KEY is required but not set')
    return env.CLERK_SECRET_KEY
  },
  R2_ACCOUNT_ID: (): string => {
    if (!env.R2_ACCOUNT_ID) throw new Error('R2_ACCOUNT_ID is required but not set')
    return env.R2_ACCOUNT_ID
  },
  R2_ACCESS_KEY_ID: (): string => {
    if (!env.R2_ACCESS_KEY_ID) throw new Error('R2_ACCESS_KEY_ID is required but not set')
    return env.R2_ACCESS_KEY_ID
  },
  R2_SECRET_ACCESS_KEY: (): string => {
    if (!env.R2_SECRET_ACCESS_KEY) throw new Error('R2_SECRET_ACCESS_KEY is required but not set')
    return env.R2_SECRET_ACCESS_KEY
  },
  R2_BUCKET_NAME: (): string => {
    if (!env.R2_BUCKET_NAME) throw new Error('R2_BUCKET_NAME is required but not set')
    return env.R2_BUCKET_NAME
  },
  R2_PUBLIC_URL: (): string => {
    if (!env.R2_PUBLIC_URL) throw new Error('R2_PUBLIC_URL is required but not set')
    return env.R2_PUBLIC_URL
  },
}
