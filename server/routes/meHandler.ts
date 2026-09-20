import type { Request, Response } from 'express'
import { AuthUnauthorizedError, verifyAuth } from '../auth'
import { userService } from '../services/UserService'

export const meHandler = async (req: Request, res: Response): Promise<void> => {
  let clerkId: string
  try {
    clerkId = await verifyAuth(req.headers.authorization)
  } catch (err) {
    if (err instanceof AuthUnauthorizedError) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    console.error('me auth failed:', err)
    res.status(500).json({ error: 'Internal server error' })
    return
  }

  try {
    const user = await userService.getOrCreateUser(clerkId)
    res.status(200).json({
      clerkId: user.clerkId,
      displayName: user.displayName,
      settings: user.settings,
    })
  } catch (err) {
    console.error('Failed to get or create user', err)
    res.status(500).json({ error: 'Internal server error' })
  }
}
