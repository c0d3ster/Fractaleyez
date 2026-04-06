import { verifyToken } from '@clerk/backend'
import { requireEnv } from './env'

export const verifyAuth = async (authHeader: string | undefined): Promise<string> => {
  if (!authHeader?.startsWith('Bearer ')) throw new Error('Unauthorized')
  const token = authHeader.slice(7)
  const payload = await verifyToken(token, { secretKey: requireEnv.CLERK_SECRET_KEY() })
  return payload.sub
}
