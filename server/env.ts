export const env = {
  MONGO_URI: process.env.MONGO_URI,
  CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
  R2_BUCKET_NAME: process.env.R2_BUCKET_NAME,
  R2_PUBLIC_URL: process.env.R2_PUBLIC_URL,
  CLERK_WEBHOOK_SECRET: process.env.CLERK_WEBHOOK_SECRET,
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
  /** Base URL Stripe redirects back to after Checkout and the Portal. Optional: falls back to the request's Origin header. */
  APP_URL: process.env.APP_URL,
  /** `true` turns on Stripe automatic tax in Checkout (address collection plus tax). Off by default: needs Stripe Tax set up first. */
  STRIPE_AUTOMATIC_TAX: process.env.STRIPE_AUTOMATIC_TAX,
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
  CLERK_WEBHOOK_SECRET: (): string => {
    if (!env.CLERK_WEBHOOK_SECRET) throw new Error('CLERK_WEBHOOK_SECRET is required but not set')
    return env.CLERK_WEBHOOK_SECRET
  },
  STRIPE_SECRET_KEY: (): string => {
    if (!env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY is required but not set')
    return env.STRIPE_SECRET_KEY
  },
  STRIPE_WEBHOOK_SECRET: (): string => {
    if (!env.STRIPE_WEBHOOK_SECRET) throw new Error('STRIPE_WEBHOOK_SECRET is required but not set')
    return env.STRIPE_WEBHOOK_SECRET
  },
}
