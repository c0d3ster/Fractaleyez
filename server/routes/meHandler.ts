import type { Request, Response } from 'express'
import { AuthUnauthorizedError, verifyAuth } from '../auth'
import { userService } from '../services/UserService'
import { UserSettings } from '../models/User'

// Mirrors src/config/visualizer.config.ts's PARTICLE_CROSSFADE_DURATION_MIN_MS/MAX_MS.
const CROSSFADE_DURATION_MIN_MS = 200
const CROSSFADE_DURATION_MAX_MS = 2000
// Comfortably above an R2 object URL's length; just a ceiling against garbage input.
const MAX_LOGO_PARTICLE_URL_LENGTH = 2048
// Mirrors FrequencyHud.tsx's VISIBLE_BANDS plus headroom for hidden high bands.
const MAX_HUD_FREQ_BANDS = 16

const isValidLogoParticle = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= MAX_LOGO_PARTICLE_URL_LENGTH &&
  !value.startsWith('data:')

const isValidHud = (value: unknown): value is NonNullable<UserSettings['hud']> => {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  if (!('enabledFreqBands' in candidate)) return true
  const bands = candidate.enabledFreqBands
  return Array.isArray(bands) && bands.length <= MAX_HUD_FREQ_BANDS && bands.every((b) => typeof b === 'boolean')
}

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

export const updateMeHandler = async (req: Request, res: Response): Promise<void> => {
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

  const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {}
  const patch: Partial<UserSettings> = {}

  if ('crossfadeDurationMs' in body) {
    const value = body.crossfadeDurationMs
    if (typeof value !== 'number' || !Number.isFinite(value) || value < CROSSFADE_DURATION_MIN_MS || value > CROSSFADE_DURATION_MAX_MS) {
      res.status(400).json({ error: `crossfadeDurationMs must be a number between ${CROSSFADE_DURATION_MIN_MS} and ${CROSSFADE_DURATION_MAX_MS}` })
      return
    }
    patch.crossfadeDurationMs = value
  }

  if ('logoParticle' in body) {
    if (!isValidLogoParticle(body.logoParticle)) {
      res.status(400).json({ error: 'logoParticle must be a non-empty URL string (not a data: URL)' })
      return
    }
    patch.logoParticle = body.logoParticle
  }

  if ('hud' in body) {
    if (!isValidHud(body.hud)) {
      res.status(400).json({ error: 'hud.enabledFreqBands must be an array of booleans' })
      return
    }
    patch.hud = body.hud
  }

  if (Object.keys(patch).length === 0) {
    res.status(400).json({ error: 'No valid settings fields provided' })
    return
  }

  try {
    const user = await userService.updateSettings(clerkId, patch)
    res.status(200).json({ clerkId: user.clerkId, displayName: user.displayName, settings: user.settings })
  } catch (err) {
    console.error('Failed to update user settings', err)
    res.status(500).json({ error: 'Internal server error' })
  }
}
