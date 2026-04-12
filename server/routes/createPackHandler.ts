import type { Request, Response } from 'express'
import { AuthUnauthorizedError, verifyAuth } from '../auth'
import { packService } from '../services/PackService'

export const createPackHandler = async (req: Request, res: Response): Promise<void> => {
  let userId: string
  try {
    userId = await verifyAuth(req.headers.authorization)
  } catch (err) {
    if (err instanceof AuthUnauthorizedError) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    console.error('auth failed:', err)
    res.status(500).json({ error: 'Internal server error' })
    return
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {}
  const { name, description, isPremium, price } = body as Record<string, unknown>

  if (!name || typeof name !== 'string' || !name.trim()) {
    res.status(400).json({ error: 'name is required' })
    return
  }

  let normalizedPrice: number | undefined
  if (typeof price === 'number') {
    if (!Number.isFinite(price) || price < 0) {
      res.status(400).json({ error: 'price must be a finite non-negative number' })
      return
    }
    normalizedPrice = price
  } else if (price !== undefined && price !== null) {
    res.status(400).json({ error: 'price must be a finite non-negative number' })
    return
  }

  try {
    const pack = await packService.createPack({
      name: name.trim(),
      userId,
      description: typeof description === 'string' ? description.trim() : undefined,
      isPremium: isPremium === true,
      price: normalizedPrice,
    })
    res.status(201).json({ id: pack._id, name: pack.name, slug: pack.slug })
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string }
    if (e.status === 400) {
      res.status(400).json({ error: e.message })
    } else if (e.status === 409) {
      res.status(409).json({ error: e.message })
    } else {
      console.error('Failed to create pack', err)
      res.status(500).json({ error: 'Internal server error' })
    }
  }
}
