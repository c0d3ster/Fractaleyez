import { createClerkClient } from '@clerk/backend'
import { requireEnv } from './env'

let clerkClient: ReturnType<typeof createClerkClient> | null = null

/** One Clerk backend client per process, made on first use (the secret key is read then, not at import). */
export const getClerkClient = (): ReturnType<typeof createClerkClient> => {
  clerkClient ??= createClerkClient({ secretKey: requireEnv.CLERK_SECRET_KEY() })
  return clerkClient
}
