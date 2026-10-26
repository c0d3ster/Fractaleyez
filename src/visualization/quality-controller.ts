import { AppConfig } from '../config/configDefaults'
import {
  AUTO_EVAL_MS,
  AUTO_TIERS,
  capHidesLoad,
  estimateSceneCost,
  isQualitySetting,
  isQualityTier,
  QUALITY_PROFILES,
  QUALITY_SETTING_DEFAULT,
  QualityProfile,
  QualitySetting,
  QualityTier,
} from '../config/quality.config'
import { QualityGovernor } from './quality-governor'

// Where Auto starts next time: the tier it settled on, so a weak machine does not spend every load stepping down again.
const AUTO_TIER_HINT_KEY = 'autoQualityTier'

type TierListener = (tier: QualityTier, profile: QualityProfile) => void

/** What `window.getQuality` reports, for the perf readout and for the pop-out config window (which reads it through the opener). */
export type QualityStatus = {
  setting: QualitySetting
  tier: QualityTier
  profile: QualityProfile
}

const readTierHint = (): QualityTier => {
  try {
    const stored = window.localStorage.getItem(AUTO_TIER_HINT_KEY)
    if (isQualityTier(stored) && AUTO_TIERS.includes(stored)) return stored
  } catch {
    // Storage can be blocked; Auto then starts at the top.
  }
  return AUTO_TIERS[AUTO_TIERS.length - 1]!
}

const writeTierHint = (tier: QualityTier): void => {
  try {
    window.localStorage.setItem(AUTO_TIER_HINT_KEY, tier)
  } catch {
    // Not worth failing a frame over.
  }
}

/** A rough weight of what the live config draws, for Auto to tell a lighter scene from a heavier one. */
export const readSceneCost = (config: AppConfig): number => {
  const { meta } = config.layers
  const { particlesPerLayer, layers, levels, particleSize } = config.particle
  return estimateSceneCost({
    fractal: meta.fractal.enabled.value,
    orbit: meta.orbit.enabled.value,
    video: meta.video.enabled.value && config.video.clips.length > 0,
    logo: meta.logo.enabled.value,
    glow: config.effects.glow.value,
    kaleidoscope: config.effects.kaleidoscope.value,
    particles: {
      particlesPerLayer: particlesPerLayer.value,
      layers: layers.value,
      levels: levels.value,
      particleSize: particleSize.value,
    },
  })
}

/**
 * The one place that knows which quality tier the visualizer draws at. A fixed setting is that tier; Auto asks the
 * governor, which is fed every display frame's time. Layers and effects subscribe and re-apply their profile when the
 * tier changes.
 */
export class QualityController {
  private setting: QualitySetting = QUALITY_SETTING_DEFAULT
  private tier: QualityTier
  private governor: QualityGovernor
  private readonly listeners = new Set<TierListener>()
  private nextEvalAt = 0

  constructor() {
    const start = readTierHint()
    this.governor = new QualityGovernor(start)
    this.tier = start
  }

  getSetting = (): QualitySetting => this.setting

  getTier = (): QualityTier => this.tier

  getProfile = (): QualityProfile => QUALITY_PROFILES[this.tier]

  getStatus = (): QualityStatus => ({ setting: this.setting, tier: this.tier, profile: this.getProfile() })

  /** Calls `listener` now and again whenever the tier changes. Returns the unsubscribe. */
  subscribe = (listener: TierListener): (() => void) => {
    this.listeners.add(listener)
    listener(this.tier, this.getProfile())
    return () => { this.listeners.delete(listener) }
  }

  /** Picking a tier fixes it. Picking Auto starts the governor over from where it last settled. */
  setSetting = (setting: unknown): void => {
    if (!isQualitySetting(setting) || setting === this.setting) return
    this.setting = setting
    if (setting === 'auto') {
      this.governor = new QualityGovernor(readTierHint())
      this.governor.disturb(performance.now())
      this.setTier(this.governor.getTier())
      return
    }
    this.setTier(setting)
  }

  /** Something other than the scene changed what the frame times mean (a resize, a tab coming back). */
  disturb = (): void => {
    this.governor.disturb(performance.now())
  }

  /** Call once per display frame with the time since the previous one. Auto looks at them in windows of `AUTO_EVAL_MS`. */
  recordFrame = (frameMs: number, now: number): void => {
    if (this.setting !== 'auto') return
    this.governor.push(frameMs)
    if (now < this.nextEvalAt) return
    this.nextEvalAt = now + AUTO_EVAL_MS
    const capped = capHidesLoad(QUALITY_PROFILES[this.tier].frameCapFps)
    const next = this.governor.evaluate(now, readSceneCost(window.config), capped)
    if (next === this.tier) return
    this.setTier(next)
    writeTierHint(next)
  }

  private setTier = (tier: QualityTier): void => {
    if (tier === this.tier) return
    this.tier = tier
    const profile = QUALITY_PROFILES[tier]
    this.listeners.forEach((listener) => listener(tier, profile))
  }
}

export const qualityController = new QualityController()
