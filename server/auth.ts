import { verifyToken } from '@clerk/backend'
import { requireEnv } from './env'

/** Thrown only for missing/invalid bearer credentials — callers may map this to 401. */
export class AuthUnauthorizedError extends Error {
  constructor(message = 'Unauthorized') {
    super(message)
    this.name = 'AuthUnauthorizedError'
  }
}

export const verifyAuth = async (authHeader: string | undefined): Promise<string> => {
  const secretKey = requireEnv.CLERK_SECRET_KEY()
  if (!authHeader?.startsWith('Bearer ')) throw new AuthUnauthorizedError()
  const token = authHeader.slice(7)
  try {
    const payload = await verifyToken(token, { secretKey })
    return payload.sub
  } catch {
    throw new AuthUnauthorizedError()
  }
}
