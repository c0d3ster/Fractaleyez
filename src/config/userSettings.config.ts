import type { QualitySetting } from './quality.config'
import type { ControlsMode } from './mobileControls.config'

/** Mirrors server/models/User.ts's UserSettings shape -- the client-side view of what's persisted per-user. */
export type UserHudSettings = {
  enabledFreqBands?: boolean[]
}

export type UserSettings = {
  crossfadeDurationMs?: number
  logoParticle?: string
  skipRedZoneWarning?: boolean
  quality?: QualitySetting
  /** The mobile shell's on-screen controls (Full, Limited, None). */
  onScreenControls?: ControlsMode
  hud?: UserHudSettings
}

/** Debounce window before an in-flight settings edit (slider drag, HUD band toggle) is PATCHed to the server. */
export const USER_SETTINGS_SAVE_DEBOUNCE_MS = 500
