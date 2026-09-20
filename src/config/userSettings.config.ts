/** Mirrors server/models/User.ts's UserSettings shape -- the client-side view of what's persisted per-user. */
export type UserHudSettings = {
  enabledFreqBands?: boolean[]
}

export type UserSettings = {
  crossfadeDurationMs?: number
  logoParticle?: string
  hud?: UserHudSettings
}

/** Debounce window before an in-flight settings edit (slider drag, HUD band toggle) is PATCHed to the server. */
export const USER_SETTINGS_SAVE_DEBOUNCE_MS = 500
